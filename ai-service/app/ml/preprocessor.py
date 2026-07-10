"""
Data preprocessing and feature engineering for StockWise demand forecasting.

Pipeline:
  1. Load CSV dataset
  2. Aggregate daily quantity per SKU
  3. Fill missing dates (forward-fill / zero)
  4. Remove duplicates
  5. Engineer time-series features:
       calendar, cyclic encodings, festival proximity,
       lag windows (1–30), rolling statistics, price features, trend

Feature set decisions (validated against dataset analysis):
  - lag-1/2/3 added: lag-1 autocorrelation = 0.767 (strongest predictor)
  - demand_index added: static SKU-level signal, corr=0.68 with quantity (safe — static per SKU)
  - season_encoded added: Autumn mean=57.9 vs Summer=39.7, meaningful signal
  - days_to_dashain / days_to_tihar: dedicated features for Nepal's two biggest
    festivals (2.49× demand multiplier each), beyond the generic proximity feature
  - annual_trend_factor: 4 values (1.0→1.07→1.14→1.21 for 2023-2026),
    derivable at inference as 1.0 + (year-2023)*0.07

Columns explicitly excluded (leakage or redundancy):
  - revenue         : qty × price derivation
  - stock_after     : stock_before − qty (exact derivation)
  - stock_before    : unknown at forecast time
  - unit_price_actual: duplicate of selling_price (corr=0.9995)
  - supplier_lead_time: duplicate of lead_time_days (corr=1.000)
  - discount_pct, payment_method, customer_type: transaction-level, unknowable at t+n
"""
from __future__ import annotations

import math
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# ── Nepal festival calendar ────────────────────────────────────────────────────
# (name, month, day_center, spread_before, spread_after)
_FESTIVALS: list[tuple[str, int, int, int, int]] = [
    ("dashain",          10, 10, 15,  3),
    ("tihar",            10, 25,  7,  2),
    ("chhath",           11,  5,  3,  1),
    ("holi",              3, 18,  3,  1),
    ("nepali_new_year",   4, 14,  3,  2),
    ("buddha_jayanti",    5, 12,  2,  1),
    ("indra_jatra",       9, 20,  5,  2),
    ("teej",              9,  5,  2,  1),
    ("shivaratri",        2, 20,  2,  1),
    ("maghe_sankranti",   1, 15,  2,  1),
    ("christmas",        12, 25,  2,  1),
    ("new_year",          1,  1,  2,  1),
]

# Dashain and Tihar get dedicated proximity columns (2.49× demand multiplier)
_DASHAIN_ANCHOR = (10, 10)   # (month, day_center)
_TIHAR_ANCHOR   = (10, 25)

# Single source of truth for season ordinals.
# _season_from_month() MUST reference these constants — never hardcode integers —
# so training (CSV path) and inference (computed path) stay in sync.
_SEASON_MAP = {"winter": 0, "spring": 1, "summer": 2, "monsoon": 3, "autumn": 4}

Z_95 = 1.645

# ── Feature columns ────────────────────────────────────────────────────────────
TABULAR_FEATURE_COLS: list[str] = [
    # ── calendar ──────────────────────────────────────────────────────────────
    "year", "month", "day_of_month", "day_of_week", "week_of_year", "quarter", "is_weekend",
    "season_encoded",
    # ── cyclic encodings ──────────────────────────────────────────────────────
    "month_sin", "month_cos", "dow_sin", "dow_cos", "week_sin", "week_cos",
    # ── generic festival proximity ────────────────────────────────────────────
    "is_festival", "festival_intensity",
    "days_to_next_festival", "days_since_last_festival",
    # ── Dashain / Tihar dedicated proximity (2.49× demand effect) ─────────────
    "days_to_dashain", "days_to_tihar",
    # ── trend / price / elasticity ────────────────────────────────────────────
    "annual_trend_factor", "price_elasticity_index",
    "buying_price", "selling_price", "margin_pct",
    "demand_index",
    # ── product metadata ──────────────────────────────────────────────────────
    "is_perishable", "lead_time_days",
    # ── lags (lag-1 autocorr = 0.767 — most important feature) ───────────────
    "qty_lag_1", "qty_lag_2", "qty_lag_3",
    "qty_lag_7", "qty_lag_14", "qty_lag_21", "qty_lag_28", "qty_lag_30",
    # ── rolling statistics ────────────────────────────────────────────────────
    "qty_roll_mean_7", "qty_roll_mean_14", "qty_roll_mean_30",
    "qty_roll_std_7",  "qty_roll_std_14",  "qty_roll_std_30",
    "qty_roll_max_7",  "qty_roll_min_7",
    # ── exponential weighted mean ─────────────────────────────────────────────
    "qty_ewm_7", "qty_ewm_14",
]

# LSTM uses a compact normalised feature set (sequence-compatible)
LSTM_FEATURE_COLS: list[str] = [
    "qty_norm",
    "is_weekend",
    "is_festival",
    "festival_intensity",
    "month_sin",
    "month_cos",
    "dow_sin",
    "dow_cos",
    "annual_trend_factor",
    "demand_index",
    "season_encoded",
]

LSTM_SEQ_LEN = 30


# ── helpers ───────────────────────────────────────────────────────────────────

def _cyclic(val: float, period: float) -> tuple[float, float]:
    return math.sin(2 * math.pi * val / period), math.cos(2 * math.pi * val / period)


def _season_from_month(month: int) -> int:
    """
    Nepal season ordinal from calendar month.

    Uses _SEASON_MAP constants to guarantee that inference-time season_encoded
    values match the values produced during training via the CSV 'season' column.
    Previously this function returned 2 for monsoon months (6–8), but
    _SEASON_MAP["monsoon"] = 3 — a systematic feature mismatch between training
    and inference that biased all monsoon-period predictions.
    """
    if month in (12, 1, 2):  return _SEASON_MAP["winter"]   # 0
    if month in (3, 4, 5):   return _SEASON_MAP["spring"]   # 1
    if month in (6, 7, 8):   return _SEASON_MAP["monsoon"]  # 3  ← was 2, now correct
    if month in (9, 10, 11): return _SEASON_MAP["autumn"]   # 4
    return _SEASON_MAP["summer"]   # 2  (fallback, all months covered above)


def _festival_proximity(dt: date) -> tuple[int, int]:
    """(days_since_last_festival, days_to_next_festival) across all 12 festivals."""
    best_past = 365
    best_future = 365
    for _, m, d_center, _, _ in _FESTIVALS:
        for yr_offset in [-1, 0, 1]:
            try:
                anchor = date(dt.year + yr_offset, m, min(d_center, 28))
            except ValueError:
                continue
            delta = (anchor - dt).days
            if delta >= 0:
                best_future = min(best_future, delta)
            else:
                best_past = min(best_past, abs(delta))
    return int(best_past), int(best_future)


def _days_to_festival(dt: date, month: int, day: int) -> int:
    """Days until the next occurrence of a specific festival anchor (month, day)."""
    best = 365
    for yr_offset in [0, 1]:
        try:
            anchor = date(dt.year + yr_offset, month, min(day, 28))
        except ValueError:
            continue
        delta = (anchor - dt).days
        if delta >= 0:
            best = min(best, delta)
    return min(int(best), 90)


def _infer_annual_trend(year: int) -> float:
    """Extrapolate annual_trend_factor beyond training data (base year 2023, +7%/yr)."""
    return round(1.0 + (year - 2023) * 0.07, 4)


# ── main class ────────────────────────────────────────────────────────────────

class DataPreprocessor:
    """Load, clean, and feature-engineer demand data for one or all SKUs."""

    def __init__(self, csv_path: Optional[str] = None):
        self._csv_path = csv_path or os.getenv(
            "TRAINING_DATA_PATH",
            str(Path(__file__).parents[3] / "training_data.csv"),
        )
        self._raw: Optional[pd.DataFrame] = None

    # ── public ────────────────────────────────────────────────────────────────

    def load_raw(self) -> pd.DataFrame:
        """Load CSV, parse dates, cast types. Cached after first call."""
        if self._raw is not None:
            return self._raw

        df = pd.read_csv(self._csv_path, parse_dates=["date"])

        # Fill any rare nulls defensively
        df["festival_intensity"]     = df["festival_intensity"].fillna(1.0)
        df["festival_name"]          = df["festival_name"].fillna("none")
        df["annual_trend_factor"]    = df["annual_trend_factor"].fillna(1.0)
        df["price_elasticity_index"] = df["price_elasticity_index"].fillna(1.0)
        df["demand_index"]           = df["demand_index"].fillna(1.0)

        # Drop confirmed leakage and exact-duplicate columns
        _drop = [c for c in [
            "revenue", "stock_after", "stock_before",
            "unit_price_actual", "supplier_lead_time",
            "discount_pct", "payment_method", "customer_type",
            "invoice_items_count",
        ] if c in df.columns]
        df.drop(columns=_drop, inplace=True)

        df.drop_duplicates(inplace=True)
        self._raw = df
        return df

    def get_sku_list(self) -> list[str]:
        return sorted(self.load_raw()["product_sku"].unique().tolist())

    def get_sku_meta(self, sku_id: str) -> dict:
        """Return static product metadata for a SKU (CSV, falling back to live Mongo data)."""
        df = self.load_raw()
        rows = df[df["product_sku"] == sku_id]
        if rows.empty:
            from app.ml import mongo_products
            return mongo_products.get_product_meta(sku_id)
        r = rows.iloc[0]
        return {
            "product_sku":            sku_id,
            "product_name":           r["product_name"],
            "category":               r["category"],
            "unit":                   r["unit"],
            "is_perishable":          int(r["is_perishable"]),
            "lead_time_days":         int(r["lead_time_days"]),
            "reorder_level":          int(r["reorder_level"]),
            "max_stock":              int(r["max_stock"]),
            "buying_price":           float(r["buying_price"]),
            "selling_price":          float(r["selling_price"]),
            "margin_pct":             float(r["margin_pct"]),
            "price_elasticity_index": float(r["price_elasticity_index"]),
            "demand_index":           float(r["demand_index"]),
            "annual_trend_factor":    float(r["annual_trend_factor"]),
        }

    def build_sku_timeseries(self, sku_id: str) -> pd.DataFrame:
        """
        Aggregate transactions → clean daily series → full feature engineering.

        Returns DataFrame sorted by date with all TABULAR_FEATURE_COLS and
        LSTM_FEATURE_COLS present, dropping initial rows where lag-30 is NaN.

        SKUs not present in the CSV dataset fall back to real MongoDB Sale
        history via app.ml.mongo_products, so any active inventory product
        with enough sales history can be trained/forecasted too.

        NOTE: qty_norm in the returned DataFrame uses the full-dataset qty_max.
        Before training the LSTM, call refit_qty_norm(train_df) to get the
        correct train-only qty_max, then apply_qty_norm(df, qty_max) on both
        train and test splits to avoid data leakage.
        """
        df = self.load_raw()
        sku_df = df[df["product_sku"] == sku_id].copy()
        if sku_df.empty:
            return self._build_live_timeseries(sku_id)

        # ── 1. Aggregate to daily ─────────────────────────────────────────────
        daily = (
            sku_df.groupby("date")
            .agg(
                qty                    = ("quantity",               "sum"),
                is_perishable          = ("is_perishable",          "first"),
                lead_time_days         = ("lead_time_days",         "first"),
                buying_price           = ("buying_price",           "first"),
                selling_price          = ("selling_price",          "first"),
                margin_pct             = ("margin_pct",             "mean"),
                price_elasticity_index = ("price_elasticity_index", "mean"),
                annual_trend_factor    = ("annual_trend_factor",    "mean"),
                demand_index           = ("demand_index",           "first"),
                is_festival            = ("is_festival",            "max"),
                festival_intensity     = ("festival_intensity",     "max"),
                season                 = ("season",                 "first"),
            )
            .reset_index()
            .sort_values("date")
        )

        return self._finish_daily_series(daily)

    def _build_live_timeseries(self, sku_id: str) -> pd.DataFrame:
        """
        Build the same shape of daily series as the CSV path in
        build_sku_timeseries(), sourced from real MongoDB Sale documents.
        """
        from app.ml import mongo_products

        daily = mongo_products.load_daily_series(sku_id)  # columns: date, qty
        meta  = mongo_products.get_product_meta(sku_id)
        for col in [
            "is_perishable", "lead_time_days", "buying_price", "selling_price",
            "margin_pct", "price_elasticity_index", "annual_trend_factor", "demand_index",
        ]:
            daily[col] = meta[col]

        return self._finish_daily_series(daily)

    def _finish_daily_series(self, daily: pd.DataFrame) -> pd.DataFrame:
        """
        Shared tail of the pipeline for both the CSV and live-Mongo sources:
        fill missing calendar dates, engineer calendar/festival/lag/rolling
        features, and drop the warm-up rows where qty_lag_30 is NaN.

        `daily` must have one row per date with 'date', 'qty', and the eight
        static columns already present ('season' / 'is_festival' /
        'festival_intensity' are optional — _add_calendar_features() and
        _add_festival_features() derive them from the date when absent).
        """
        static_cols = [
            "is_perishable", "lead_time_days", "buying_price", "selling_price",
            "margin_pct", "price_elasticity_index", "annual_trend_factor", "demand_index",
        ]

        # ── Fill missing dates ─────────────────────────────────────────────────
        full_range = pd.date_range(daily["date"].min(), daily["date"].max(), freq="D")
        daily = daily.set_index("date").reindex(full_range)
        daily.index.name = "date"
        daily["qty"] = daily["qty"].fillna(0.0)
        for col in static_cols + ["is_festival", "festival_intensity", "season"]:
            if col in daily.columns:
                daily[col] = daily[col].ffill().bfill()
        daily = daily.reset_index()

        # ── Feature engineering ────────────────────────────────────────────────
        daily = self._add_calendar_features(daily)
        daily = self._add_festival_features(daily)
        daily = self._add_lag_rolling_features(daily)
        # qty_norm placeholder (full-series max; replace with refit_qty_norm for training)
        daily = self._add_qty_norm(daily)

        return daily.dropna(subset=["qty_lag_30"]).reset_index(drop=True)

    def prepare_train_test(
        self, sku_df: pd.DataFrame, test_ratio: float = 0.2
    ) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Chronological 80/20 split (no shuffling — respects temporal order)."""
        n = len(sku_df)
        split = max(30, int(n * (1 - test_ratio)))
        return sku_df.iloc[:split].copy(), sku_df.iloc[split:].copy()

    @staticmethod
    def refit_qty_norm(
        train_df: pd.DataFrame,
        test_df: pd.DataFrame,
    ) -> tuple[pd.DataFrame, pd.DataFrame, float]:
        """
        Recompute qty_norm using only the training split's maximum quantity.

        This prevents data leakage: the original build_sku_timeseries() uses the
        full-dataset max to normalise, which means the test set's peak demand
        influences the training-set normalisation. Calling this method after
        prepare_train_test() gives a leakage-free qty_norm for both splits.

        Returns (train_df_fixed, test_df_fixed, qty_max).
        """
        qty_max = float(train_df["qty"].max()) or 1.0
        train_df = train_df.copy()
        test_df  = test_df.copy()
        train_df["qty_norm"] = train_df["qty"] / qty_max
        test_df["qty_norm"]  = test_df["qty"]  / qty_max
        return train_df, test_df, qty_max

    def build_tabular_xy(
        self, df: pd.DataFrame
    ) -> tuple[np.ndarray, np.ndarray]:
        X = df[TABULAR_FEATURE_COLS].values.astype(np.float32)
        y = df["qty"].values.astype(np.float32)
        return X, y

    def build_lstm_sequences(
        self, df: pd.DataFrame, seq_len: int = LSTM_SEQ_LEN
    ) -> tuple[np.ndarray, np.ndarray]:
        """Build (X, y) sequences for LSTM. X shape: (n, seq_len, n_features)."""
        feat = df[LSTM_FEATURE_COLS].values.astype(np.float32)
        qty  = df["qty"].values.astype(np.float32)
        X, y = [], []
        for i in range(seq_len, len(feat)):
            X.append(feat[i - seq_len : i])
            y.append(qty[i])
        return np.array(X), np.array(y)

    # ── feature engineering helpers ───────────────────────────────────────────

    def _add_calendar_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df["year"]         = df["date"].dt.year
        df["month"]        = df["date"].dt.month
        df["day_of_month"] = df["date"].dt.day
        df["day_of_week"]  = df["date"].dt.dayofweek
        df["week_of_year"] = df["date"].dt.isocalendar().week.astype(int)
        df["quarter"]      = df["date"].dt.quarter
        df["is_weekend"]   = (df["day_of_week"] >= 5).astype(int)

        # Season ordinal.  When the CSV's "season" column is present, use
        # _SEASON_MAP for encoding.  For inference rows without the column,
        # _season_from_month() now references the same _SEASON_MAP constants
        # to guarantee consistent encoding across both paths.
        if "season" in df.columns:
            df["season_encoded"] = df["season"].map(_SEASON_MAP).fillna(2).astype(int)
        else:
            df["season_encoded"] = df["month"].apply(_season_from_month)

        df["month_sin"], df["month_cos"] = zip(
            *df["month"].apply(lambda m: _cyclic(m, 12))
        )
        df["dow_sin"], df["dow_cos"] = zip(
            *df["day_of_week"].apply(lambda d: _cyclic(d, 7))
        )
        df["week_sin"], df["week_cos"] = zip(
            *df["week_of_year"].apply(lambda w: _cyclic(w, 52))
        )
        return df

    def _add_festival_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Compute generic festival proximity and Dashain/Tihar dedicated columns.

        Vectorized implementation using numpy broadcasting — replaces the previous
        row-by-row .apply(_festival_proximity) which was O(n × 36 Python loops).
        The new approach precomputes all festival anchor dates once, then uses a
        (n_dates × n_anchors) numpy delta matrix, reducing to pure numpy ops.
        Typically 30-60× faster on multi-year series.
        """
        dates = df["date"].dt.date.values  # numpy object array of date objects

        # ── 1. All-festival proximity (vectorized) ────────────────────────────
        years_in_data = set(d.year for d in dates)
        anchor_list: list[date] = []
        for _, m, d_center, _, _ in _FESTIVALS:
            for yr in years_in_data:
                for offset in (-1, 0, 1):
                    try:
                        anchor_list.append(date(yr + offset, m, min(d_center, 28)))
                    except ValueError:
                        pass
        anchor_list = list(set(anchor_list))

        # Convert to integer days-since-epoch for numpy broadcasting
        _epoch = date(1970, 1, 1)
        dates_int    = np.array([(d - _epoch).days for d in dates],       dtype=np.int32)
        anchors_int  = np.array([(a - _epoch).days for a in anchor_list], dtype=np.int32)

        # delta[i, j] = anchor_j − date_i  →  positive means date_i is before anchor_j
        delta = anchors_int[np.newaxis, :] - dates_int[:, np.newaxis]   # (n_dates, n_anchors)

        future_dist = np.where(delta >= 0, delta, 999).min(axis=1).clip(0, 365).astype(np.int32)
        past_dist   = np.where(delta <  0, -delta, 999).min(axis=1).clip(0, 365).astype(np.int32)

        df["days_since_last_festival"] = np.minimum(past_dist,   60)
        df["days_to_next_festival"]    = np.minimum(future_dist, 60)

        if "is_festival" not in df.columns:
            df["is_festival"] = (df["days_to_next_festival"] <= 7).astype(int)
        if "festival_intensity" not in df.columns:
            df["festival_intensity"] = 1.0 + df["is_festival"].astype(float) * 0.5

        # ── 2. Dashain / Tihar dedicated proximity (vectorized) ───────────────
        for col_name, (f_month, f_day) in [
            ("days_to_dashain", _DASHAIN_ANCHOR),
            ("days_to_tihar",   _TIHAR_ANCHOR),
        ]:
            anchors_specific: list[date] = []
            for yr in years_in_data:
                for offset in (0, 1):
                    try:
                        anchors_specific.append(date(yr + offset, f_month, min(f_day, 28)))
                    except ValueError:
                        pass
            anch_int = np.array(
                [(a - _epoch).days for a in set(anchors_specific)], dtype=np.int32
            )
            d_delta = anch_int[np.newaxis, :] - dates_int[:, np.newaxis]
            df[col_name] = np.where(d_delta >= 0, d_delta, 999).min(axis=1).clip(0, 90).astype(np.int32)

        return df

    def _add_lag_rolling_features(self, df: pd.DataFrame) -> pd.DataFrame:
        s = df["qty"]

        # Short lags (lag-1 autocorr=0.767 is the strongest single feature)
        for lag in [1, 2, 3, 7, 14, 21, 28, 30]:
            df[f"qty_lag_{lag}"] = s.shift(lag)

        # Rolling stats shifted by 1 to prevent same-day look-ahead leakage.
        # ddof=1 (default in pandas) kept consistent with numpy ddof=1 used in inference.
        for win in [7, 14, 30]:
            rolled = s.shift(1).rolling(win, min_periods=max(1, win // 2))
            df[f"qty_roll_mean_{win}"] = rolled.mean()
            df[f"qty_roll_std_{win}"]  = rolled.std()   # ddof=1 (pandas default)

        df["qty_roll_max_7"] = s.shift(1).rolling(7, min_periods=1).max()
        df["qty_roll_min_7"] = s.shift(1).rolling(7, min_periods=1).min()
        df["qty_ewm_7"]      = s.shift(1).ewm(span=7,  adjust=False).mean()
        df["qty_ewm_14"]     = s.shift(1).ewm(span=14, adjust=False).mean()

        # Replace NaN std (single-element window) with 0 for stability
        for win in [7, 14, 30]:
            df[f"qty_roll_std_{win}"] = df[f"qty_roll_std_{win}"].fillna(0.0)

        return df

    def _add_qty_norm(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Add qty_norm using the full-DataFrame max (placeholder for build_sku_timeseries).
        Before training the LSTM, replace with refit_qty_norm() to avoid leakage.
        """
        qty_max = df["qty"].max()
        df["qty_norm"] = (df["qty"] / qty_max) if qty_max > 0 else 0.0
        return df

    # ── inference feature builder ──────────────────────────────────────────────

    def build_future_tabular_rows(
        self,
        last_known_dates: pd.DatetimeIndex,
        last_known_qty: np.ndarray,
        sku_meta: dict,
        horizon_days: int,
    ) -> pd.DataFrame:
        """
        Construct feature rows for future dates for recursive tabular inference.

        Only calendar, festival, and static SKU features are built here.
        Lag and rolling columns are initialised to 0.0 — they are overwritten
        step-by-step in DemandPredictor._patch_tabular_row() with the actual
        accumulated predictions.  Building accurate lags here would require the
        exact predictions we haven't made yet, so the two-phase approach (build
        skeleton here, patch lags in predictor) is the correct pattern.
        """
        last_date = last_known_dates[-1]
        rows: list[dict] = []

        for i in range(1, horizon_days + 1):
            fd: date = (last_date + pd.Timedelta(days=i)).date()
            dt_ts    = pd.Timestamp(fd)

            ms, mc = _cyclic(fd.month, 12)
            ds, dc = _cyclic(fd.weekday(), 7)
            ws, wc = _cyclic(dt_ts.isocalendar()[1], 52)
            past, future = _festival_proximity(fd)

            year = fd.year
            row: dict = {
                # calendar
                "year":          year,
                "month":         fd.month,
                "day_of_month":  fd.day,
                "day_of_week":   fd.weekday(),
                "week_of_year":  dt_ts.isocalendar()[1],
                "quarter":       (fd.month - 1) // 3 + 1,
                "is_weekend":    int(fd.weekday() >= 5),
                # season_encoded — uses _SEASON_MAP constants, same as training
                "season_encoded": _season_from_month(fd.month),
                # cyclic
                "month_sin": ms, "month_cos": mc,
                "dow_sin":   ds, "dow_cos":   dc,
                "week_sin":  ws, "week_cos":  wc,
                # festival
                "is_festival":              int(future <= 7 or past <= 3),
                "festival_intensity":       1.5 if (future <= 7 or past <= 3) else 1.0,
                "days_to_next_festival":    min(future, 60),
                "days_since_last_festival": min(past, 60),
                "days_to_dashain":          _days_to_festival(fd, *_DASHAIN_ANCHOR),
                "days_to_tihar":            _days_to_festival(fd, *_TIHAR_ANCHOR),
                # trend / price
                "annual_trend_factor":    sku_meta.get("annual_trend_factor") or _infer_annual_trend(year),
                "price_elasticity_index": sku_meta.get("price_elasticity_index", 1.0),
                "buying_price":           sku_meta.get("buying_price",   100.0),
                "selling_price":          sku_meta.get("selling_price",  120.0),
                "margin_pct":             sku_meta.get("margin_pct",      20.0),
                "demand_index":           sku_meta.get("demand_index",     0.5),
                # product
                "is_perishable":  sku_meta.get("is_perishable",  0),
                "lead_time_days": sku_meta.get("lead_time_days", 7),
                # ── lag / rolling features: 0.0 placeholder ──────────────────
                # DemandPredictor._patch_tabular_row() overwrites these with
                # the correct values from its accumulated prediction history.
                "qty_lag_1": 0.0,  "qty_lag_2": 0.0,  "qty_lag_3": 0.0,
                "qty_lag_7": 0.0,  "qty_lag_14": 0.0, "qty_lag_21": 0.0,
                "qty_lag_28": 0.0, "qty_lag_30": 0.0,
                "qty_roll_mean_7":  0.0, "qty_roll_mean_14": 0.0, "qty_roll_mean_30": 0.0,
                "qty_roll_std_7":   0.0, "qty_roll_std_14":  0.0, "qty_roll_std_30":  0.0,
                "qty_roll_max_7":   0.0, "qty_roll_min_7":   0.0,
                "qty_ewm_7":        0.0, "qty_ewm_14":       0.0,
                # internal marker (not a model feature)
                "_future_date": str(fd),
            }
            rows.append(row)

        return pd.DataFrame(rows)
