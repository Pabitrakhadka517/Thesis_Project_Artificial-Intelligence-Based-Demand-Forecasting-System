"""
Inventory Analysis Service — unified per-product AI analysis.

Loads real sales history from MongoDB `sales` collection (NOT the legacy
`saleItems` collection used by the old ForecastingService), runs Prophet,
and computes all inventory-planning metrics.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd


# ── constants ──────────────────────────────────────────────────────────────────
ORDERING_COST   = 500.0   # NPR per purchase order
Z_95            = 1.645   # z-score for 95% service level
CACHE_HOURS     = 6
COLLECTION_NAME = "inventoryPredictions"


class InventoryAnalysisService:
    def __init__(self, db):
        self.db = db

    # ── public API ─────────────────────────────────────────────────────────────

    async def analyze(self, product_id: str, horizon_days: int = 30) -> dict:
        """Run full analysis for one product and persist to MongoDB."""
        from bson import ObjectId

        product = await self.db["products"].find_one({"_id": ObjectId(product_id)})
        if not product:
            raise ValueError(f"Product {product_id} not found")

        sku           = product.get("sku", "")
        name          = product.get("name", "Unknown")
        current_stock = float(product.get("currentStock", 0))
        buying_price  = float(product.get("buyingPrice", 100))
        lead_time     = int(product.get("leadTimeDays", 7))

        df       = await self._load_sales(product_id, days=180)
        has_data = len(df) >= 14

        if has_data:
            try:
                forecast_result = self._run_prophet(df, horizon_days)
                predictions     = forecast_result["predictions"]
                metrics         = forecast_result["metrics"]
                mape            = metrics.get("mape") or 30.0
            except Exception as exc:
                predictions = self._fallback_predictions(product, horizon_days)
                metrics     = {}
                mape        = 35.0
                has_data    = False
        else:
            predictions = self._fallback_predictions(product, horizon_days)
            metrics     = {}
            mape        = 35.0

        # ── derived metrics ────────────────────────────────────────────────────
        demands       = [p["demand"] for p in predictions]
        forecast_demand = sum(demands)
        daily_demand    = forecast_demand / horizon_days if horizon_days else 1.0
        demand_std      = float(np.std(demands)) if len(demands) > 1 else daily_demand * 0.3

        safety_stock    = max(1, round(Z_95 * demand_std * math.sqrt(lead_time)))
        reorder_point   = round(daily_demand * lead_time + safety_stock)

        holding_cost    = max(1.0, buying_price * 0.20)
        annual_demand   = daily_demand * 365
        eoq             = (round(math.sqrt((2 * annual_demand * ORDERING_COST) / holding_cost))
                          if annual_demand > 0 else 0)

        if current_stock <= reorder_point:
            suggested_purchase = max(eoq, round(reorder_point - current_stock + eoq))
        else:
            suggested_purchase = 0

        days_of_stock = round(current_stock / daily_demand) if daily_demand > 0 else 999

        demand_trend = self._calc_trend(demands)

        confidence_score = (max(20, min(95, round(95 - max(0.0, mape - 5) * 0.9)))
                           if mape is not None else 30)

        stockout_prob   = self._stockout_prob(current_stock, forecast_demand, demand_std, horizon_days)
        overstock_prob  = self._overstock_prob(days_of_stock, daily_demand)

        if stockout_prob > 60 or current_stock < safety_stock:
            inventory_risk = "high"
        elif stockout_prob > 30 or current_stock < reorder_point:
            inventory_risk = "medium"
        else:
            inventory_risk = "low"

        explanation = self._explain(
            name=name,
            current_stock=int(current_stock),
            daily_demand=daily_demand,
            days_of_stock=days_of_stock,
            reorder_point=reorder_point,
            trend=demand_trend,
            risk=inventory_risk,
            suggested_purchase=suggested_purchase,
            eoq=eoq,
            lead_time=lead_time,
            has_data=has_data,
        )

        result = {
            "product_id":           product_id,
            "sku":                  sku,
            "product_name":         name,
            "current_stock":        int(current_stock),
            "forecast_demand":      round(forecast_demand, 1),
            "daily_demand":         round(daily_demand, 2),
            "safety_stock":         safety_stock,
            "reorder_point":        reorder_point,
            "eoq":                  eoq,
            "suggested_purchase":   suggested_purchase,
            "confidence_score":     confidence_score,
            "demand_trend":         demand_trend,
            "prediction_date":      datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "explanation":          explanation,
            "inventory_risk":       inventory_risk,
            "stockout_probability": stockout_prob,
            "overstock_probability":overstock_prob,
            "days_of_stock":        days_of_stock,
            "lead_time_days":       lead_time,
            "buying_price":         buying_price,
            "forecast_data":        predictions,
            "metrics":              metrics,
            "has_historical_data":  has_data,
            "horizon_days":         horizon_days,
            "analyzed_at":          datetime.utcnow(),
            "status":               "ready",
        }

        await self.db[COLLECTION_NAME].replace_one(
            {"product_id": product_id},
            result,
            upsert=True,
        )
        return result

    async def get_dashboard(self) -> dict:
        """Aggregate dashboard stats from cached predictions."""
        cursor      = self.db[COLLECTION_NAME].find({"status": "ready"}).sort("analyzed_at", -1)
        predictions = []
        async for doc in cursor:
            doc.pop("_id", None)
            predictions.append(doc)

        if not predictions:
            return {
                "summary":          {"total": 0, "needs_reorder": 0, "at_risk": 0, "healthy": 0},
                "top_reorder":      [],
                "at_risk_products": [],
                "demand_spikes":    [],
                "avg_confidence":   0,
                "health_score":     0,
                "has_data":         False,
            }

        n             = len(predictions)
        needs_reorder = [p for p in predictions if p.get("suggested_purchase", 0) > 0]
        at_risk       = [p for p in predictions if p.get("inventory_risk") == "high"]
        healthy       = [p for p in predictions if p.get("inventory_risk") == "low"]

        avg_confidence = round(sum(p.get("confidence_score", 0) for p in predictions) / n)
        risk_scores    = {"low": 100, "medium": 55, "high": 0}
        health_score   = round(sum(risk_scores.get(p.get("inventory_risk", "medium"), 55)
                                   for p in predictions) / n)

        top_reorder = sorted(
            [p for p in predictions if p.get("suggested_purchase", 0) > 0],
            key=lambda x: x.get("days_of_stock", 999)
        )[:10]

        at_risk_sorted = sorted(
            at_risk, key=lambda x: x.get("stockout_probability", 0), reverse=True
        )[:10]

        demand_spikes = sorted(
            [p for p in predictions if p.get("demand_trend") == "rising"],
            key=lambda x: x.get("forecast_demand", 0), reverse=True
        )[:5]

        return {
            "summary": {
                "total":        n,
                "needs_reorder":len(needs_reorder),
                "at_risk":      len(at_risk),
                "healthy":      len(healthy),
            },
            "top_reorder":      top_reorder,
            "at_risk_products": at_risk_sorted,
            "demand_spikes":    demand_spikes,
            "avg_confidence":   avg_confidence,
            "health_score":     health_score,
            "has_data":         True,
        }

    async def get_all_predictions(self) -> list[dict]:
        """Return all cached ready predictions."""
        cursor = self.db[COLLECTION_NAME].find({"status": "ready"}).sort("analyzed_at", -1)
        out = []
        async for doc in cursor:
            doc.pop("_id", None)
            out.append(doc)
        return out

    # ── private helpers ────────────────────────────────────────────────────────

    async def _load_sales(self, product_id: str, days: int = 180) -> pd.DataFrame:
        from bson import ObjectId

        since    = datetime.utcnow() - timedelta(days=days)
        oid      = ObjectId(product_id)

        pipeline = [
            {"$match": {"saleDate": {"$gte": since}, "status": "completed"}},
            {"$unwind": "$items"},
            {"$match": {"items.product": oid}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$saleDate"}},
                    "qty": {"$sum": "$items.quantity"},
                }
            },
            {"$sort": {"_id": 1}},
        ]

        rows = []
        async for doc in self.db["sales"].aggregate(pipeline):
            rows.append({"date": pd.Timestamp(doc["_id"]), "qty": float(doc["qty"])})

        if not rows:
            return pd.DataFrame(columns=["date", "qty"])

        df         = pd.DataFrame(rows)
        date_range = pd.date_range(start=df["date"].min(), end=df["date"].max(), freq="D")
        df         = df.set_index("date").reindex(date_range, fill_value=0.0).reset_index()
        df.columns = ["date", "qty"]
        return df

    def _run_prophet(self, df: pd.DataFrame, horizon: int) -> dict:
        from prophet import Prophet
        from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error

        prop_df = df.rename(columns={"date": "ds", "qty": "y"})
        prop_df = prop_df[prop_df["y"] >= 0].copy()

        split = max(7, int(len(prop_df) * 0.8))
        train, test = prop_df.iloc[:split], prop_df.iloc[split:]

        m = Prophet(
            daily_seasonality=True,
            weekly_seasonality=True,
            yearly_seasonality=(len(prop_df) >= 180),
            interval_width=0.90,
            changepoint_prior_scale=0.05,
        )
        m.fit(train)

        metrics: dict = {}
        if len(test) > 1:
            fut_test = m.make_future_dataframe(periods=len(test))
            fc_test  = m.predict(fut_test)
            y_pred   = np.maximum(fc_test["yhat"].iloc[-len(test):].values, 0)
            y_true   = test["y"].values
            eps      = 1e-6
            mape_val = float(mean_absolute_percentage_error(y_true + eps, y_pred + eps)) * 100
            rmse_val = float(np.sqrt(mean_squared_error(y_true, y_pred)))
            metrics  = {"mape": round(mape_val, 2), "rmse": round(rmse_val, 2)}

        # Final model on full data
        m2     = Prophet(
            daily_seasonality=True,
            weekly_seasonality=True,
            yearly_seasonality=(len(prop_df) >= 180),
            interval_width=0.90,
            changepoint_prior_scale=0.05,
        )
        m2.fit(prop_df)
        future = m2.make_future_dataframe(periods=horizon)
        fc     = m2.predict(future)
        fc_fut = fc.tail(horizon)

        predictions = [
            {
                "date":   row["ds"].strftime("%Y-%m-%d"),
                "demand": max(0.0, round(float(row["yhat"]), 2)),
                "lower":  max(0.0, round(float(row["yhat_lower"]), 2)),
                "upper":  max(0.0, round(float(row["yhat_upper"]), 2)),
            }
            for _, row in fc_fut.iterrows()
        ]
        return {"predictions": predictions, "metrics": metrics}

    def _fallback_predictions(self, product: dict, horizon: int) -> list[dict]:
        """Simple linear fallback when insufficient history."""
        reorder  = float(product.get("reorderLevel", 10))
        lead     = max(1, int(product.get("leadTimeDays", 7)))
        base_daily = max(0.5, reorder / (lead * 3))

        result = []
        for i in range(horizon):
            d = (datetime.utcnow() + timedelta(days=i + 1)).strftime("%Y-%m-%d")
            result.append({
                "date":   d,
                "demand": round(base_daily, 2),
                "lower":  round(base_daily * 0.7, 2),
                "upper":  round(base_daily * 1.3, 2),
            })
        return result

    def _calc_trend(self, demands: list[float]) -> str:
        if len(demands) < 14:
            return "stable"
        first7 = sum(demands[:7]) / 7
        last7  = sum(demands[-7:]) / 7
        if first7 <= 0:
            return "stable"
        ratio = last7 / first7
        if ratio > 1.08:
            return "rising"
        if ratio < 0.92:
            return "falling"
        return "stable"

    def _stockout_prob(self, stock: float, mean_demand: float, std_demand: float,
                       horizon: int) -> float:
        from scipy import stats

        forecast_std = std_demand * math.sqrt(horizon)
        if forecast_std > 0:
            z    = (stock - mean_demand) / forecast_std
            prob = (1 - stats.norm.cdf(z)) * 100
        else:
            prob = 100.0 if stock < mean_demand else 0.0
        return round(max(0.0, min(100.0, prob)), 1)

    def _overstock_prob(self, days_of_stock: int, daily_demand: float) -> float:
        if daily_demand <= 0:
            return 100.0
        excess = days_of_stock - 60
        return round(max(0.0, min(100.0, excess / 30 * 100)), 1)

    def _explain(self, *, name: str, current_stock: int, daily_demand: float,
                 days_of_stock: int, reorder_point: int, trend: str,
                 risk: str, suggested_purchase: int, eoq: int,
                 lead_time: int, has_data: bool) -> str:
        parts = []

        if not has_data:
            parts.append(f"Limited sales history — estimates based on product settings.")

        risk_msgs = {
            "high":   f"HIGH RISK: With {days_of_stock} days of stock and a {lead_time}-day supplier lead time, {name} may stock out before next delivery.",
            "medium": f"Moderate risk: {name} has ~{days_of_stock} days of stock — reorder soon.",
            "low":    f"{name} is well-stocked with ~{days_of_stock} days of inventory.",
        }
        parts.append(risk_msgs.get(risk, ""))

        trend_msgs = {
            "rising":  f"Demand is trending upward",
            "falling": f"Demand is trending downward",
            "stable":  f"Demand is steady",
        }
        parts.append(f"{trend_msgs.get(trend, 'Demand is steady')} at ~{round(daily_demand, 1)} units/day.")

        if suggested_purchase > 0:
            parts.append(f"Suggested order: {suggested_purchase} units (EOQ formula recommends {eoq}) to cover demand through the lead time.")

        return " ".join(p for p in parts if p)
