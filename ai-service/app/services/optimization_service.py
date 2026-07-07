"""
Inventory Optimization — EOQ, Safety Stock, Reorder Point calculations.
Uses forecast results from forecastResults collection.
"""
from __future__ import annotations
import math
from datetime import datetime
from app.database import get_db


class OptimizationService:
    def __init__(self, db):
        self.db = db

    async def get_optimization_summary(self, sku_id: str | None = None) -> list[dict]:
        query = {}
        if sku_id:
            query["sku_id"] = sku_id

        # Get SKUs + inventory + latest forecast
        cursor = self.db["skus"].find(query)
        results = []

        async for sku in cursor:
            sid = sku.get("sku_id") or str(sku["_id"])

            # Latest forecast
            fc = await self.db["forecastResults"].find_one(
                {"sku_id": sid}, sort=[("created_at", -1)]
            )
            demand_30d = sum(p["predicted_qty"] for p in (fc or {}).get("predictions", [])[:30]) if fc else 0

            # Inventory record
            inv = await self.db["inventory"].find_one({"sku_id": sid}) or {}
            current_stock = inv.get("current_stock", sku.get("current_stock", 0))
            lead_time     = sku.get("lead_time_days", 7)
            holding_cost  = sku.get("holding_cost_per_unit", sku.get("buying_price", 100) * 0.2)
            ordering_cost = sku.get("ordering_cost", 500)  # NPR per order

            daily_demand    = demand_30d / 30 if demand_30d else 1
            annual_demand   = daily_demand * 365
            safety_stock    = round(daily_demand * lead_time * 1.5)
            reorder_point   = round(daily_demand * lead_time + safety_stock)
            eoq             = self._eoq(annual_demand, ordering_cost, holding_cost)
            days_of_stock   = round(current_stock / daily_demand) if daily_demand else 999
            stockout_risk   = "high" if days_of_stock < lead_time else "medium" if days_of_stock < lead_time * 2 else "low"

            results.append({
                "sku_id":         sid,
                "sku_name":       sku.get("name", ""),
                "current_stock":  current_stock,
                "daily_demand":   round(daily_demand, 2),
                "safety_stock":   safety_stock,
                "reorder_point":  reorder_point,
                "eoq":            eoq,
                "days_of_stock":  days_of_stock,
                "stockout_risk":  stockout_risk,
                "lead_time_days": lead_time,
                "needs_reorder":  current_stock <= reorder_point,
            })

        return sorted(results, key=lambda x: x["days_of_stock"])

    def _eoq(self, annual_demand: float, ordering_cost: float, holding_cost: float) -> int:
        if holding_cost <= 0 or annual_demand <= 0:
            return 0
        return round(math.sqrt((2 * annual_demand * ordering_cost) / holding_cost))

    async def calculate_eoq(self, sku_id: str | None = None) -> list[dict]:
        summary = await self.get_optimization_summary(sku_id)
        return [{"sku_id": r["sku_id"], "sku_name": r["sku_name"], "eoq": r["eoq"]} for r in summary]

    async def get_reorder_recommendations(self) -> list[dict]:
        summary = await self.get_optimization_summary()
        return [r for r in summary if r["needs_reorder"]]
