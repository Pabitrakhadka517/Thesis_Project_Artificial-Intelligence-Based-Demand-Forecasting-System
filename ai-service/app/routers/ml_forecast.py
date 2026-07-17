"""
ML Forecast Router — new endpoints under /api/ai/ml/

All endpoints are additive; no existing /api/ai/* routes are modified.

Routes
------
POST /api/ai/ml/train                    — train all SKUs (background-friendly)
POST /api/ai/ml/train/{sku_id}           — train one SKU
GET  /api/ai/ml/forecast/{sku_id}        — run / return forecast for one SKU
GET  /api/ai/ml/forecast/{sku_id}/stored — return cached forecast from MongoDB
GET  /api/ai/ml/forecasts                — list all cached forecasts
GET  /api/ai/ml/models                   — list all trained model metadata
GET  /api/ai/ml/models/{sku_id}          — metadata for one SKU
GET  /api/ai/ml/compare/{sku_id}         — side-by-side RF/XGB/LSTM metrics
GET  /api/ai/ml/inventory                — all inventory recommendations
GET  /api/ai/ml/inventory/{sku_id}       — recommendation for one SKU
GET  /api/ai/ml/reorder-alerts           — SKUs that need reordering now
GET  /api/ai/ml/skus                     — list all SKUs available in the dataset
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from app.database import get_db
from app.ml.model_trainer import load_metadata
from app.services.ml_forecast_service import MLForecastService, TrainingBusyError

router = APIRouter(prefix="/ml", tags=["ML Forecast"])


# ── request/response models ────────────────────────────────────────────────────

class TrainAllRequest(BaseModel):
    sku_ids: Optional[list[str]] = None   # None = train all 50 SKUs from dataset


class ForecastRequest(BaseModel):
    horizon_days: int = Field(default=30, ge=1, le=365, description="Forecast horizon (1–365 days)")
    model: Optional[Literal["random_forest", "xgboost", "lstm"]] = None

    @field_validator("horizon_days")
    @classmethod
    def _cap_horizon(cls, v: int) -> int:
        if v < 1:
            raise ValueError("horizon_days must be at least 1")
        if v > 365:
            raise ValueError("horizon_days cannot exceed 365 — longer horizons compound uncertainty past usefulness")
        return v


# ── training endpoints ─────────────────────────────────────────────────────────

@router.post("/train/{sku_id}", summary="Train RF + XGBoost + LSTM for one SKU")
async def train_sku(sku_id: str):
    """
    Trains Random Forest, XGBoost, and LSTM on the CSV dataset for the given SKU.
    Selects the best model by lowest MAPE. Saves models to disk and metadata to MongoDB.

    Returns per-model evaluation metrics (MAE, RMSE, MAPE, R²) and the chosen best model.
    """
    db  = get_db()
    svc = MLForecastService(db)
    try:
        result = await svc.train_sku(sku_id)
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except TrainingBusyError as exc:
        raise HTTPException(429, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Training failed: {exc}")


@router.post("/train", summary="Train all SKUs (or a specified list)")
async def train_all(body: TrainAllRequest, background_tasks: BackgroundTasks):
    """
    Queues training of all SKUs in the background.  Pass `sku_ids` to restrict
    training to a subset.  Returns immediately with a 202 acknowledgement.

    Use GET /api/ai/ml/models to poll completion status.
    """
    db  = get_db()
    svc = MLForecastService(db)

    async def _run():
        await svc.train_all(body.sku_ids)

    background_tasks.add_task(_run)
    targets = body.sku_ids or "all 50 dataset SKUs"
    return {
        "success": True,
        "message": f"Training queued for {targets}. Poll GET /api/ai/ml/models for progress.",
        "status":  "accepted",
    }


# ── forecast endpoints ─────────────────────────────────────────────────────────

@router.post("/forecast/{sku_id}", summary="Generate and store a forecast for one SKU")
async def run_forecast(sku_id: str, body: ForecastRequest):
    """
    Runs demand forecasting for the given SKU using the best trained model
    (or the model specified in `model`).  Also computes and stores full
    inventory recommendations.

    Requires the model to have been trained first via POST /api/ai/ml/train/{sku_id}.
    """
    db  = get_db()
    svc = MLForecastService(db)
    try:
        result = await svc.forecast(sku_id, body.horizon_days, body.model)
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Forecasting failed: {exc}")


@router.get("/forecast/{sku_id}/stored", summary="Return cached forecast from MongoDB")
async def get_stored_forecast(sku_id: str, model: Optional[str] = Query(None)):
    db  = get_db()
    svc = MLForecastService(db)
    doc = await svc.get_stored_forecast(sku_id, model)
    if not doc:
        raise HTTPException(404, f"No stored forecast found for SKU '{sku_id}'")
    return {"success": True, "data": doc}


@router.get("/forecasts", summary="List all cached forecasts")
async def list_forecasts(limit: int = Query(50, ge=1, le=200)):
    db   = get_db()
    svc  = MLForecastService(db)
    data = await svc.list_stored_forecasts(limit)
    return {"success": True, "data": data, "total": len(data)}


# ── model info endpoints ───────────────────────────────────────────────────────

@router.get("/models", summary="List all trained model metadata")
async def list_models():
    """Returns training metrics and best model selection for every trained SKU."""
    db   = get_db()
    svc  = MLForecastService(db)
    data = await svc.get_model_info()
    return {"success": True, "data": data, "total": len(data)}


@router.get("/models/{sku_id}", summary="Metadata for one SKU")
async def get_model(sku_id: str):
    db   = get_db()
    svc  = MLForecastService(db)
    data = await svc.get_model_info(sku_id)
    if data:
        return {"success": True, "data": data[0]}
    # Fallback: check disk metadata (models trained before MongoDB entry was written)
    try:
        meta = load_metadata(sku_id)
    except ValueError:
        meta = None
    if meta:
        return {"success": True, "data": meta}
    raise HTTPException(404, f"No model metadata found for SKU '{sku_id}'. Train the model first.")


@router.get("/compare/{sku_id}", summary="Side-by-side RF / XGBoost / LSTM metrics")
async def compare_models(sku_id: str):
    """
    Returns a comparison table with MAE, RMSE, MAPE, R² for all three models
    trained on this SKU, highlighting the best performer.
    """
    db  = get_db()
    svc = MLForecastService(db)
    try:
        result = await svc.compare_models(sku_id)
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/feature-importance/{sku_id}", summary="Feature importances from the best tree model")
async def get_feature_importance(sku_id: str):
    """
    Returns the top-15 feature importances from the best Random Forest or XGBoost
    model for the given SKU.  Importances are extracted at training time from
    `model.feature_importances_` and stored in the metadata JSON.

    LSTM models do not support feature importances; this endpoint always returns
    values from the best tree-based model (RF or XGBoost).

    Requires the model to be trained first via POST /api/ai/ml/train/{sku_id}.
    """
    db  = get_db()
    svc = MLForecastService(db)
    try:
        result = await svc.get_feature_importance(sku_id)
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(404, str(exc))


# ── inventory endpoints ────────────────────────────────────────────────────────

@router.get("/inventory", summary="All inventory recommendations")
async def get_all_inventory(
    risk: Optional[Literal["high", "medium", "low"]] = Query(
        None, description="Filter by stockout risk level"
    )
):
    """
    Returns inventory optimisation recommendations for all analysed SKUs.
    Each record includes: safety stock, reorder point, EOQ, suggested purchase,
    inventory turnover, stockout risk, overstock risk, and a plain-English explanation.
    """
    db   = get_db()
    svc  = MLForecastService(db)
    data = await svc.get_inventory_recommendations(risk_filter=risk)
    return {"success": True, "data": data, "total": len(data)}


@router.get("/inventory/{sku_id}", summary="Inventory recommendation for one SKU")
async def get_inventory(sku_id: str):
    db   = get_db()
    svc  = MLForecastService(db)
    data = await svc.get_inventory_recommendations(sku_id=sku_id)
    if not data:
        raise HTTPException(
            404,
            f"No inventory recommendation found for SKU '{sku_id}'. "
            "Run POST /api/ai/ml/forecast/{sku_id} first.",
        )
    return {"success": True, "data": data[0]}


@router.get("/reorder-alerts", summary="SKUs that need immediate reordering")
async def reorder_alerts():
    """Returns all SKUs where current stock has fallen at or below the reorder point."""
    db   = get_db()
    svc  = MLForecastService(db)
    data = await svc.get_reorder_alerts()
    return {"success": True, "data": data, "total": len(data)}


# ── utility endpoints ──────────────────────────────────────────────────────────

@router.get("/skus", summary="List all SKUs available for forecasting")
async def list_skus():
    """
    Returns the 50 demo/synthetic dataset SKUs (always eligible) plus every
    active real inventory product. Each entry's `source` is "demo" or "live";
    live entries carry `eligible` (>= 90 days of sales history for
    ModelTrainer to train on) and, when not eligible, `days_needed`.
    """
    from app.ml.preprocessor import DataPreprocessor
    from app.ml import mongo_products

    prep = DataPreprocessor()
    details = [prep.get_sku_meta(s) for s in prep.get_sku_list()]
    for d in details:
        d.setdefault("source", "demo")
        d.setdefault("eligible", True)

    try:
        details.extend(mongo_products.list_live_products())
    except Exception:
        pass  # Mongo unreachable — still serve the demo dataset SKUs

    return {"success": True, "data": details, "total": len(details)}


@router.get("/history/{sku_id}", summary="Recent daily actual demand for one SKU")
async def sku_history(sku_id: str, days: int = Query(default=60, ge=7, le=365)):
    """
    Returns the last N days of actual (historical) daily quantity for a SKU,
    so the forecast chart can plot actuals alongside the prediction instead of
    showing the future series with no trend context.
    """
    from app.ml.preprocessor import DataPreprocessor
    prep = DataPreprocessor()
    try:
        series = prep.build_sku_timeseries(sku_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    tail = series.tail(days)
    data = [
        {"date": row.date.strftime("%Y-%m-%d"), "qty": round(float(row.qty), 2)}
        for row in tail.itertuples()
    ]
    return {"success": True, "data": data, "total": len(data)}


@router.post("/insights", summary="Generate LLM-powered business insights from inventory data")
async def generate_insights():
    """
    Fetches current inventory recommendations from MongoDB and calls Claude API
    to produce actionable business insights for wholesale store management.
    """
    db  = get_db()
    svc = MLForecastService(db)
    try:
        result = await svc.generate_insights()
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Insight generation failed: {exc}")


@router.get("/dataset/summary", summary="Summary statistics of the training dataset")
async def dataset_summary():
    """
    Returns high-level statistics from the CSV dataset:
    row count, SKU count, date range, category distribution, and quantity stats.
    """
    import pandas as pd
    from app.ml.preprocessor import DataPreprocessor

    prep = DataPreprocessor()
    df   = prep.load_raw()

    category_counts = df.groupby("category")["quantity"].agg(["sum", "count"]).reset_index()
    categories = [
        {
            "category":       row["category"],
            "total_quantity": int(row["sum"]),
            "transactions":   int(row["count"]),
        }
        for _, row in category_counts.iterrows()
    ]

    return {
        "success": True,
        "data": {
            "total_rows":    len(df),
            "unique_skus":   df["product_sku"].nunique(),
            "date_range":    {
                "start": str(df["date"].min().date()),
                "end":   str(df["date"].max().date()),
                "days":  (df["date"].max() - df["date"].min()).days + 1,
            },
            "quantity_stats": {
                "mean":   round(float(df["quantity"].mean()), 2),
                "std":    round(float(df["quantity"].std()),  2),
                "min":    int(df["quantity"].min()),
                "max":    int(df["quantity"].max()),
                "median": round(float(df["quantity"].median()), 2),
            },
            "festivals": sorted(df["festival_name"].unique().tolist()),
            "categories": categories,
        },
    }
