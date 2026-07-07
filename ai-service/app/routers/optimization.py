"""
Inventory Optimization endpoints.

GET  /optimization/eoq          - EOQ calculations for all/one SKU
GET  /optimization/safety-stock - Safety stock recommendations
GET  /optimization/reorder      - Reorder point analysis
GET  /optimization/summary      - Full optimization dashboard
"""
from fastapi import APIRouter, Query
from app.database import get_db
from app.services.optimization_service import OptimizationService

router = APIRouter(prefix="/optimization", tags=["Optimization"])


@router.get("/summary")
async def summary(sku_id: str | None = Query(None)):
    db  = get_db()
    svc = OptimizationService(db)
    data = await svc.get_optimization_summary(sku_id=sku_id)
    return {"success": True, "data": data}


@router.get("/eoq")
async def eoq(sku_id: str | None = Query(None)):
    db  = get_db()
    svc = OptimizationService(db)
    data = await svc.calculate_eoq(sku_id=sku_id)
    return {"success": True, "data": data}


@router.get("/reorder")
async def reorder():
    db  = get_db()
    svc = OptimizationService(db)
    data = await svc.get_reorder_recommendations()
    return {"success": True, "data": data}
