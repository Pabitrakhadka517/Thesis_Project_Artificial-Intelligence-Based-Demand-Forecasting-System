"""
ML Forecast Service — orchestrates the full AI pipeline.

Responsibilities:
  • Kick off training (single SKU or all SKUs from CSV)
  • Run forecasts and persist results to MongoDB
  • Compute all inventory optimisation metrics
  • Return actionable recommendations to API layer

MongoDB collections used:
  mlModels        — model metadata + per-model evaluation metrics
  mlForecasts     — stored predictions per SKU
  mlInventoryRecs — inventory recommendations per SKU

Inventory metrics computed:
  • Safety Stock            — Z95 × σ_demand × √(lead_time)
  • Reorder Point           — μ_daily × lead_time + safety_stock
  • EOQ                     — √(2 × D × S / H)
  • Average Inventory       — EOQ/2 + safety_stock  (classic EOQ formula)
  • Suggested Purchase Qty  — max(EOQ, ROP − current_stock + safety_stock)
  • Inventory Turnover      — annual_demand / avg_inventory  (units basis)
  • Stockout Risk           — high / medium / low + probability %
  • Overstock Risk          — high / medium / low + probability %
  • Days of Stock           — current_stock / daily_demand
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime
from typing import Optional

import numpy as np

from app.ml.model_trainer import ModelTrainer, load_metadata
from app.ml.predictor import DemandPredictor
from app.ml.preprocessor import DataPreprocessor
from app.core import inventory_math as im

# ── constants ──────────────────────────────────────────────────────────────────
# Re-exported from the shared module so existing references to these names
# elsewhere in this file (and their echo into the API response payload)
# keep working without a wider rename.
ORDERING_COST = im.ORDERING_COST
Z_95          = im.Z_95
HOLDING_RATE  = im.HOLDING_RATE

# RF+XGBoost+LSTM training is CPU/memory heavy (2-5 min/SKU). With no auth in
# front of this service (tracked separately), cap concurrent training jobs so
# a burst of requests can't exhaust the host. Module-level (not per-instance)
# since each request builds a fresh MLForecastService.
_MAX_CONCURRENT_TRAININGS = 2
_active_trainings = 0


class TrainingBusyError(Exception):
    """Raised when the concurrent-training cap is already reached."""


class MLForecastService:
    def __init__(self, db):
        self.db        = db
        self.prep      = DataPreprocessor()
        self.trainer   = ModelTrainer(self.prep)
        self.predictor = DemandPredictor(self.prep)

    # ── training ───────────────────────────────────────────────────────────────

    async def train_sku(self, sku_id: str) -> dict:
        """Train RF + XGBoost + LSTM for one SKU; persist metadata to MongoDB."""
        global _active_trainings
        if _active_trainings >= _MAX_CONCURRENT_TRAININGS:
            raise TrainingBusyError(
                f"Too many training jobs already running (max {_MAX_CONCURRENT_TRAININGS} concurrent) — retry shortly."
            )
        _active_trainings += 1
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, self.trainer.train_sku, sku_id
            )
            await self._upsert_model_meta(result)
            return result
        finally:
            _active_trainings -= 1

    async def train_all(self, sku_ids: Optional[list[str]] = None) -> dict:
        """
        Train all (or specified) SKUs sequentially.
        Returns a summary with per-SKU outcomes.
        """
        targets = sku_ids or self.prep.get_sku_list()
        summary = {"total": len(targets), "trained": 0, "failed": 0, "results": []}

        for sku_id in targets:
            try:
                res = await self.train_sku(sku_id)
                summary["trained"] += 1
                summary["results"].append({"sku_id": sku_id, "status": "ok", **res})
            except Exception as exc:
                summary["failed"] += 1
                summary["results"].append({"sku_id": sku_id, "status": "error", "error": str(exc)})

        return summary

    # ── forecasting ────────────────────────────────────────────────────────────

    async def forecast(
        self,
        sku_id: str,
        horizon_days: int = 30,
        model_name: Optional[str] = None,
    ) -> dict:
        """
        Generate demand forecast and persist to MongoDB.
        Returns the full forecast payload including inventory recommendations.
        """
        forecast_result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self.predictor.predict(sku_id, horizon_days, model_name),
        )

        sku_meta      = self.prep.get_sku_meta(sku_id)
        inventory_rec = await self._compute_inventory_metrics(sku_meta, forecast_result)

        payload = {
            **forecast_result,
            "inventory":  inventory_rec,
            "created_at": datetime.utcnow(),
        }

        await self.db["mlForecasts"].replace_one(
            {"sku_id": sku_id, "model": forecast_result["model"]},
            payload,
            upsert=True,
        )

        await self.db["mlInventoryRecs"].replace_one(
            {"sku_id": sku_id},
            {**inventory_rec, "sku_id": sku_id, "updated_at": datetime.utcnow()},
            upsert=True,
        )

        payload.pop("created_at", None)
        return payload

    async def get_stored_forecast(self, sku_id: str, model: Optional[str] = None) -> Optional[dict]:
        q = {"sku_id": sku_id}
        if model:
            q["model"] = model
        doc = await self.db["mlForecasts"].find_one(q, sort=[("created_at", -1)])
        if doc:
            doc.pop("_id", None)
            doc.pop("created_at", None)
        return doc

    async def list_stored_forecasts(self, limit: int = 100) -> list[dict]:
        cursor = self.db["mlForecasts"].find({}).sort("created_at", -1).limit(limit)
        out = []
        async for doc in cursor:
            doc.pop("_id", None)
            doc.pop("created_at", None)
            out.append(doc)
        return out

    # ── model info ─────────────────────────────────────────────────────────────

    async def get_model_info(self, sku_id: Optional[str] = None) -> list[dict]:
        q = {"sku_id": sku_id} if sku_id else {}
        cursor = self.db["mlModels"].find(q).sort("trained_at", -1)
        out = []
        async for doc in cursor:
            doc.pop("_id", None)
            out.append(doc)
        return out

    async def compare_models(self, sku_id: str) -> dict:
        """Return side-by-side metrics for RF / XGBoost / LSTM."""
        meta = load_metadata(sku_id)
        if meta is None:
            raise ValueError(f"No trained models found for '{sku_id}'")

        comparison = []
        all_metrics = meta.get("metrics", {})
        for model_name in ["random_forest", "xgboost", "lstm"]:
            m = all_metrics.get(model_name, {})
            comparison.append({
                "model":    model_name,
                "mae":      m.get("mae"),
                "rmse":     m.get("rmse"),
                "mape":     m.get("mape"),
                "r2":       m.get("r2"),
                "cv_mae":   m.get("cv_mae"),
                "cv_rmse":  m.get("cv_rmse"),
                "cv_mape":  m.get("cv_mape"),
                "cv_r2":    m.get("cv_r2"),
                "cv_folds": m.get("cv_folds"),
                "is_best":  model_name == meta.get("best_model"),
            })

        return {
            "sku_id":             sku_id,
            "best_model":         meta.get("best_model"),
            "comparison":         comparison,
            "feature_importance": meta.get("feature_importance", {}),
            "trained_at":         meta.get("trained_at"),
            "tuned":              meta.get("tuned", False),
        }

    async def get_feature_importance(self, sku_id: str) -> dict:
        """Return feature importances for RF and XGBoost models."""
        meta = load_metadata(sku_id)
        if not meta:
            raise ValueError(f"No trained models found for '{sku_id}'")
        fi = meta.get("feature_importance", {})
        if not fi:
            raise ValueError(
                f"Feature importance not available for '{sku_id}'. "
                "Retrain the model to compute it."
            )
        return {
            "sku_id":             sku_id,
            "best_model":         meta.get("best_model"),
            "feature_importance": fi,
            "trained_at":         meta.get("trained_at"),
        }

    # ── inventory recommendations ──────────────────────────────────────────────

    async def get_inventory_recommendations(
        self,
        sku_id: Optional[str] = None,
        risk_filter: Optional[str] = None,
    ) -> list[dict]:
        q: dict = {}
        if sku_id:
            q["sku_id"] = sku_id
        if risk_filter:
            q["stockout_risk"] = risk_filter

        cursor = self.db["mlInventoryRecs"].find(q).sort("stockout_probability", -1)
        out = []
        async for doc in cursor:
            doc.pop("_id", None)
            out.append(doc)
        return out

    async def get_reorder_alerts(self) -> list[dict]:
        cursor = self.db["mlInventoryRecs"].find(
            {"needs_reorder": True}
        ).sort("days_of_stock", 1)
        out = []
        async for doc in cursor:
            doc.pop("_id", None)
            out.append(doc)
        return out

    # ── private helpers ────────────────────────────────────────────────────────

    async def _upsert_model_meta(self, result: dict) -> None:
        doc = {**result, "trained_at": datetime.utcnow()}
        await self.db["mlModels"].replace_one(
            {"sku_id": result["sku_id"]},
            doc,
            upsert=True,
        )

    async def _compute_inventory_metrics(
        self, sku_meta: dict, forecast_result: dict
    ) -> dict:
        """
        Compute all inventory planning metrics from the forecast.

        Tries to fetch live inventory from MongoDB first; falls back to
        dataset values (reorder_level, max_stock) for dissertation demos.
        """
        sku_id = sku_meta.get("product_sku", "")

        product: dict = {}
        if self.db is not None:
            try:
                product = await self.db["products"].find_one({"sku": sku_id}) or {}
            except Exception:
                pass

        current_stock_raw = product.get("currentStock")
        if current_stock_raw is not None:
            current_stock = float(current_stock_raw)
        else:
            current_stock = float(sku_meta.get("max_stock", 500) * 0.6)

        # ── forecast demand stats ──────────────────────────────────────────────
        predictions  = forecast_result.get("predictions", [])
        horizon_days = max(len(predictions), 1)
        demands      = [p["predicted_qty"] for p in predictions]
        forecast_qty = float(sum(demands))
        daily_demand = forecast_qty / horizon_days
        # Real historical demand variability, computed alongside the forecast
        # in predictor.py (from actual past sales, not the forecast curve
        # itself — see inventory_math.safety_stock()'s docstring). Falls back
        # to a demand-proportional estimate only if that's ever unavailable
        # (e.g. a stored forecast predating this field).
        _hist_std    = forecast_result.get("historical_demand_std")
        demand_std   = float(_hist_std) if _hist_std is not None else daily_demand * im.DEMAND_STD_CV_FALLBACK
        annual_demand = daily_demand * 365

        # ── product static ─────────────────────────────────────────────────────
        lead_time     = int(sku_meta.get("lead_time_days", 7))
        buying_price  = float(sku_meta.get("buying_price",   100.0))
        selling_price = float(sku_meta.get("selling_price",  120.0))
        max_stock     = float(sku_meta.get("max_stock", 1000))

        # ── Safety Stock, Reorder Point, EOQ, Suggested Purchase ───────────────
        # All four via the shared formulas in app/core/inventory_math.py — see
        # that module for the worked examples and why suggested_purchase must
        # not add safety_stock or eoq a second time on top of the ROP gap.
        safety_stock  = im.safety_stock(demand_std, lead_time)
        reorder_point = im.reorder_point(daily_demand, lead_time, safety_stock)
        holding_cost_per_unit = max(1.0, buying_price * HOLDING_RATE)
        eoq = im.eoq(annual_demand, order_cost=ORDERING_COST, holding_cost_per_unit=holding_cost_per_unit)

        # ── Average Inventory (EOQ model) ──────────────────────────────────────
        # Using the classic EOQ formula: avg_inventory = EOQ/2 + safety_stock
        # This is more accurate than the previous max_stock/2 approximation,
        # which ignored the actual reorder cycle and safety stock.
        avg_inventory = max(1.0, eoq / 2 + safety_stock)

        # ── Suggested Purchase Quantity ────────────────────────────────────────
        suggested_purchase = im.suggested_purchase_qty(current_stock, reorder_point, eoq)

        # ── Days of Stock ──────────────────────────────────────────────────────
        days_of_stock = (
            round(current_stock / daily_demand) if daily_demand > 0 else 9999
        )

        # ── Inventory Turnover Ratio ───────────────────────────────────────────
        # ITR = annual_demand / avg_inventory (units basis, cycle-stock model)
        inventory_turnover = round(annual_demand / avg_inventory, 2)

        # ── Stockout Risk ──────────────────────────────────────────────────────
        stockout_prob = self._stockout_probability(
            current_stock, forecast_qty, demand_std, horizon_days
        )
        if stockout_prob >= 60 or days_of_stock < lead_time:
            stockout_risk = "high"
        elif stockout_prob >= 30 or days_of_stock < lead_time * 2:
            stockout_risk = "medium"
        else:
            stockout_risk = "low"

        # ── Overstock Risk ─────────────────────────────────────────────────────
        overstock_excess = max(0, days_of_stock - 60)
        overstock_prob   = round(min(100.0, overstock_excess / 30 * 100), 1)
        if overstock_prob >= 70:
            overstock_risk = "high"
        elif overstock_prob >= 35:
            overstock_risk = "medium"
        else:
            overstock_risk = "low"

        # ── Demand trend ───────────────────────────────────────────────────────
        demand_trend = self._demand_trend(demands)

        # ── Explanation ────────────────────────────────────────────────────────
        explanation = self._build_explanation(
            sku_meta=sku_meta,
            current_stock=int(current_stock),
            daily_demand=daily_demand,
            days_of_stock=days_of_stock,
            reorder_point=reorder_point,
            safety_stock=safety_stock,
            eoq=eoq,
            suggested_purchase=suggested_purchase,
            stockout_risk=stockout_risk,
            demand_trend=demand_trend,
            lead_time=lead_time,
            confidence_score=forecast_result.get("confidence_score", 50),
        )

        return {
            "sku_id":                sku_id,
            "product_name":          sku_meta.get("product_name", ""),
            "category":              sku_meta.get("category", ""),
            "current_stock":         int(current_stock),
            "daily_demand":          round(daily_demand, 2),
            "forecast_qty":          round(forecast_qty, 1),
            "demand_std":            round(demand_std, 2),
            "annual_demand":         round(annual_demand, 1),
            # Core metrics
            "safety_stock":          safety_stock,
            "reorder_point":         reorder_point,
            "eoq":                   eoq,
            "avg_inventory":         round(avg_inventory, 1),
            "suggested_purchase":    suggested_purchase,
            "inventory_turnover":    inventory_turnover,
            # Risk
            "stockout_risk":         stockout_risk,
            "stockout_probability":  round(stockout_prob, 1),
            "overstock_risk":        overstock_risk,
            "overstock_probability": overstock_prob,
            "days_of_stock":         days_of_stock,
            # Flags
            "needs_reorder":         current_stock <= reorder_point,
            "demand_trend":          demand_trend,
            # Product context
            "lead_time_days":        lead_time,
            "buying_price":          buying_price,
            "selling_price":         selling_price,
            "max_stock":             int(max_stock),
            "holding_cost_per_unit": round(holding_cost_per_unit, 2),
            "ordering_cost":         ORDERING_COST,
            "service_level":         "95%",
            # Explanation
            "explanation":           explanation,
        }

    @staticmethod
    def _stockout_probability(
        stock: float, mean_demand: float, std_demand: float, horizon: int
    ) -> float:
        from scipy import stats

        horizon_std = std_demand * math.sqrt(max(1, horizon))
        if horizon_std > 0:
            z    = (stock - mean_demand) / horizon_std
            prob = (1 - stats.norm.cdf(z)) * 100
        else:
            prob = 100.0 if stock < mean_demand else 0.0
        return float(np.clip(prob, 0.0, 100.0))

    @staticmethod
    def _demand_trend(demands: list[float]) -> str:
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

    @staticmethod
    def _build_explanation(
        *,
        sku_meta: dict,
        current_stock: int,
        daily_demand: float,
        days_of_stock: int,
        reorder_point: int,
        safety_stock: int,
        eoq: int,
        suggested_purchase: int,
        stockout_risk: str,
        demand_trend: str,
        lead_time: int,
        confidence_score: int,
    ) -> str:
        name = sku_meta.get("product_name", sku_meta.get("product_sku", "Product"))
        parts: list[str] = []

        risk_msgs = {
            "high":   (
                f"HIGH RISK: {name} has only {days_of_stock} day(s) of stock remaining "
                f"against a {lead_time}-day supplier lead time — stockout is likely before the next delivery."
            ),
            "medium": (
                f"Moderate risk: {name} has ~{days_of_stock} days of stock. "
                f"Reorder soon to avoid disruption."
            ),
            "low": (
                f"{name} is well-stocked with ~{days_of_stock} days of inventory."
            ),
        }
        parts.append(risk_msgs.get(stockout_risk, ""))

        trend_msgs = {
            "rising":  "Demand is trending upward",
            "falling": "Demand is trending downward",
            "stable":  "Demand is steady",
        }
        parts.append(
            f"{trend_msgs.get(demand_trend, 'Demand is steady')} "
            f"at ~{round(daily_demand, 1)} units/day."
        )

        parts.append(
            f"Safety stock: {safety_stock} units (Z=1.645, 95% service level). "
            f"Reorder point: {reorder_point} units."
        )

        if suggested_purchase > 0:
            parts.append(
                f"Suggested order: {suggested_purchase} units "
                f"(EOQ formula recommends {eoq} units per cycle) to cover "
                f"demand through the {lead_time}-day replenishment lead time."
            )

        parts.append(f"Forecast confidence: {confidence_score}%.")
        return " ".join(p for p in parts if p)

    # ── LLM Insights ──────────────────────────────────────────────────────────

    async def generate_insights(self) -> dict:
        """Fetch inventory recs from MongoDB and call Gemini API for business insights."""
        import os
        import httpx

        recs: list[dict] = []
        if self.db is not None:
            cursor = self.db.mlInventoryRecs.find({}).sort("stockout_probability", -1).limit(60)
            async for doc in cursor:
                doc.pop("_id", None)
                recs.append(doc)

        if not recs:
            return {
                "insights": "No inventory data available yet. Run forecasts first via the Demand Forecasting page to generate inventory recommendations.",
                "generated_at": datetime.utcnow().isoformat(),
                "data_summary": {},
            }

        needs_reorder = [r for r in recs if r.get("needs_reorder")]
        high_risk     = [r for r in recs if r.get("stockout_risk") == "high"]
        overstock     = [r for r in recs if r.get("overstock_risk") == "high"]
        trend_up      = [r for r in recs if r.get("demand_trend") == "rising"]
        trend_down    = [r for r in recs if r.get("demand_trend") == "falling"]

        total_budget = sum(
            (r.get("suggested_purchase") or 0) * (r.get("buying_price") or 0)
            for r in needs_reorder
        )

        def fmt_list(items, max_n=8):
            lines = []
            for r in items[:max_n]:
                name   = r.get("product_name") or r.get("sku_id", "?")
                sp     = r.get("suggested_purchase", 0)
                rp     = r.get("reorder_point", 0)
                dos    = r.get("days_of_stock", "?")
                sp_pct = r.get("stockout_probability", 0)
                trend  = r.get("demand_trend", "stable")
                lines.append(
                    f"  • {name}: order {sp} units | ROP={rp} | {dos} days stock | "
                    f"{sp_pct}% stockout prob | trend={trend}"
                )
            return "\n".join(lines) if lines else "  None"

        prompt = f"""You are a senior inventory analyst for Himalayan Wholesale Suppliers, a wholesale grocery distributor in Kathmandu Valley, Nepal. Analyze the AI-generated inventory data below and provide concise, actionable business insights.

INVENTORY SNAPSHOT:
• Total SKUs analysed: {len(recs)}
• Need immediate reorder: {len(needs_reorder)}
• High stockout risk: {len(high_risk)}
• Overstock risk: {len(overstock)}
• Demand rising: {len(trend_up)} SKUs | Demand falling: {len(trend_down)} SKUs
• Estimated purchase budget needed: NPR {total_budget:,.0f}

TOP REORDER ITEMS:
{fmt_list(needs_reorder)}

HIGH STOCKOUT RISK:
{fmt_list(high_risk, 5)}

RISING DEMAND PRODUCTS:
{fmt_list(trend_up, 5)}

Provide insights in these exact sections — be specific, concise, and Nepal-wholesale focused:

## Executive Summary
2-3 sentences on overall inventory health and the single most urgent action.

## Critical Actions (This Week)
Up to 4 bullet points — specific products, quantities, and why.

## Purchasing Strategy
Budget allocation guidance, which suppliers to prioritise, and any bulk-buy opportunities.

## Demand Trends & Opportunities
What products are gaining momentum and how to capitalise; what products to reduce exposure on.

## Festival & Seasonal Risk
Upcoming Nepal festival risk considerations and pre-stocking recommendations (Dashain, Tihar, etc.).

Keep each section to 3-4 bullet points maximum. Use NPR currency. Be direct and actionable."""

        data_summary = {
            "total_skus":       len(recs),
            "needs_reorder":    len(needs_reorder),
            "high_risk":        len(high_risk),
            "overstock":        len(overstock),
            "estimated_budget": round(total_budget),
        }

        _PLACEHOLDERS = {"", "your-gemini-api-key-here", "your-api-key-here"}

        api_key = os.getenv("GEMINI_API_KEY", "")
        if api_key in _PLACEHOLDERS:
            return {
                "insights": (
                    "**Gemini API key not configured.**\n\n"
                    "Add your Google Gemini API key to `ai-service/.env`:\n"
                    "```\nGEMINI_API_KEY=AIza...\n```\n"
                    "Get a free key at https://aistudio.google.com/app/apikey — "
                    "then restart the AI service."
                ),
                "generated_at": datetime.utcnow().isoformat(),
                "data_summary": data_summary,
            }

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.0-flash:generateContent?key={api_key}"
        )
        req_payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 1200, "temperature": 0.4},
        }

        # Bug fix 1: wrap the HTTP call so that Gemini API errors (invalid key,
        # quota exceeded, 4xx/5xx) and network failures all return a friendly
        # message instead of crashing with HTTPException(500).
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await client.post(url, json=req_payload)
                resp.raise_for_status()
                result = resp.json()
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                hint = {
                    400: "The request was rejected — check that the API key is valid.",
                    401: "Authentication failed — the GEMINI_API_KEY may be invalid or revoked.",
                    403: "Access denied — the API key may lack permissions for this model.",
                    429: "Quota exceeded — too many requests. Wait a moment and try again.",
                }.get(status, f"Gemini returned HTTP {status}.")
                return {
                    "insights": f"**Gemini API error ({status}).** {hint}",
                    "generated_at": datetime.utcnow().isoformat(),
                    "data_summary": data_summary,
                }
            except (httpx.ConnectError, httpx.TimeoutException):
                return {
                    "insights": (
                        "**Could not reach the Gemini API.** "
                        "Check the AI service's internet connection and try again."
                    ),
                    "generated_at": datetime.utcnow().isoformat(),
                    "data_summary": data_summary,
                }
            except Exception as exc:
                return {
                    "insights": f"**Unexpected error calling Gemini:** {exc}",
                    "generated_at": datetime.utcnow().isoformat(),
                    "data_summary": data_summary,
                }

        # Bug fix 2: Gemini returns {"candidates": []} when the safety filter
        # blocks the response, and omits "candidates" entirely on a hard safety
        # block.  Both cases caused an IndexError / KeyError → 500.
        candidates = result.get("candidates") or []
        if not candidates:
            block_reason = result.get("promptFeedback", {}).get("blockReason", "content filter")
            return {
                "insights": (
                    f"**Gemini blocked the response** (reason: {block_reason}).\n\n"
                    "This is caused by safety filters on the inventory prompt. "
                    "Run forecasts again to refresh the underlying data and retry."
                ),
                "generated_at": datetime.utcnow().isoformat(),
                "data_summary": data_summary,
            }

        # Bug fix 3: guard against unexpected response shapes (missing "content",
        # empty "parts", etc.) that would previously throw KeyError/IndexError.
        try:
            insights_text = candidates[0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError):
            insights_text = (
                "**Could not parse the AI response.** "
                "The Gemini API returned an unexpected format. Please try again."
            )

        return {
            "insights":      insights_text,
            "generated_at":  datetime.utcnow().isoformat(),
            "data_summary":  data_summary,
        }
