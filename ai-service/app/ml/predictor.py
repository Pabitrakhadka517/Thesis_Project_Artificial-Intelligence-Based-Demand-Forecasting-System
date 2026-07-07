"""
Demand prediction using saved models.

Loads the best (or specified) model for a SKU, builds future feature rows,
runs recursive prediction, and returns predictions with confidence intervals.

Model caching
─────────────
joblib.load() and tf.keras.models.load_model() are expensive I/O operations.
_cached_load_sklearn() and _cached_load_keras() use functools.lru_cache keyed
on (path, mtime) so reloads only happen when the model file has been updated
(i.e. after retraining). The cache holds up to 100 sklearn models and 20 Keras
models — enough for all 50 dataset SKUs.

Confidence intervals
────────────────────
Recursive forecasting compounds errors at each step. The prediction interval
width at step t is scaled by √t relative to step 1 (random-walk error growth).
For RMSE-based intervals this gives approximate 68 % coverage at every step.

  lower_t = max(0, predicted_qty_t − RMSE × √t)
  upper_t = predicted_qty_t + RMSE × √t

Confidence score formula (dissertation-aligned):
  base_confidence = 95 − max(0, MAPE − 5) × 0.9          (MAPE-based)
  r2_penalty      = max(0, (0.5 − R²) × 20)               (R²-based penalty)
  cv_bonus        = min(5, max(0, 5 − cv_mape))            (CV stability bonus)
  confidence      = clamp(base − r2_penalty + cv_bonus, 20, 95)
"""
from __future__ import annotations

import math
import os
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from app.ml.preprocessor import (
    TABULAR_FEATURE_COLS,
    LSTM_FEATURE_COLS,
    LSTM_SEQ_LEN,
    _SEASON_MAP,
    _cyclic,
    _festival_proximity,
    _season_from_month,
    DataPreprocessor,
)
from app.ml.model_trainer import load_metadata, _model_dir


# ── model cache helpers ───────────────────────────────────────────────────────

@lru_cache(maxsize=100)
def _cached_load_sklearn(path: str, _mtime: float):
    """
    LRU-cached sklearn/XGBoost model loader.
    _mtime is used only as a cache key — when a model file is updated after
    retraining, the new mtime busts the cache and forces a fresh load.
    """
    return joblib.load(path)


@lru_cache(maxsize=20)
def _cached_load_keras(path: str, _mtime: float):
    """LRU-cached Keras model loader with mtime-based cache invalidation."""
    import tensorflow as tf
    return tf.keras.models.load_model(path)


def _load_sklearn_model(path: str):
    mtime = os.path.getmtime(path)
    return _cached_load_sklearn(path, mtime)


def _load_keras_model(path: str):
    mtime = os.path.getmtime(path)
    return _cached_load_keras(path, mtime)


# ── predictor ─────────────────────────────────────────────────────────────────

class DemandPredictor:
    """Load a trained model and produce horizon-day forecasts with confidence."""

    def __init__(self, preprocessor: Optional[DataPreprocessor] = None):
        self.prep = preprocessor or DataPreprocessor()

    # ── public ────────────────────────────────────────────────────────────────

    def predict(
        self,
        sku_id: str,
        horizon_days: int = 30,
        model_name: Optional[str] = None,
    ) -> dict:
        """
        Generate a demand forecast for `sku_id` over the next `horizon_days`.

        If `model_name` is None the best model (from saved metadata) is used.
        """
        meta = load_metadata(sku_id)
        if meta is None:
            raise ValueError(
                f"No trained model found for SKU '{sku_id}'. "
                "Train the model first via POST /api/ai/ml/train/{sku_id}"
            )

        chosen_model = model_name or meta.get("best_model", "random_forest")
        metrics      = meta.get("metrics", {}).get(chosen_model, {})

        sku_df   = self.prep.build_sku_timeseries(sku_id)
        sku_meta = self.prep.get_sku_meta(sku_id)

        if chosen_model == "lstm":
            predictions = self._predict_lstm(sku_df, sku_meta, horizon_days, meta)
        else:
            predictions = self._predict_tabular(
                sku_df, sku_meta, horizon_days, chosen_model
            )

        confidence_score = self._confidence_from_metrics(metrics)
        base_width       = self._base_interval_width(predictions, metrics)

        # Attach step-scaled confidence intervals.
        # Recursive forecasting compounds errors at each step: step t has
        # uncertainty that grows proportionally to √t (random-walk error model).
        for i, row in enumerate(predictions, 1):
            qty        = row["predicted_qty"]
            step_width = round(base_width * math.sqrt(i), 2)
            row["lower_bound"] = round(max(0.0, qty - step_width), 2)
            row["upper_bound"] = round(qty + step_width, 2)
            row["confidence"]  = confidence_score

        return {
            "sku_id":           sku_id,
            "model":            chosen_model,
            "best_model":       meta.get("best_model"),
            "horizon_days":     horizon_days,
            "confidence_score": confidence_score,
            "predictions":      predictions,
            "metrics":          metrics,
            "trained_at":       meta.get("trained_at"),
        }

    def get_all_model_metrics(self, sku_id: str) -> Optional[dict]:
        meta = load_metadata(sku_id)
        if meta is None:
            return None
        return {
            "sku_id":             sku_id,
            "best_model":         meta.get("best_model"),
            "metrics":            meta.get("metrics", {}),
            "feature_importance": meta.get("feature_importance", {}),
            "trained_at":         meta.get("trained_at"),
        }

    # ── tabular prediction ────────────────────────────────────────────────────

    def _predict_tabular(
        self,
        sku_df: "pd.DataFrame",
        sku_meta: dict,
        horizon_days: int,
        model_name: str,
    ) -> list[dict]:
        mdl_path = str(_model_dir(sku_meta["product_sku"]) / f"{model_name}.joblib")
        if not Path(mdl_path).exists():
            raise FileNotFoundError(f"Saved model not found: {mdl_path}")

        # Use cached loader — avoids repeated joblib deserialization for same model
        model = _load_sklearn_model(mdl_path)

        last_dates = sku_df["date"]
        last_qty   = sku_df["qty"].values

        future_df = self.prep.build_future_tabular_rows(
            pd.DatetimeIndex(last_dates),
            last_qty,
            sku_meta,
            horizon_days,
        )

        history    = list(last_qty[-90:])
        predictions = []

        for _, row in future_df.iterrows():
            # Patch lag / rolling features with accumulated predictions
            feature_row = self._patch_tabular_row(row, history, sku_meta)
            X_row = np.array(
                [[feature_row[c] for c in TABULAR_FEATURE_COLS]], dtype=np.float32
            )
            pred = max(0.0, float(model.predict(X_row)[0]))
            pred = round(pred, 2)

            predictions.append({
                "date":          row["_future_date"],
                "predicted_qty": pred,
            })
            history.append(pred)
            history = history[-90:]

        return predictions

    def _patch_tabular_row(self, row, history: list, sku_meta: dict) -> dict:
        """
        Overwrite all lag / rolling columns with values derived from accumulated
        prediction history.  The pre-built row (from build_future_tabular_rows)
        contains only 0.0 placeholders for these columns.
        """
        row = row.to_dict()

        def _lag(n: int) -> float:
            return float(history[-n]) if len(history) >= n else float(history[0] if history else 0.0)

        def _rmean(n: int) -> float:
            return float(np.mean(history[-n:])) if history else 0.0

        def _rstd(n: int) -> float:
            # ddof=1 (sample std) to match pandas .rolling().std() used during training
            arr = history[-n:]
            return float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0

        def _ewm(span: int) -> float:
            buf = history[-(span * 2):]
            return (
                float(pd.Series(buf, dtype=float).ewm(span=span, adjust=False).mean().iloc[-1])
                if buf else 0.0
            )

        row.update({
            "qty_lag_1":  _lag(1),  "qty_lag_2":  _lag(2),  "qty_lag_3":  _lag(3),
            "qty_lag_7":  _lag(7),  "qty_lag_14": _lag(14), "qty_lag_21": _lag(21),
            "qty_lag_28": _lag(28), "qty_lag_30": _lag(30),
            "qty_roll_mean_7":  _rmean(7),
            "qty_roll_mean_14": _rmean(14),
            "qty_roll_mean_30": _rmean(30),
            "qty_roll_std_7":   _rstd(7),
            "qty_roll_std_14":  _rstd(14),
            "qty_roll_std_30":  _rstd(30),
            "qty_roll_max_7":   float(max(history[-7:]))  if history else 0.0,
            "qty_roll_min_7":   float(min(history[-7:]))  if history else 0.0,
            "qty_ewm_7":        _ewm(7),
            "qty_ewm_14":       _ewm(14),
        })
        return row

    # ── LSTM prediction ───────────────────────────────────────────────────────

    def _predict_lstm(
        self,
        sku_df: "pd.DataFrame",
        sku_meta: dict,
        horizon_days: int,
        meta: dict,
    ) -> list[dict]:
        sku_id      = sku_meta["product_sku"]
        model_path  = str(_model_dir(sku_id) / "lstm_model.keras")
        scaler_path = str(_model_dir(sku_id) / "lstm_qty_scaler.joblib")

        if not Path(model_path).exists():
            raise FileNotFoundError(f"LSTM model not found: {model_path}")

        # Use cached loaders
        model   = _load_keras_model(model_path)
        qty_max = joblib.load(scaler_path)["qty_max"]

        # Seed the rolling window from the last LSTM_SEQ_LEN rows
        window_rows = sku_df.tail(LSTM_SEQ_LEN)[LSTM_FEATURE_COLS].values.astype(np.float32)
        window      = list(window_rows)  # list of 1-D feature vectors

        last_date   = sku_df["date"].iloc[-1].date()
        predictions = []

        for i in range(1, horizon_days + 1):
            fd = last_date + timedelta(days=i)
            inp    = np.array(window[-LSTM_SEQ_LEN:]).reshape(1, LSTM_SEQ_LEN, len(LSTM_FEATURE_COLS))
            pred_n = float(model.predict(inp, verbose=0)[0][0])
            pred   = round(max(0.0, pred_n * qty_max), 2)

            predictions.append({
                "date":          str(fd),
                "predicted_qty": pred,
            })

            # Build next feature row — must match LSTM_FEATURE_COLS exactly:
            # qty_norm, is_weekend, is_festival, festival_intensity,
            # month_sin, month_cos, dow_sin, dow_cos,
            # annual_trend_factor, demand_index, season_encoded
            ms, mc = _cyclic(fd.month, 12)
            ds, dc = _cyclic(fd.weekday(), 7)
            past, future = _festival_proximity(fd)
            is_fest  = int(future <= 7 or past <= 3)
            fest_int = 1.5 if is_fest else 1.0

            next_row = np.array([
                pred_n,                                        # qty_norm (already normalised)
                int(fd.weekday() >= 5),                        # is_weekend
                is_fest,                                       # is_festival
                fest_int,                                      # festival_intensity
                ms, mc,                                        # month_sin, month_cos
                ds, dc,                                        # dow_sin, dow_cos
                sku_meta.get("annual_trend_factor", 1.0),      # annual_trend_factor
                sku_meta.get("demand_index", 0.5),             # demand_index
                # season_encoded — references _SEASON_MAP via _season_from_month()
                # to guarantee the same integer as produced during training
                float(_season_from_month(fd.month)),           # season_encoded
            ], dtype=np.float32)

            window.append(next_row)
            window = window[-LSTM_SEQ_LEN:]

        return predictions

    # ── confidence & interval helpers ─────────────────────────────────────────

    @staticmethod
    def _confidence_from_metrics(metrics: dict) -> int:
        """
        Composite confidence score (20–95 %) from holdout and CV metrics.

          base       = 95 − max(0, MAPE − 5) × 0.9   (MAPE-based degradation)
          r2_penalty = max(0, (0.5 − R²) × 20)         (R²-based penalty)
          cv_bonus   = min(5, max(0, 5 − cv_mape))      (stable CV = up to +5)
          score      = clamp(base − r2_penalty + cv_bonus, 20, 95)
        """
        mape    = metrics.get("mape")
        r2      = metrics.get("r2")
        cv_mape = metrics.get("cv_mape")

        if mape is None:
            return 40  # no metrics → low confidence

        base       = max(20.0, min(95.0, 95.0 - max(0.0, mape - 5.0) * 0.9))
        r2_penalty = max(0.0, (0.5 - (r2 or 0.0)) * 20.0)
        cv_bonus   = min(5.0, max(0.0, 5.0 - (cv_mape or mape))) if cv_mape is not None else 0.0

        return int(round(max(20, min(95, base - r2_penalty + cv_bonus))))

    @staticmethod
    def _base_interval_width(predictions: list[dict], metrics: dict) -> float:
        """
        Base interval width (for step 1).  The actual width at step t is:
            step_width = base_width × √t
        This reflects the random-walk error compounding in recursive forecasting.

        Uses RMSE from the held-out test set as the ±1σ estimate for step 1.
        Falls back to 15 % of mean predicted quantity when RMSE is unavailable.
        """
        rmse = metrics.get("rmse")
        if rmse:
            return round(float(rmse), 2)
        qtys = [r["predicted_qty"] for r in predictions]
        mean = float(np.mean(qtys)) if qtys else 1.0
        return round(mean * 0.15, 2)
