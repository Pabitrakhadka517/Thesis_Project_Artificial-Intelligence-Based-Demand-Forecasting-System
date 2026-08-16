"""
Inventory AI Router — comprehensive per-product analysis endpoints.

Routes:
  POST /inventory/analyze        — analyze a single product
  GET  /inventory/dashboard      — dashboard aggregation from cache
  GET  /inventory/products       — all cached predictions
  GET  /inventory/health         — service health
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.inventory_analysis import InventoryAnalysisService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/inventory", tags=["inventory-ai"])


class AnalyzeRequest(BaseModel):
    product_id:   str
    horizon_days: int = Field(default=30, ge=1, le=365, description="Forecast horizon (1–365 days)")


@router.post("/analyze")
async def analyze_product(body: AnalyzeRequest):
    """Run Prophet forecast + inventory optimization for one product."""
    db  = get_db()
    svc = InventoryAnalysisService(db)
    try:
        result = await svc.analyze(body.product_id, body.horizon_days)
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Product analysis failed")
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.")


@router.get("/dashboard")
async def get_dashboard():
    """Aggregate dashboard stats from all cached predictions."""
    db      = get_db()
    svc     = InventoryAnalysisService(db)
    result  = await svc.get_dashboard()
    return {"success": True, "data": result}


@router.get("/products")
async def get_all_predictions():
    """Return all cached ready predictions."""
    db     = get_db()
    svc    = InventoryAnalysisService(db)
    preds  = await svc.get_all_predictions()
    return {"success": True, "data": preds, "total": len(preds)}


@router.get("/health")
async def health():
    return {"status": "ok", "service": "inventory-ai"}
