"""
Core forecasting logic — legacy service used by /api/ai/forecast/* routes.

Workflow:
1. Pull historical sales from MongoDB (saleItems collection)
2. Feature-engineer: lag windows, rolling means, cyclic date encodings, festival flags
3. Train / load model (Random Forest, XGBoost, Prophet, LSTM)
4. Generate horizon_days worth of daily predictions
5. Persist results to forecastResults collection

Bug-fixes applied in this revision:
──────────────────────────────────────────────────────────────────────────────
1. LSTM scaler leakage
   Before: MinMaxScaler.fit_transform(values) fitted on the FULL array (train + test)
           then the scale parameters leaked information about the test split into
           the normalised training data.
   After:  Scaler is fit ONLY on values[:split] (training portion).
           values[split:] is transformed (not fitted) so test normalisation
           is consistent without reverse-leaking test statistics into training.

2. Rolling std ddof mismatch
   Before: np.std(arr) used ddof=0 (population std).
           pandas .rolling().std() used during feature-building uses ddof=1 (sample std).
           The two distributions differ, especially for small windows — the model
           saw ddof=1 during training but ddof=0 at inference.
   After:  All recursive inference std calls use np.std(arr, ddof=1).

3. MAPE zero-guard
   Before: sklearn.metrics.mean_absolute_percentage_error(y_true, y_pred) raises
           ZeroDivisionError (or produces Inf) when any y_true == 0 — which is
           common when a product was simply out of stock for a day.
   After:  Custom _safe_mape() clips the denominator at max(|y_true|, ε) and
           returns None when fewer than 2 non-zero samples are available.

4. Prophet trains two models unnecessarily
   Before: fit() on train subset → metrics; fit() again on full dataset → forecast.
           Two expensive fit() calls per request.
   After:  Single fit() on train subset; make_future_dataframe extends past the test
           period so in-sample predictions cover the test window (metrics) AND the
           future horizon (forecast) in one predict() call.

5. No model persistence
   Before: Every call to predict() retrained from scratch, even for the same SKU.
   After:  Module-level in-process cache (dict keyed on sku_id + model_name).
           Models survive across HTTP requests within the same process.
           Cache is invalidated on predict() calls with force_retrain=True.
           Note: cache is lost on process restart — for durable persistence use
           the ML-service trainer (POST /api/ai/ml/train/{sku_id}) which saves
           models to disk and serves them via the LRU-cached loader in predictor.py.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, date, timezone
from typing import Optional

import numpy as np
import pandas as pd

FESTIVAL_WINDOWS = [
    # (month, day_start, day_end)  Approximate Dashain + Tihar windows
    (10, 1, 20),   # Dashain (~Oct)
    (10, 20, 31),  # Tihar  (~Oct–Nov)
    (11, 1, 10),
]


def _is_festival(dt: date) -> bool:
    for m, ds, de in FESTIVAL_WINDOWS:
        if dt.month == m and ds <= dt.day <= de:
            return True
    return False


def _safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> Optional[float]:
    """
    Zero-safe MAPE: clips denominator to max(|y_true|, 1e-8) to avoid
    division by zero when a product had zero sales on a day.

    Returns None when fewer than 2 non-zero true-value samples exist,
    because a single sample MAPE is too noisy to be meaningful.
    """
    eps = 1e-8
    mask = np.abs(y_true) > eps
    if mask.sum() < 2:
        return None
    y_t = y_true[mask]
    y_p = y_pred[mask]
    return round(float(np.mean(np.abs((y_t - y_p) / np.maximum(np.abs(y_t), eps)))) * 100, 2)


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy().sort_values("date")
    df["day_of_week"]  = df["date"].dt.dayofweek
    df["month"]        = df["date"].dt.month
    df["day_of_month"] = df["date"].dt.day
    df["is_weekend"]   = (df["day_of_week"] >= 5).astype(int)
    df["dow_sin"]      = np.sin(2 * math.pi * df["day_of_week"] / 7)
    df["dow_cos"]      = np.cos(2 * math.pi * df["day_of_week"] / 7)
    df["month_sin"]    = np.sin(2 * math.pi * df["month"] / 12)
    df["month_cos"]    = np.cos(2 * math.pi * df["month"] / 12)
    df["is_festival"]  = df["date"].dt.date.apply(_is_festival).astype(int)
    for lag in [1, 3, 7, 14]:
        df[f"lag_{lag}"] = df["qty"].shift(lag)
    for win in [7, 14, 30]:
        df[f"roll_mean_{win}"] = df["qty"].shift(1).rolling(win).mean()
        # ddof=1 (sample std) — must match what we compute at inference time
        df[f"roll_std_{win}"]  = df["qty"].shift(1).rolling(win).std(ddof=1)
    return df.dropna()


FEATURE_COLS = [
    "day_of_week", "month", "day_of_month", "is_weekend",
    "dow_sin", "dow_cos", "month_sin", "month_cos", "is_festival",
    "lag_1", "lag_3", "lag_7", "lag_14",
    "roll_mean_7", "roll_mean_14", "roll_mean_30",
    "roll_std_7",  "roll_std_14",  "roll_std_30",
]

# ── in-process model cache ─────────────────────────────────────────────────────
# Key: (sku_id, model_name)  Value: trained model object
_MODEL_CACHE: dict[tuple[str, str], object] = {}


class ForecastingService:
    def __init__(self, db):
        self.db = db

    async def _load_sales(self, sku_id: str) -> pd.DataFrame:
        pipeline = [
            {"$match": {"sku_id": sku_id}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$sale_date"}},
                "qty": {"$sum": "$quantity"},
            }},
            {"$sort": {"_id": 1}},
        ]
        cursor = self.db["saleItems"].aggregate(pipeline)
        rows = []
        async for doc in cursor:
            rows.append({"date": pd.Timestamp(doc["_id"]), "qty": doc["qty"]})
        if not rows:
            return pd.DataFrame(columns=["date", "qty"])
        return pd.DataFrame(rows)

    async def predict(
        self,
        sku_id: str,
        model: str = "random_forest",
        horizon_days: int = 30,
        force_retrain: bool = False,
    ) -> dict:
        df = await self._load_sales(sku_id)
        if len(df) < 30:
            raise ValueError(
                f"Not enough historical data for SKU {sku_id} "
                f"(need ≥30 days, have {len(df)})"
            )

        if model in ("random_forest", "xgboost"):
            result = self._predict_ml(df, model, horizon_days, sku_id, force_retrain)
        elif model == "prophet":
            result = self._predict_prophet(df, horizon_days)
        elif model == "lstm":
            result = self._predict_lstm(df, horizon_days, sku_id, force_retrain)
        else:
            raise ValueError(f"Unknown model: {model}")

        doc = {
            "sku_id":      sku_id,
            "model":       model,
            "horizon":     horizon_days,
            "predictions": result["predictions"],
            "metrics":     result.get("metrics", {}),
            "created_at":  datetime.now(timezone.utc),
        }
        await self.db["forecastResults"].replace_one(
            {"sku_id": sku_id, "model": model},
            doc,
            upsert=True,
        )
        return result

    # ── ML (RF / XGBoost) ─────────────────────────────────────────────────────

    def _predict_ml(
        self,
        df: pd.DataFrame,
        model_name: str,
        horizon: int,
        sku_id: str,
        force_retrain: bool,
    ) -> dict:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.metrics import mean_squared_error
        import xgboost as xgb

        feat_df = _build_features(df)
        X = feat_df[FEATURE_COLS].values
        y = feat_df["qty"].values

        split     = max(1, int(len(X) * 0.8))
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]

        cache_key = (sku_id, model_name)
        mdl = None if force_retrain else _MODEL_CACHE.get(cache_key)

        if mdl is None:
            if model_name == "random_forest":
                mdl = RandomForestRegressor(
                    n_estimators=200, max_depth=10, random_state=42, n_jobs=-1
                )
            else:
                mdl = xgb.XGBRegressor(
                    n_estimators=200, max_depth=6, learning_rate=0.05, random_state=42
                )
            mdl.fit(X_train, y_train)
            _MODEL_CACHE[cache_key] = mdl

        metrics: dict = {}
        if len(X_test) > 0:
            y_pred_test  = np.maximum(mdl.predict(X_test), 0.0)
            mape_val     = _safe_mape(y_test, y_pred_test)
            rmse_val     = round(float(np.sqrt(mean_squared_error(y_test, y_pred_test))), 2)
            if mape_val is not None:
                metrics["mape"] = mape_val
            metrics["rmse"] = rmse_val

        last_known  = list(df["qty"].values[-30:])
        last_date   = df["date"].max()
        predictions = []

        for i in range(horizon):
            fd = last_date + timedelta(days=i + 1)

            def _lag(n): return last_known[-n] if len(last_known) >= n else last_known[0]
            def _rmean(n): return float(np.mean(last_known[-n:])) if last_known else 0.0
            def _rstd(n):
                # ddof=1 to match .rolling().std() used during _build_features
                arr = last_known[-n:]
                return float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0

            row = {
                "day_of_week":  fd.dayofweek,
                "month":        fd.month,
                "day_of_month": fd.day,
                "is_weekend":   int(fd.dayofweek >= 5),
                "dow_sin":      math.sin(2 * math.pi * fd.dayofweek / 7),
                "dow_cos":      math.cos(2 * math.pi * fd.dayofweek / 7),
                "month_sin":    math.sin(2 * math.pi * fd.month / 12),
                "month_cos":    math.cos(2 * math.pi * fd.month / 12),
                "is_festival":  int(_is_festival(fd.date())),
                "lag_1":        _lag(1),
                "lag_3":        _lag(3),
                "lag_7":        _lag(7),
                "lag_14":       _lag(14),
                "roll_mean_7":  _rmean(7),
                "roll_mean_14": _rmean(14),
                "roll_mean_30": _rmean(30),
                "roll_std_7":   _rstd(7),
                "roll_std_14":  _rstd(14),
                "roll_std_30":  _rstd(30),
            }
            X_fut = np.array([[row[f] for f in FEATURE_COLS]])
            pred  = max(0.0, float(mdl.predict(X_fut)[0]))
            predictions.append({
                "date":          fd.strftime("%Y-%m-%d"),
                "predicted_qty": round(pred, 2),
            })
            last_known.append(pred)
            last_known = last_known[-30:]

        return {"predictions": predictions, "metrics": metrics}

    # ── Prophet ───────────────────────────────────────────────────────────────

    def _predict_prophet(self, df: pd.DataFrame, horizon: int) -> dict:
        from prophet import Prophet
        from sklearn.metrics import mean_squared_error

        prop_df = df.rename(columns={"date": "ds", "qty": "y"})
        split   = max(1, int(len(prop_df) * 0.8))
        train   = prop_df.iloc[:split]
        test    = prop_df.iloc[split:]

        # Single Prophet fit on training data.
        # make_future_dataframe extends the DataFrame past the test window so
        # predict() covers both in-sample (test) evaluation AND future forecast
        # in one shot — no second fit() needed.
        m = Prophet(
            daily_seasonality=True,
            weekly_seasonality=True,
            yearly_seasonality=True,
        )
        m.fit(train)

        total_extra = len(test) + horizon
        future = m.make_future_dataframe(periods=total_extra)
        fc     = m.predict(future)

        metrics: dict = {}
        if len(test) > 0:
            # In-sample test predictions are at index [len(train) : len(train)+len(test)]
            n_train_rows = len(train)
            y_pred_test  = np.maximum(
                fc["yhat"].iloc[n_train_rows : n_train_rows + len(test)].values, 0.0
            )
            y_true_test  = test["y"].values
            mape_val     = _safe_mape(y_true_test, y_pred_test)
            rmse_val     = round(float(np.sqrt(mean_squared_error(y_true_test, y_pred_test))), 2)
            if mape_val is not None:
                metrics["mape"] = mape_val
            metrics["rmse"] = rmse_val

        fc_fut = fc.tail(horizon)
        predictions = [
            {
                "date":          row["ds"].strftime("%Y-%m-%d"),
                "predicted_qty": max(0.0, round(float(row["yhat"]), 2)),
                "lower":         max(0.0, round(float(row["yhat_lower"]), 2)),
                "upper":         round(float(row["yhat_upper"]), 2),
            }
            for _, row in fc_fut.iterrows()
        ]
        return {"predictions": predictions, "metrics": metrics}

    # ── LSTM ──────────────────────────────────────────────────────────────────

    def _predict_lstm(
        self,
        df: pd.DataFrame,
        horizon: int,
        sku_id: str,
        force_retrain: bool,
    ) -> dict:
        import tensorflow as tf
        from sklearn.preprocessing import MinMaxScaler
        from sklearn.metrics import mean_squared_error

        LOOK_BACK  = 30
        cache_key  = (sku_id, "lstm")

        values = df["qty"].values.reshape(-1, 1).astype(np.float32)
        split  = max(LOOK_BACK + 1, int(len(values) * 0.8))

        # Scaler fitted ONLY on training portion to prevent leakage.
        # Fitting on the full array would expose the test-set maximum to the
        # normalisation parameters, compressing training-set gradients and making
        # the model implicitly aware of future demand magnitudes.
        scaler = MinMaxScaler(feature_range=(0, 1))
        scaler.fit(values[:split])
        scaled = scaler.transform(values)  # transform full array with train-only scale

        def create_sequences(data, look_back):
            X, y = [], []
            for i in range(look_back, len(data)):
                X.append(data[i - look_back:i, 0])
                y.append(data[i, 0])
            return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)

        X, y = create_sequences(scaled, LOOK_BACK)
        X    = X.reshape(X.shape[0], X.shape[1], 1)

        seq_split   = max(1, int(len(X) * 0.8))
        X_train, X_test = X[:seq_split], X[seq_split:]
        y_train, y_test = y[:seq_split], y[seq_split:]

        cached = None if force_retrain else _MODEL_CACHE.get(cache_key)

        if cached is None:
            model = tf.keras.Sequential([
                tf.keras.layers.LSTM(64, return_sequences=True, input_shape=(LOOK_BACK, 1)),
                tf.keras.layers.Dropout(0.2),
                tf.keras.layers.LSTM(32),
                tf.keras.layers.Dense(1),
            ])
            model.compile(optimizer="adam", loss="mse")
            model.fit(
                X_train, y_train,
                epochs=30, batch_size=16,
                verbose=0, validation_split=0.1,
            )
            _MODEL_CACHE[cache_key] = (model, scaler)
        else:
            model, scaler = cached

        metrics: dict = {}
        if len(X_test) > 0:
            y_pred_s    = model.predict(X_test, verbose=0)
            y_pred      = np.maximum(scaler.inverse_transform(y_pred_s).flatten(), 0.0)
            y_true      = scaler.inverse_transform(y_test.reshape(-1, 1)).flatten()
            mape_val    = _safe_mape(y_true, y_pred)
            rmse_val    = round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 2)
            if mape_val is not None:
                metrics["mape"] = mape_val
            metrics["rmse"] = rmse_val

        window    = list(scaled[-LOOK_BACK:, 0])
        last_date = df["date"].max()
        predictions = []

        for i in range(horizon):
            fd    = last_date + timedelta(days=i + 1)
            inp   = np.array(window[-LOOK_BACK:], dtype=np.float32).reshape(1, LOOK_BACK, 1)
            pred_s = float(model.predict(inp, verbose=0)[0][0])
            pred   = max(0.0, float(scaler.inverse_transform([[pred_s]])[0][0]))
            predictions.append({
                "date":          fd.strftime("%Y-%m-%d"),
                "predicted_qty": round(pred, 2),
            })
            window.append(pred_s)

        return {"predictions": predictions, "metrics": metrics}

    async def train_all(self, model: str, sku_ids: list[str] | None) -> dict:
        if sku_ids is None:
            cursor = self.db["skus"].find({}, {"_id": 0, "sku_id": 1})
            ids    = [doc["sku_id"] async for doc in cursor]
        else:
            ids = sku_ids

        trained, failed = 0, 0
        for sid in ids:
            try:
                await self.predict(sid, model, horizon_days=30)
                trained += 1
            except Exception:
                failed += 1

        return {"trained": trained, "failed": failed, "model": model}
