"""
Demand Forecasting endpoints.

POST /forecast/predict   - Run forecast for a product SKU
GET  /forecast/results   - Get stored forecast results
GET  /forecast/accuracy  - Overall model accuracy metrics
POST /forecast/train     - Trigger model training
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.database import get_db
from app.services.forecasting_service import ForecastingService

router = APIRouter(prefix="/forecast", tags=["Forecast"])


class ForecastRequest(BaseModel):
    sku_id: str
    model:  Literal["random_forest", "xgboost", "lstm", "prophet"] = "random_forest"
    horizon_days: int = 30


class TrainRequest(BaseModel):
    model: Literal["random_forest", "xgboost", "lstm", "prophet"] = "random_forest"
    sku_ids: list[str] | None = None  # None = train all


@router.post("/predict")
async def predict(body: ForecastRequest):
    db  = get_db()
    svc = ForecastingService(db)
    try:
        result = await svc.predict(
            sku_id=body.sku_id,
            model=body.model,
            horizon_days=body.horizon_days,
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Forecasting failed: {e}")


@router.get("/results")
async def get_results(
    sku_id:  str | None = Query(None),
    model:   str | None = Query(None),
    limit:   int        = Query(50, ge=1, le=200),
):
    db = get_db()
    query: dict = {}
    if sku_id: query["sku_id"] = sku_id
    if model:  query["model"]  = model

    cursor  = db["forecastResults"].find(query).sort("created_at", -1).limit(limit)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return {"success": True, "data": results}


@router.get("/accuracy")
async def get_accuracy():
    db = get_db()
    pipeline = [
        {"$group": {
            "_id": "$model",
            "avg_mape": {"$avg": "$metrics.mape"},
            "avg_rmse": {"$avg": "$metrics.rmse"},
            "count":    {"$sum": 1},
        }},
        {"$sort": {"avg_mape": 1}},
    ]
    cursor  = db["forecastResults"].aggregate(pipeline)
    results = []
    async for doc in cursor:
        results.append({
            "model":    doc["_id"],
            "avg_mape": round(doc["avg_mape"] or 0, 2),
            "avg_rmse": round(doc["avg_rmse"] or 0, 2),
            "count":    doc["count"],
        })
    return {"success": True, "data": results}


@router.post("/train")
async def train(body: TrainRequest):
    db  = get_db()
    svc = ForecastingService(db)
    try:
        summary = await svc.train_all(model=body.model, sku_ids=body.sku_ids)
        return {"success": True, "data": summary}
    except Exception as e:
        raise HTTPException(500, f"Training failed: {e}")
