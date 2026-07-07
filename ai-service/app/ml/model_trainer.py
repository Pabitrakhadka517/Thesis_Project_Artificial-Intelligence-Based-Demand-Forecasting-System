"""
Model training, evaluation, and persistence for StockWise demand forecasting.

Supported models:
  • Random Forest   (scikit-learn)
  • XGBoost         (xgboost)
  • LSTM            (TensorFlow / Keras)

Serialisation layout:
  trained_models/{sku_id}/random_forest.joblib
  trained_models/{sku_id}/xgboost.joblib
  trained_models/{sku_id}/lstm_model.keras
  trained_models/{sku_id}/lstm_qty_scaler.joblib
  trained_models/{sku_id}/metadata.json

Evaluation:
  • Holdout metrics:  MAE · RMSE · MAPE · R²  on the chronological 20 % test split
  • CV metrics:       3-fold TimeSeriesSplit on the 80 % train split for unbiased estimates
  • Hyperparameter tuning: RandomizedSearchCV (n_iter=10) over TimeSeriesSplit(n_splits=3)
    Controlled by TUNE_HYPERPARAMS=true env var (default: false for speed)

Best model selection:  lowest CV-MAPE (ties broken by CV-RMSE)
"""
from __future__ import annotations

import json
import os
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit

from app.ml.preprocessor import (
    TABULAR_FEATURE_COLS,
    LSTM_FEATURE_COLS,
    LSTM_SEQ_LEN,
    DataPreprocessor,
)

# Base directory for saved models — resolved relative to this file's repo root
_BASE_DIR = Path(__file__).parents[3] / "trained_models"

# Set TUNE_HYPERPARAMS=true in environment to enable RandomizedSearchCV.
# Default is false to keep training fast during iterative development.
_TUNE = os.getenv("TUNE_HYPERPARAMS", "false").lower() == "true"

# TimeSeriesSplit config shared by CV and hyperparameter search
_TSCV = TimeSeriesSplit(n_splits=3)


# ── metrics helpers ───────────────────────────────────────────────────────────

def _mape(y_true: np.ndarray, y_pred: np.ndarray, eps: float = 1e-6) -> float:
    """
    Zero-safe MAPE: skips rows where true value ≤ eps to avoid division by zero.
    Returns 0 when no non-zero rows exist (avoids inf/NaN in metrics).
    """
    mask = y_true > eps
    if mask.sum() == 0:
        return 0.0
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / (y_true[mask] + eps))) * 100)


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_pred_clip = np.maximum(y_pred, 0.0)
    mae  = float(mean_absolute_error(y_true, y_pred_clip))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred_clip)))
    mape = _mape(y_true, y_pred_clip)
    r2   = float(r2_score(y_true, y_pred_clip))
    return {
        "mae":  round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 4),
        "r2":   round(r2,   4),
    }


def _cross_validate(estimator_factory, X: np.ndarray, y: np.ndarray) -> dict:
    """
    3-fold TimeSeriesSplit cross-validation on the training set.

    Returns average MAE, RMSE, MAPE, and R² across folds.  A fresh estimator
    is instantiated for each fold via estimator_factory() to prevent any state
    bleed between folds.
    """
    maes, rmses, mapes, r2s = [], [], [], []
    for tr_idx, te_idx in _TSCV.split(X):
        mdl = estimator_factory()
        mdl.fit(X[tr_idx], y[tr_idx])
        y_pred = np.maximum(mdl.predict(X[te_idx]), 0.0)
        y_true = y[te_idx]
        maes.append(mean_absolute_error(y_true, y_pred))
        rmses.append(np.sqrt(mean_squared_error(y_true, y_pred)))
        mapes.append(_mape(y_true, y_pred))
        r2s.append(r2_score(y_true, y_pred))
    return {
        "cv_mae":   round(float(np.mean(maes)),  4),
        "cv_rmse":  round(float(np.mean(rmses)), 4),
        "cv_mape":  round(float(np.mean(mapes)), 4),
        "cv_r2":    round(float(np.mean(r2s)),   4),
        "cv_folds": 3,
    }


def _extract_feature_importance(model, feature_cols: list[str], top_n: int = 15) -> dict:
    """
    Extract feature importance from RF or XGB models.

    Returns a dict mapping feature name → importance score (sorted descending).
    """
    if not hasattr(model, "feature_importances_"):
        return {}
    importance = model.feature_importances_
    paired = sorted(
        zip(feature_cols, importance.tolist()),
        key=lambda x: x[1],
        reverse=True,
    )
    return {name: round(float(score), 6) for name, score in paired[:top_n]}


# ── path helpers ──────────────────────────────────────────────────────────────

def _model_dir(sku_id: str) -> Path:
    d = _BASE_DIR / sku_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _meta_path(sku_id: str) -> Path:
    return _model_dir(sku_id) / "metadata.json"


def load_metadata(sku_id: str) -> Optional[dict]:
    p = _meta_path(sku_id)
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def save_metadata(sku_id: str, meta: dict) -> None:
    with open(_meta_path(sku_id), "w") as f:
        json.dump(meta, f, indent=2, default=str)


# ── Random Forest ─────────────────────────────────────────────────────────────

def train_random_forest(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    sku_id: str,
) -> dict:
    from sklearn.ensemble import RandomForestRegressor

    # ── preset hyperparameters (good default, validated on Nepal wholesale data) ──
    preset_params = dict(
        n_estimators=300,
        max_depth=15,
        min_samples_leaf=5,
        max_features="sqrt",
        n_jobs=-1,
        random_state=42,
    )

    if _TUNE and len(X_train) >= 60:
        # Hyperparameter search over training set with TimeSeriesSplit CV.
        # n_iter=10 gives a good accuracy/speed trade-off (30 fits total).
        param_dist = {
            "n_estimators":   [100, 200, 300, 400, 500],
            "max_depth":      [5, 8, 10, 12, 15, None],
            "min_samples_leaf": [2, 3, 5, 8],
            "max_features":   ["sqrt", "log2", 0.5, 0.7],
            "min_samples_split": [2, 5, 10],
        }
        search = RandomizedSearchCV(
            RandomForestRegressor(n_jobs=-1, random_state=42),
            param_distributions=param_dist,
            n_iter=10,
            cv=_TSCV,
            scoring="neg_mean_absolute_error",
            random_state=42,
            n_jobs=1,   # parallelism is inside RF (n_jobs=-1)
            refit=True,
        )
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            search.fit(X_train, y_train)
        mdl = search.best_estimator_
        best_params = search.best_params_
    else:
        mdl = RandomForestRegressor(**preset_params)
        mdl.fit(X_train, y_train)
        best_params = preset_params

    # ── holdout metrics ──────────────────────────────────────────────────────
    metrics = compute_metrics(y_test, mdl.predict(X_test)) if len(X_test) > 0 else {}

    # ── TimeSeriesSplit CV metrics on training set ────────────────────────────
    cv = _cross_validate(
        lambda: RandomForestRegressor(**{**best_params, "n_jobs": -1, "random_state": 42}),
        X_train, y_train,
    )
    metrics.update(cv)

    # ── feature importance (top 15 features) ─────────────────────────────────
    feature_importance = _extract_feature_importance(mdl, TABULAR_FEATURE_COLS)

    out_path = _model_dir(sku_id) / "random_forest.joblib"
    joblib.dump(mdl, out_path)

    return {
        "model":              mdl,
        "metrics":            metrics,
        "feature_importance": feature_importance,
        "best_params":        best_params,
        "path":               str(out_path),
    }


# ── XGBoost ───────────────────────────────────────────────────────────────────

def train_xgboost(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    sku_id: str,
) -> dict:
    import xgboost as xgb

    preset_params = dict(
        n_estimators=400,
        max_depth=7,
        learning_rate=0.04,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        gamma=0.1,
        reg_alpha=0.05,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )

    if _TUNE and len(X_train) >= 60:
        param_dist = {
            "n_estimators":     [100, 200, 300, 400],
            "max_depth":        [3, 5, 6, 7, 9],
            "learning_rate":    [0.01, 0.03, 0.05, 0.1, 0.2],
            "subsample":        [0.6, 0.7, 0.8, 0.9, 1.0],
            "colsample_bytree": [0.6, 0.7, 0.8, 0.9, 1.0],
            "min_child_weight": [1, 3, 5, 7],
            "gamma":            [0.0, 0.1, 0.2, 0.3],
            "reg_alpha":        [0.0, 0.01, 0.05, 0.1],
            "reg_lambda":       [0.5, 1.0, 1.5, 2.0],
        }
        search = RandomizedSearchCV(
            xgb.XGBRegressor(random_state=42, n_jobs=-1, verbosity=0),
            param_distributions=param_dist,
            n_iter=10,
            cv=_TSCV,
            scoring="neg_mean_absolute_error",
            random_state=42,
            n_jobs=1,
            refit=True,
        )
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            search.fit(X_train, y_train)
        mdl = search.best_estimator_
        best_params = search.best_params_
    else:
        mdl = xgb.XGBRegressor(**preset_params)
        eval_set = [(X_test, y_test)] if len(X_test) > 0 else None
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            mdl.fit(X_train, y_train, eval_set=eval_set, verbose=False)
        best_params = preset_params

    # ── holdout metrics ──────────────────────────────────────────────────────
    metrics = compute_metrics(y_test, mdl.predict(X_test)) if len(X_test) > 0 else {}

    # ── CV metrics ───────────────────────────────────────────────────────────
    cv_params = {k: v for k, v in best_params.items()
                 if k in ("n_estimators", "max_depth", "learning_rate",
                          "subsample", "colsample_bytree", "min_child_weight",
                          "gamma", "reg_alpha", "reg_lambda")}
    cv = _cross_validate(
        lambda: xgb.XGBRegressor(**cv_params, random_state=42, n_jobs=-1, verbosity=0),
        X_train, y_train,
    )
    metrics.update(cv)

    # ── feature importance ───────────────────────────────────────────────────
    feature_importance = _extract_feature_importance(mdl, TABULAR_FEATURE_COLS)

    out_path = _model_dir(sku_id) / "xgboost.joblib"
    joblib.dump(mdl, out_path)

    return {
        "model":              mdl,
        "metrics":            metrics,
        "feature_importance": feature_importance,
        "best_params":        best_params,
        "path":               str(out_path),
    }


# ── LSTM ──────────────────────────────────────────────────────────────────────

def train_lstm(
    X_seq_train: np.ndarray,
    y_seq_train: np.ndarray,
    X_seq_test: np.ndarray,
    y_seq_test: np.ndarray,
    qty_max: float,
    sku_id: str,
) -> dict:
    """
    Train a multivariate LSTM.

    X_seq shape: (samples, LSTM_SEQ_LEN, n_features)
    y values are raw quantities.  qty_max MUST come from the training split only
    (callers must use DataPreprocessor.refit_qty_norm() before calling this).
    """
    import tensorflow as tf
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

    tf.get_logger().setLevel("ERROR")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

    n_features = X_seq_train.shape[2]

    # Normalise y using train-only qty_max — prevents test-peak leakage
    y_train_n = y_seq_train / (qty_max + 1e-8)
    y_test_n  = y_seq_test  / (qty_max + 1e-8)

    inp = tf.keras.Input(shape=(LSTM_SEQ_LEN, n_features))
    x   = tf.keras.layers.LSTM(128, return_sequences=True)(inp)
    x   = tf.keras.layers.Dropout(0.2)(x)
    x   = tf.keras.layers.LSTM(64)(x)
    x   = tf.keras.layers.Dropout(0.2)(x)
    x   = tf.keras.layers.Dense(32, activation="relu")(x)
    out = tf.keras.layers.Dense(1, activation="linear")(x)

    model = tf.keras.Model(inputs=inp, outputs=out)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="huber",   # Huber is robust to occasional demand spikes
    )

    callbacks = [
        EarlyStopping(patience=8, restore_best_weights=True, monitor="val_loss"),
        ReduceLROnPlateau(factor=0.5, patience=4, min_lr=1e-5),
    ]

    val_data = (X_seq_test, y_test_n) if len(X_seq_test) > 10 else None

    model.fit(
        X_seq_train, y_train_n,
        epochs=60,
        batch_size=32,
        validation_data=val_data,
        callbacks=callbacks,
        verbose=0,
    )

    metrics: dict = {}
    if len(X_seq_test) > 0:
        y_pred_n = model.predict(X_seq_test, verbose=0).flatten()
        y_pred   = np.maximum(y_pred_n * qty_max, 0.0)
        y_true   = y_seq_test
        metrics  = compute_metrics(y_true, y_pred)

    out_dir    = _model_dir(sku_id)
    model_path = out_dir / "lstm_model.keras"
    model.save(str(model_path))

    # qty_max is the sole scaler parameter — store alongside the model
    scaler_path = out_dir / "lstm_qty_scaler.joblib"
    joblib.dump({"qty_max": qty_max}, scaler_path)

    return {
        "model":       model,
        "qty_max":     qty_max,
        "metrics":     metrics,
        "path":        str(model_path),
        "scaler_path": str(scaler_path),
    }


# ── model selection ───────────────────────────────────────────────────────────

def select_best_model(results: dict[str, dict]) -> str:
    """
    Select model with the lowest CV-MAPE (ties broken by CV-RMSE).

    Prefers CV metrics over holdout metrics because they are computed on
    multiple folds and are therefore more stable estimates of generalisation
    performance.  Falls back to holdout MAPE if CV metrics are unavailable
    (e.g. for LSTM which does not run cross-validation).
    """
    scored: dict[str, tuple[float, float]] = {}
    for name, info in results.items():
        m = info.get("metrics", {})
        # Prefer CV metrics; fall back to holdout metrics
        mape = m.get("cv_mape") if m.get("cv_mape") is not None else m.get("mape")
        rmse = m.get("cv_rmse") if m.get("cv_rmse") is not None else m.get("rmse")
        if mape is not None and rmse is not None:
            scored[name] = (mape, rmse)

    if not scored:
        return "random_forest"

    return min(scored, key=lambda k: (scored[k][0], scored[k][1]))


# ── main orchestrator ─────────────────────────────────────────────────────────

class ModelTrainer:
    """Trains RF + XGBoost + LSTM for a single SKU, evaluates, and saves everything."""

    def __init__(self, preprocessor: Optional[DataPreprocessor] = None):
        self.prep = preprocessor or DataPreprocessor()

    def train_sku(self, sku_id: str) -> dict:
        """
        Full training pipeline for one SKU.

        Returns a summary dict with per-model metrics, best model name,
        feature importances, and the metadata written to disk.
        """
        sku_df = self.prep.build_sku_timeseries(sku_id)
        if len(sku_df) < 60:
            raise ValueError(
                f"Insufficient data for SKU {sku_id}: "
                f"need ≥60 clean days, have {len(sku_df)}"
            )

        train_df, test_df = self.prep.prepare_train_test(sku_df, test_ratio=0.2)

        # ── Fix leakage: recompute qty_norm using train-split max only ─────────
        # build_sku_timeseries() computes qty_norm using the full dataset max,
        # which means the test set's peak demand influences training normalisation.
        # refit_qty_norm() recalculates from train_df only and propagates to test_df.
        train_df, test_df, qty_max = self.prep.refit_qty_norm(train_df, test_df)

        X_train, y_train = self.prep.build_tabular_xy(train_df)
        X_test,  y_test  = self.prep.build_tabular_xy(test_df)

        results: dict[str, Any] = {}

        # ── Random Forest ──────────────────────────────────────────────────
        try:
            rf_res = train_random_forest(X_train, y_train, X_test, y_test, sku_id)
            results["random_forest"] = rf_res
        except Exception as exc:
            results["random_forest"] = {"metrics": {}, "error": str(exc)}

        # ── XGBoost ────────────────────────────────────────────────────────
        try:
            xgb_res = train_xgboost(X_train, y_train, X_test, y_test, sku_id)
            results["xgboost"] = xgb_res
        except Exception as exc:
            results["xgboost"] = {"metrics": {}, "error": str(exc)}

        # ── LSTM ───────────────────────────────────────────────────────────
        try:
            X_lstm_tr, y_lstm_tr = self.prep.build_lstm_sequences(train_df, LSTM_SEQ_LEN)
            X_lstm_te, y_lstm_te = self.prep.build_lstm_sequences(test_df,  LSTM_SEQ_LEN)

            if len(X_lstm_tr) >= 10:
                # qty_max is already train-only from refit_qty_norm above
                lstm_res = train_lstm(
                    X_lstm_tr, y_lstm_tr,
                    X_lstm_te, y_lstm_te,
                    qty_max, sku_id,
                )
                results["lstm"] = lstm_res
            else:
                results["lstm"] = {"metrics": {}, "error": "Not enough sequences"}
        except Exception as exc:
            results["lstm"] = {"metrics": {}, "error": str(exc)}

        # ── select best ────────────────────────────────────────────────────
        best_model = select_best_model(results)

        # ── aggregate feature importances (RF preferred; XGB as fallback) ──
        fi_rf  = results.get("random_forest", {}).get("feature_importance", {})
        fi_xgb = results.get("xgboost",       {}).get("feature_importance", {})

        meta = {
            "sku_id":            sku_id,
            "best_model":        best_model,
            "feature_cols":      TABULAR_FEATURE_COLS,
            "lstm_feature_cols": LSTM_FEATURE_COLS,
            "lstm_seq_len":      LSTM_SEQ_LEN,
            "training_rows":     len(train_df),
            "test_rows":         len(test_df),
            "qty_max":           qty_max,           # saved for LSTM inference de-normalisation
            "tuned":             _TUNE,
            "trained_at":        datetime.utcnow().isoformat(),
            "metrics": {
                name: info.get("metrics", {})
                for name, info in results.items()
            },
            "best_params": {
                name: info.get("best_params")
                for name, info in results.items()
                if info.get("best_params")
            },
            "feature_importance": {
                "random_forest": fi_rf,
                "xgboost":       fi_xgb,
            },
        }
        save_metadata(sku_id, meta)

        return {
            "sku_id":             sku_id,
            "best_model":         best_model,
            "metrics":            meta["metrics"],
            "feature_importance": meta["feature_importance"],
            "trained_at":         meta["trained_at"],
            "tuned":              _TUNE,
        }
