"""
Business Intelligence Engine
==============================
Local AI that generates inventory answers without any external LLM.

Architecture
  1. IntentClassifier  — keyword scoring → best-matching intent
  2. DataLayer         — async MongoDB queries grouped by intent
  3. RuleEngine        — pure business logic (safety stock, ROP, EOQ, health)
  4. ResponseGenerator — rich structured text responses (always available)

All methods are async-safe and return a consistent BIResult dict.
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta
from typing import Any


# ── helpers ────────────────────────────────────────────────────────────────────

def _f(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _npr(v: float) -> str:
    return f"NPR {v:,.0f}"


def _stock_emoji(status: str) -> str:
    return {"critical": "🔴", "low": "🟡", "healthy": "✅", "overstock": "📦"}.get(status, "⚪")


# ── Intent classifier ──────────────────────────────────────────────────────────

_INTENT_MAP: dict[str, dict[str, list[str]]] = {
    "low_stock": {
        "primary": ["low stock", "low in stock", "need reordering", "reorder",
                    "out of stock", "running low", "critical stock", "stockout",
                    "which products need", "products need"],
        "secondary": ["stock", "inventory", "replenish", "shortage"],
    },
    "purchase_recommendation": {
        "primary": ["purchase today", "what to buy", "what should i purchase",
                    "should i order", "how much should i order", "what to order",
                    "purchase recommendation", "order today", "buy today",
                    "what to purchase"],
        "secondary": ["purchase", "order", "buy", "restock", "procure"],
    },
    "inventory_health": {
        "primary": ["inventory health", "health summary", "stock summary",
                    "inventory status", "show inventory", "overall inventory",
                    "inventory overview", "health report", "show health"],
        "secondary": ["health", "summary", "overview", "status", "report"],
    },
    "demand_forecast": {
        "primary": ["forecast", "demand forecast", "predict demand",
                    "demand next", "future demand", "expected demand",
                    "demand trend", "next month", "next week demand",
                    "sales forecast", "forecasted"],
        "secondary": ["predict", "projection", "future", "expected", "trend"],
    },
    "sales_analysis": {
        "primary": ["sales today", "today sales", "monthly sales",
                    "sales performance", "best selling", "top product",
                    "how much sold", "sold the most", "sales this month",
                    "sales summary", "what sold"],
        "secondary": ["sales", "sold", "revenue", "selling", "performance"],
    },
    "supplier_query": {
        "primary": ["best supplier", "supplier performance", "who to contact",
                    "delivery time", "supplier delivery", "fastest supplier",
                    "reliable supplier", "supplier history", "which supplier"],
        "secondary": ["supplier", "vendor", "delivery", "lead time", "contact"],
    },
    "analytics": {
        "primary": ["inventory value", "total value", "forecast accuracy",
                    "revenue trend", "monthly comparison", "analytics",
                    "show analytics", "metrics", "kpi", "turnover", "mape",
                    "explain", "what does", "what is eoq", "what is mape"],
        "secondary": ["value", "accuracy", "trend", "comparison", "analytics", "turnover"],
    },
    "alerts": {
        "primary": ["active alerts", "show alerts", "alerts", "what are the alerts",
                    "any alerts", "stock alerts", "system alerts", "notifications",
                    "what alerts", "critical alerts", "unresolved"],
        "secondary": ["alert", "notification", "warning", "critical", "urgent"],
    },
}


def classify_intent(message: str) -> tuple[str, list[str]]:
    """
    Returns (primary_intent, secondary_intents[]).
    Falls back to 'general' if nothing scores.
    """
    msg = message.lower()
    scores: dict[str, int] = {k: 0 for k in _INTENT_MAP}

    for intent, patterns in _INTENT_MAP.items():
        for phrase in patterns["primary"]:
            if phrase in msg:
                scores[intent] += 10
        for word in patterns["secondary"]:
            if word in msg:
                scores[intent] += 3

    # "how much X should I order" → product_specific
    order_words = ("how much", "how many", "order", "purchase", "buy", "need")
    if any(w in msg for w in order_words) and scores["purchase_recommendation"] > 0:
        scores["purchase_recommendation"] += 5

    best_score = max(scores.values())
    if best_score == 0:
        return "general", []

    primary = max(scores, key=lambda k: scores[k])
    secondary = [k for k, v in scores.items() if v > 0 and k != primary]
    return primary, secondary


# ── Data layer ─────────────────────────────────────────────────────────────────

class DataLayer:
    def __init__(self, db):
        self.db = db

    async def get_products(self) -> list[dict]:
        return await self.db["products"].find(
            {"isActive": True},
            {"name": 1, "sku": 1, "currentStock": 1, "reorderLevel": 1,
             "minStock": 1, "maxStock": 1, "buyingPrice": 1, "sellingPrice": 1,
             "unit": 1, "leadTimeDays": 1, "category": 1, "supplier": 1},
        ).to_list(500)

    async def get_suppliers(self) -> list[dict]:
        return await self.db["suppliers"].find(
            {"isActive": True},
            {"name": 1, "contactPerson": 1, "phone": 1, "email": 1,
             "leadTimeDays": 1, "rating": 1, "reliabilityScore": 1, "address": 1},
        ).sort("rating", -1).to_list(20)

    async def get_ml_forecasts(self) -> list[dict]:
        docs = await self.db["mlForecasts"].find(
            {}, {"sku_id": 1, "product_name": 1, "forecast_30d": 1,
                 "best_model": 1, "confidence": 1, "trend": 1, "daily_forecast": 1},
        ).to_list(200)
        for d in docs:
            d.pop("_id", None)
        return docs

    async def get_ml_inventory_recs(self) -> list[dict]:
        docs = await self.db["mlInventoryRecs"].find(
            {}, {"sku_id": 1, "product_name": 1, "safety_stock": 1,
                 "reorder_point": 1, "eoq": 1, "stockout_risk": 1, "overstock_risk": 1},
        ).to_list(200)
        for d in docs:
            d.pop("_id", None)
        return docs

    async def get_sales_aggregated(self, days: int = 30) -> dict:
        since     = datetime.utcnow() - timedelta(days=days)
        sales_col = self.db["sales"]

        # $lookup joins product name so LLM sees "Rice 5kg" not ObjectId fragments
        top_products_pipeline = [
            {"$match": {"createdAt": {"$gte": since}}},
            {"$group": {
                "_id":           "$product",
                "total_qty":     {"$sum": "$quantity"},
                "total_revenue": {"$sum": {"$multiply": ["$quantity", "$unitPrice"]}},
                "count":         {"$sum": 1},
            }},
            {"$sort": {"total_revenue": -1}},
            {"$limit": 20},
            {"$lookup": {
                "from":         "products",
                "localField":   "_id",
                "foreignField": "_id",
                "as":           "_prod",
            }},
            {"$unwind": {"path": "$_prod", "preserveNullAndEmptyArrays": True}},
        ]

        top_products, daily = await asyncio.gather(
            sales_col.aggregate(top_products_pipeline).to_list(20),
            sales_col.aggregate([
                {"$match": {"createdAt": {"$gte": since}}},
                {"$group": {
                    "_id":     {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}},
                    "revenue": {"$sum": {"$multiply": ["$quantity", "$unitPrice"]}},
                    "qty":     {"$sum": "$quantity"},
                }},
                {"$sort": {"_id": -1}},
                {"$limit": 7},
            ]).to_list(7),
        )

        total_rev = sum(_f(p.get("total_revenue")) for p in top_products)
        total_qty = int(sum(_f(p.get("total_qty")) for p in top_products))
        return {
            "period_days":       days,
            "total_revenue":     total_rev,
            "total_qty":         total_qty,
            "daily_avg_revenue": total_rev / days if days else 0,
            "top_products": [
                {
                    "product_id":   str(p["_id"]),
                    "product_name": (p.get("_prod") or {}).get("name", f"Product({str(p['_id'])[:6]})"),
                    "qty":          int(_f(p.get("total_qty"))),
                    "revenue":      _f(p.get("total_revenue")),
                    "count":        int(_f(p.get("count"))),
                }
                for p in top_products
            ],
            "daily_last_7": [
                {"date": d["_id"], "revenue": _f(d.get("revenue")), "qty": int(_f(d.get("qty")))}
                for d in daily
            ],
        }

    async def get_daily_demand_per_product(self, days: int = 30) -> dict[str, float]:
        """Returns {product_id_str: avg_daily_qty}."""
        since = datetime.utcnow() - timedelta(days=days)
        rows = await self.db["sales"].aggregate([
            {"$match": {"createdAt": {"$gte": since}}},
            {"$group": {
                "_id": "$product",
                "total_qty": {"$sum": "$quantity"},
            }},
        ]).to_list(500)
        return {str(r["_id"]): _f(r["total_qty"]) / days for r in rows}

    async def find_product_by_keyword(self, keyword: str) -> dict | None:
        kw = keyword.strip().lower()
        products = await self.db["products"].find(
            {"isActive": True},
            {"name": 1, "sku": 1, "currentStock": 1, "reorderLevel": 1,
             "minStock": 1, "buyingPrice": 1, "unit": 1, "leadTimeDays": 1},
        ).to_list(200)
        for p in products:
            if kw in p.get("name", "").lower() or kw in p.get("sku", "").lower():
                return p
        # fuzzy: any word of the keyword found in any product name
        words = [w for w in kw.split() if len(w) >= 3]
        for p in products:
            name_l = p.get("name", "").lower()
            if any(w in name_l for w in words):
                return p
        return None

    async def get_active_alerts(self) -> list[dict]:
        return await self.db["alerts"].find(
            {"isResolved": False},
            {"type": 1, "message": 1, "priority": 1},
        ).sort("priority", -1).limit(15).to_list(15)


# ── Rule engine ────────────────────────────────────────────────────────────────

class RuleEngine:

    @staticmethod
    def classify_stock(current: float, reorder: float,
                       min_stock: float, max_stock: float) -> str:
        if current <= 0 or current <= min_stock:
            return "critical"
        if current <= reorder:
            return "low"
        if max_stock > 0 and current >= max_stock * 0.9:
            return "overstock"
        return "healthy"

    @staticmethod
    def days_of_stock(current: float, daily_demand: float) -> int | None:
        if daily_demand <= 0:
            return None
        return int(current / daily_demand)

    @staticmethod
    def safety_stock(daily_demand: float, lead_time: float,
                     service_factor: float = 1.5) -> float:
        return math.ceil(daily_demand * lead_time * service_factor)

    @staticmethod
    def reorder_point(daily_demand: float, lead_time: float,
                      ss: float) -> float:
        return math.ceil(daily_demand * lead_time + ss)

    @staticmethod
    def eoq(annual_demand: float, order_cost: float = 500,
             holding_pct: float = 0.25, unit_cost: float = 100) -> float:
        holding = holding_pct * unit_cost
        if holding <= 0 or annual_demand <= 0:
            return 0
        return math.ceil(math.sqrt((2 * annual_demand * order_cost) / holding))

    @staticmethod
    def suggested_purchase(current: float, forecast_30d: float,
                           ss: float) -> float:
        needed = forecast_30d + ss - current
        return max(0.0, math.ceil(needed))

    @staticmethod
    def health_score(products: list[dict]) -> int:
        if not products:
            return 0
        weights = {"critical": 0, "low": 40, "healthy": 100, "overstock": 60}
        scores = [weights.get(p.get("_status", "healthy"), 100) for p in products]
        return round(sum(scores) / len(scores))


# ── Response generator ─────────────────────────────────────────────────────────

class ResponseGenerator:

    # ── Low stock ──────────────────────────────────────────────────────────────

    @staticmethod
    def low_stock(products_classified: list[dict], daily_demand: dict) -> str:
        critical = [p for p in products_classified if p["_status"] == "critical"]
        low      = [p for p in products_classified if p["_status"] == "low"]

        if not critical and not low:
            return (
                "## ✅ No Low Stock Alerts\n\n"
                "All products are currently above their reorder levels.\n\n"
                "Your inventory is healthy. Continue monitoring daily."
            )

        lines = ["## 📦 Low Stock Report\n"]

        if critical:
            lines.append(f"### 🔴 Critical — {len(critical)} Product(s) Out of Stock or Below Minimum\n")
            for p in critical[:8]:
                dd = daily_demand.get(str(p.get("_id", "")), 0)
                days = RuleEngine.days_of_stock(_f(p["currentStock"]), dd)
                days_str = f"~{days} days remaining" if days is not None else "demand data unavailable"
                lines.append(
                    f"**{p['name']}** (SKU: {p['sku']})\n"
                    f"- Current Stock: {int(_f(p['currentStock']))} {p.get('unit','pcs')}\n"
                    f"- Reorder Level: {int(_f(p['reorderLevel']))} {p.get('unit','pcs')}\n"
                    f"- {days_str}\n"
                    f"- 🚨 Action: Order immediately\n"
                )

        if low:
            lines.append(f"### 🟡 Low Stock — {len(low)} Product(s) Below Reorder Level\n")
            for p in low[:8]:
                dd = daily_demand.get(str(p.get("_id", "")), 0)
                days = RuleEngine.days_of_stock(_f(p["currentStock"]), dd)
                days_str = f"~{days} days remaining" if days is not None else ""
                lines.append(
                    f"**{p['name']}** (SKU: {p['sku']})\n"
                    f"- Current Stock: {int(_f(p['currentStock']))} {p.get('unit','pcs')}\n"
                    f"- Reorder Level: {int(_f(p['reorderLevel']))} {p.get('unit','pcs')}\n"
                    + (f"- {days_str}\n" if days_str else "")
                    + f"- ⚠️ Action: Schedule reorder\n"
                )

        total_items = len(critical) + len(low)
        lines.append(
            f"---\n\n"
            f"**Summary:** {total_items} product(s) need attention "
            f"({len(critical)} critical, {len(low)} low stock).\n"
            f"**Recommendation:** Place purchase orders for critical items today."
        )
        return "\n".join(lines)

    # ── Purchase recommendation ────────────────────────────────────────────────

    @staticmethod
    def purchase_recommendation(recs: list[dict]) -> str:
        if not recs:
            return (
                "## 🛒 Purchase Recommendation\n\n"
                "✅ No immediate purchases required.\n\n"
                "All products are above their safety stock levels. "
                "Review again tomorrow or after new sales data."
            )

        lines = ["## 🛒 Purchase Recommendations\n",
                 f"**{len(recs)} product(s) require purchasing today.**\n"]

        total_cost = sum(_f(r.get("estimated_cost")) for r in recs)

        for r in recs[:8]:
            priority_emoji = "🔴" if r["priority"] == "high" else "🟡"
            lines.append(
                f"### {priority_emoji} {r['name']} — Priority: {r['priority'].upper()}\n"
                f"📦 Current Stock: {r['current_stock']} {r['unit']}\n"
                f"📈 Forecast Demand (30d): {r['forecast_30d']} {r['unit']}\n"
                f"⚠️ Safety Stock: {r['safety_stock']} {r['unit']}\n"
                f"🛒 Suggested Purchase: **{r['suggested_purchase']} {r['unit']}**\n"
                f"💰 Estimated Cost: **{_npr(r['estimated_cost'])}**\n"
                f"💡 Reason: {r['reason']}\n"
            )

        lines.append(
            f"---\n\n"
            f"**Total Estimated Purchase Cost: {_npr(total_cost)}**\n"
            f"Contact your suppliers and place orders for high-priority items first."
        )
        return "\n".join(lines)

    # ── Inventory health ───────────────────────────────────────────────────────

    @staticmethod
    def inventory_health(summary: dict) -> str:
        score = summary["health_score"]
        score_label = (
            "Excellent 🌟" if score >= 85 else
            "Good ✅"      if score >= 70 else
            "Fair ⚠️"      if score >= 50 else
            "Poor 🔴"
        )

        return (
            f"## 📊 Inventory Health Summary\n\n"
            f"**Overall Health Score: {score}/100 — {score_label}**\n\n"
            f"### Stock Distribution\n"
            f"✅ Healthy Products: **{summary['healthy']}** ({summary['healthy_pct']:.0f}%)\n"
            f"🟡 Low Stock: **{summary['low']}** ({summary['low_pct']:.0f}%)\n"
            f"🔴 Critical / Out of Stock: **{summary['critical']}** ({summary['critical_pct']:.0f}%)\n"
            f"📦 Overstock: **{summary['overstock']}** ({summary['overstock_pct']:.0f}%)\n\n"
            f"### Financial Summary\n"
            f"💰 Total Inventory Value: **{_npr(summary['total_value'])}**\n"
            f"📦 Total Active Products: **{summary['total']}**\n\n"
            f"### Recommendations\n"
            + (f"🔴 {summary['critical']} critical items need immediate reordering.\n"
               if summary["critical"] else "")
            + (f"🟡 {summary['low']} items are below reorder level — schedule purchases.\n"
               if summary["low"] else "")
            + (f"📦 {summary['overstock']} items are overstocked — reduce future orders.\n"
               if summary["overstock"] else "")
            + (f"✅ Inventory is in excellent condition. Maintain current purchasing patterns."
               if score >= 85 else "")
        )

    # ── Demand forecast ────────────────────────────────────────────────────────

    @staticmethod
    def demand_forecast(forecasts: list[dict], has_ml_model: bool) -> str:
        source = "Trained ML Model (Random Forest + XGBoost + LSTM)" if has_ml_model else "Historical Sales Average"

        if not forecasts:
            return (
                "## 📈 Demand Forecast\n\n"
                "No forecasts are available yet.\n\n"
                "**To generate forecasts:** Go to the Forecasting page and train "
                "models for your products first.\n\n"
                "Once trained, demand predictions will appear here automatically."
            )

        trend_emoji = {"rising": "📈", "stable": "➡️", "falling": "📉"}
        lines = [f"## 📈 Demand Forecast — Next 30 Days\n",
                 f"*Source: {source}*\n"]

        for fc in forecasts[:10]:
            trend = fc.get("trend", "stable")
            te = trend_emoji.get(trend, "➡️")
            conf = fc.get("confidence", 0)
            conf_str = f"Confidence: {conf:.0%}" if conf else ""
            lines.append(
                f"**{fc.get('product_name', fc.get('sku_id', '?'))}**\n"
                f"- Forecast (30d): {int(_f(fc.get('forecast_30d')))} units\n"
                f"- Daily Average: {_f(fc.get('forecast_30d')) / 30:.1f} units/day\n"
                f"- Trend: {te} {trend.capitalize()}\n"
                + (f"- {conf_str}\n" if conf_str else "")
            )

        lines.append(
            f"---\n\n"
            f"**Tip:** Forecasts are recalculated daily from historical sales data. "
            f"Retrain models monthly for higher accuracy."
        )
        return "\n".join(lines)

    # ── Sales analysis ─────────────────────────────────────────────────────────

    @staticmethod
    def sales_analysis(sales: dict) -> str:
        if sales["total_revenue"] == 0:
            return (
                "## 📊 Sales Analysis\n\n"
                "No sales data found for the last 30 days.\n\n"
                "Start recording sales transactions to see performance analytics here."
            )

        daily = sales["daily_last_7"]
        daily_str = "\n".join(
            f"- {d['date']}: {_npr(d['revenue'])} ({d['qty']} units)"
            for d in daily
        )

        return (
            f"## 📊 Sales Analysis — Last {sales['period_days']} Days\n\n"
            f"### Revenue Summary\n"
            f"💰 Total Revenue: **{_npr(sales['total_revenue'])}**\n"
            f"📦 Total Units Sold: **{sales['total_qty']:,}**\n"
            f"📅 Daily Average Revenue: **{_npr(sales['daily_avg_revenue'])}**\n\n"
            f"### Daily Revenue (Last 7 Days)\n"
            f"{daily_str}\n\n"
            f"### Top {min(5, len(sales['top_products']))} Products by Revenue\n"
            + "\n".join(
                f"{i+1}. {p.get('product_name', p['product_id'][:8] + '...')} — "
                f"{_npr(p['revenue'])} ({p['qty']} units)"
                for i, p in enumerate(sales["top_products"][:5])
            )
        )

    # ── Supplier query ─────────────────────────────────────────────────────────

    @staticmethod
    def supplier_query(suppliers: list[dict]) -> str:
        if not suppliers:
            return (
                "## 🚛 Supplier Information\n\n"
                "No active suppliers found in the system.\n\n"
                "Add supplier records in the Suppliers section to see performance data."
            )

        lines = [f"## 🚛 Supplier Performance\n\n"
                 f"**Active Suppliers: {len(suppliers)}**\n"]

        for i, s in enumerate(suppliers[:8]):
            rating = _f(s.get("rating"))
            stars = "⭐" * min(5, int(rating)) if rating else ""
            lines.append(
                f"### {i+1}. {s.get('name', 'Unknown')}\n"
                f"- Contact: {s.get('contactPerson', 'N/A')}\n"
                f"- Phone: {s.get('phone', 'N/A')}\n"
                f"- Lead Time: {s.get('leadTimeDays', 'N/A')} days\n"
                + (f"- Rating: {stars} ({rating:.1f}/5)\n" if rating else "")
            )

        best = suppliers[0] if suppliers else None
        if best:
            lines.append(
                f"\n---\n\n"
                f"**Best Rated Supplier:** {best.get('name')} "
                f"(Lead time: {best.get('leadTimeDays', '?')} days)\n"
                f"**Recommendation:** For urgent orders, contact {best.get('name')} first."
            )
        return "\n".join(lines)

    # ── Specific product ───────────────────────────────────────────────────────

    @staticmethod
    def specific_product(product: dict, fc: dict | None,
                         rec: dict | None, daily_demand: float) -> str:
        name = product.get("name", "Product")
        sku  = product.get("sku", "")
        cs   = _f(product.get("currentStock"))
        rl   = _f(product.get("reorderLevel"))
        bp   = _f(product.get("buyingPrice"))
        unit = product.get("unit", "pcs")
        lt   = _f(product.get("leadTimeDays"), 7)

        # Use ML model data if available, else calculate
        if rec:
            ss   = _f(rec.get("safety_stock"))
            rop  = _f(rec.get("reorder_point"))
            eoq_ = _f(rec.get("eoq"))
        else:
            ss   = RuleEngine.safety_stock(daily_demand, lt)
            rop  = RuleEngine.reorder_point(daily_demand, lt, ss)
            eoq_ = RuleEngine.eoq(daily_demand * 365, unit_cost=bp or 100)

        fc30   = _f(fc.get("forecast_30d") if fc else None) or (daily_demand * 30)
        trend  = (fc.get("trend", "stable") if fc else "stable")
        sugg   = RuleEngine.suggested_purchase(cs, fc30, ss)
        cost   = sugg * bp
        status = RuleEngine.classify_stock(cs, rl, _f(product.get("minStock")), _f(product.get("maxStock")))
        days   = RuleEngine.days_of_stock(cs, daily_demand) if daily_demand > 0 else None

        priority = "🔴 HIGH" if status == "critical" else "🟡 MEDIUM" if status == "low" else "🟢 LOW"
        trend_str = {"rising": "📈 Rising", "falling": "📉 Falling", "stable": "➡️ Stable"}.get(trend, "➡️ Stable")

        fc_source = "ML Model" if fc else "Historical Sales Average"

        return (
            f"## 📦 {name} — Purchase Analysis\n\n"
            f"**SKU:** {sku}\n\n"
            f"### Current Status: {_stock_emoji(status)} {status.upper()}\n"
            f"📦 Current Stock: **{int(cs)} {unit}**\n"
            + (f"⏱️ Days Remaining: **~{days} days**\n" if days is not None else "")
            + f"📊 Reorder Level: {int(rl)} {unit}\n\n"
            f"### Demand Forecast (30 Days) — *{fc_source}*\n"
            f"📈 Forecast Demand: **{int(fc30)} {unit}**\n"
            f"📉 Daily Demand: {daily_demand:.1f} {unit}/day\n"
            f"📊 Trend: {trend_str}\n\n"
            f"### Recommendation\n"
            f"⚠️ Safety Stock: **{int(ss)} {unit}**\n"
            f"🔁 Reorder Point: **{int(rop)} {unit}**\n"
            f"📦 Economic Order Quantity: **{int(eoq_)} {unit}**\n"
            f"🛒 Suggested Purchase: **{int(sugg)} {unit}**\n"
            f"💰 Estimated Cost: **{_npr(cost)}**\n\n"
            f"### Priority: {priority}\n"
            + (f"💡 Reason: Current stock will be exhausted in ~{days} days. "
               f"Lead time is {int(lt)} days — order now to avoid stockout."
               if status in ("critical", "low")
               else f"💡 Reason: Stock level is adequate for current demand. "
                    f"Monitor and reorder when stock approaches {int(rop)} {unit}.")
        )

    # ── Alerts ────────────────────────────────────────────────────────────────

    @staticmethod
    def alerts(alerts: list[dict]) -> str:
        if not alerts:
            return (
                "## ✅ No Active Alerts\n\n"
                "All products are within healthy stock levels. "
                "No unresolved alerts at this time."
            )

        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        sorted_alerts  = sorted(alerts, key=lambda a: priority_order.get(
            (a.get("priority") or "low").lower(), 3
        ))

        priority_emoji = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🔵"}
        lines = [f"## 🚨 Active Alerts — {len(alerts)} Unresolved\n"]

        for a in sorted_alerts[:10]:
            pri    = (a.get("priority") or "?").lower()
            emoji  = priority_emoji.get(pri, "⚪")
            atype  = (a.get("type") or "alert").replace("_", " ").title()
            msg    = a.get("message", "No message")
            lines.append(f"{emoji} **{atype}** — {msg}")

        lines.append(
            f"\n---\n\n"
            f"**{len(alerts)} alert(s)** require attention. "
            f"Go to the Alerts page to acknowledge or resolve them."
        )
        return "\n".join(lines)

    # ── Analytics explanation ──────────────────────────────────────────────────

    @staticmethod
    def analytics(metrics: dict) -> str:
        score    = metrics.get("health_score", 0)
        tv       = _f(metrics.get("total_value"))
        it_days  = metrics.get("turnover_days")
        acc      = metrics.get("avg_forecast_accuracy")
        total    = metrics.get("total", 0)
        critical = metrics.get("critical", 0)

        acc_str = (
            f"**{acc:.1f}%** (MAPE-based)"
            if acc is not None else "Not yet available — train models to see accuracy"
        )

        it_str = (
            f"Stock turns over every **{it_days} days** "
            f"({'fast — healthy cash flow' if it_days < 30 else 'consider reducing slow-moving stock'})"
            if it_days else "Insufficient demand data"
        )

        return (
            f"## 📊 Analytics Overview\n\n"
            f"### Inventory Health Score: **{score}/100**\n"
            f"This score weights each product by its stock status: "
            f"critical items score 0, low stock 40, overstock 60, healthy 100. "
            f"{'Your inventory is in good health. ✅' if score >= 70 else 'Focus on reducing critical and low stock items. ⚠️'}\n\n"
            f"### Inventory Value\n"
            f"💰 **{_npr(tv)}** across {total} active products\n\n"
            f"### Forecast Accuracy (Model MAPE)\n"
            f"📈 {acc_str}\n"
            f"*MAPE = Mean Absolute Percentage Error. Lower is better. "
            f"< 10% is excellent; 10–20% is good; > 25% needs retraining.*\n\n"
            f"### Inventory Turnover\n"
            f"🔄 {it_str}\n"
            f"*Turnover = current stock ÷ daily demand. "
            f"Faster turnover = less capital tied up in stock.*\n\n"
            f"### Key Ratios\n"
            f"- **Critical products:** {critical} (need immediate reorder)\n"
            f"- **Service level target:** 95 % (Z = 1.645)\n"
            f"- **Safety stock formula:** Z × σ_demand × √lead_time\n\n"
            f"*Tip: Go to the Forecasting page to retrain models and improve accuracy.*"
        )

    # ── General / catch-all ────────────────────────────────────────────────────

    @staticmethod
    def general(inv_summary: dict) -> str:
        return (
            f"## 🏪 Inventory Overview\n\n"
            f"I'm your StockWise AI assistant. Here's a quick snapshot:\n\n"
            f"📦 Total Products: **{inv_summary['total']}**\n"
            f"🔴 Critical Stock: **{inv_summary['critical']}**\n"
            f"🟡 Low Stock: **{inv_summary['low']}**\n"
            f"✅ Healthy: **{inv_summary['healthy']}**\n"
            f"💰 Inventory Value: **{_npr(inv_summary['total_value'])}**\n\n"
            f"**Try asking:**\n"
            f"- Which products are low in stock?\n"
            f"- What should I purchase today?\n"
            f"- Show inventory health summary\n"
            f"- How much rice should I order?\n"
            f"- Which supplier is most reliable?"
        )


# ── Main BI Engine ─────────────────────────────────────────────────────────────

class BIEngine:
    def __init__(self, db):
        self.db = db
        self.data = DataLayer(db)
        self.rules = RuleEngine()
        self.gen = ResponseGenerator()

    async def answer(self, message: str, user_role: str = "staff") -> dict:
        intent, _ = classify_intent(message)

        handlers = {
            "low_stock":               self._low_stock,
            "purchase_recommendation": self._purchase_recommendation,
            "inventory_health":        self._inventory_health,
            "demand_forecast":         self._demand_forecast,
            "sales_analysis":          self._sales_analysis,
            "supplier_query":          self._supplier_query,
            "analytics":               self._analytics,
            "alerts":                  self._alerts_handler,
        }
        handler = handlers.get(intent, self._general)

        # Check for specific product mentions first
        if intent in ("purchase_recommendation", "demand_forecast", "low_stock"):
            product = await self._maybe_specific_product(message)
            if product:
                return await self._specific_product(message, product)

        result = await handler(message, user_role)
        result["intent"] = intent
        return result

    # ── handlers ──────────────────────────────────────────────────────────────

    async def _low_stock(self, _msg, _role) -> dict:
        products, daily_demand = await asyncio.gather(
            self.data.get_products(),
            self.data.get_daily_demand_per_product(30),
        )
        for p in products:
            p["_status"] = self.rules.classify_stock(
                _f(p.get("currentStock")), _f(p.get("reorderLevel")),
                _f(p.get("minStock")), _f(p.get("maxStock")),
            )

        needing = [p for p in products if p["_status"] in ("critical", "low")]
        needing.sort(key=lambda p: (
            0 if p["_status"] == "critical" else 1,
            _f(p.get("currentStock")),
        ))

        local_text = self.gen.low_stock(needing, daily_demand)
        insights, recs = self._build_insights_from_products(needing)
        return {
            "local_text": local_text,
            "insights": insights,
            "recommendations": recs,
            "structured": {"low_stock_count": len(needing), "products": needing[:5]},
            "context_for_llm": (
                f"{len(needing)} products need reordering. "
                f"Critical: {sum(1 for p in needing if p['_status'] == 'critical')}. "
                f"Low: {sum(1 for p in needing if p['_status'] == 'low')}."
            ),
        }

    async def _purchase_recommendation(self, _msg, _role) -> dict:
        products, ml_recs, forecasts, daily_demand = await asyncio.gather(
            self.data.get_products(),
            self.data.get_ml_inventory_recs(),
            self.data.get_ml_forecasts(),
            self.data.get_daily_demand_per_product(30),
        )

        ml_rec_map  = {r.get("sku_id", ""): r for r in ml_recs}
        fc_map      = {f.get("sku_id", ""): f for f in forecasts}

        recs = []
        for p in products:
            status = self.rules.classify_stock(
                _f(p.get("currentStock")), _f(p.get("reorderLevel")),
                _f(p.get("minStock")), _f(p.get("maxStock")),
            )
            if status not in ("critical", "low"):
                continue

            sku        = p.get("sku", "")
            mr         = ml_rec_map.get(sku) or {}
            fc         = fc_map.get(sku) or {}
            dd         = daily_demand.get(str(p.get("_id", "")), 0)
            lt         = _f(p.get("leadTimeDays"), 7)

            ss         = _f(mr.get("safety_stock")) or self.rules.safety_stock(dd, lt)
            fc30       = _f(fc.get("forecast_30d")) or (dd * 30)
            sugg       = self.rules.suggested_purchase(_f(p.get("currentStock")), fc30, ss)
            cost       = sugg * _f(p.get("buyingPrice"))
            days_left  = self.rules.days_of_stock(_f(p.get("currentStock")), dd)

            if sugg <= 0:
                continue

            recs.append({
                "name":              p.get("name", ""),
                "sku":               sku,
                "unit":              p.get("unit", "pcs"),
                "current_stock":     int(_f(p.get("currentStock"))),
                "forecast_30d":      int(fc30),
                "safety_stock":      int(ss),
                "suggested_purchase": int(sugg),
                "estimated_cost":    cost,
                "priority":          "high" if status == "critical" else "medium",
                "reason": (
                    f"Stock will last ~{days_left} days. Lead time is {int(lt)} days."
                    if days_left is not None
                    else "Below reorder level. Demand forecast exceeds available stock."
                ),
            })

        recs.sort(key=lambda r: (0 if r["priority"] == "high" else 1, r["current_stock"]))

        local_text = self.gen.purchase_recommendation(recs)
        total_cost = sum(r["estimated_cost"] for r in recs)
        insights, recommendations = self._build_insights_from_recs(recs)
        return {
            "local_text": local_text,
            "insights": insights,
            "recommendations": recommendations,
            "structured": {"purchase_recs": recs[:5], "total_cost": total_cost},
            "context_for_llm": (
                f"{len(recs)} products need purchasing. "
                f"Total estimated cost: NPR {total_cost:,.0f}. "
                f"High priority: {sum(1 for r in recs if r['priority'] == 'high')}."
            ),
        }

    async def _inventory_health(self, _msg, _role) -> dict:
        products, daily_demand = await asyncio.gather(
            self.data.get_products(),
            self.data.get_daily_demand_per_product(30),
        )
        total = len(products)
        if total == 0:
            return {
                "local_text": "## 📊 Inventory Health\n\nNo products found in the system.",
                "insights": [], "recommendations": [], "structured": {}, "context_for_llm": "",
            }

        classified = []
        total_value = 0.0
        for p in products:
            status = self.rules.classify_stock(
                _f(p.get("currentStock")), _f(p.get("reorderLevel")),
                _f(p.get("minStock")), _f(p.get("maxStock")),
            )
            p["_status"] = status
            total_value += _f(p.get("currentStock")) * _f(p.get("buyingPrice"))
            classified.append(p)

        counts = {s: sum(1 for p in classified if p["_status"] == s)
                  for s in ("critical", "low", "healthy", "overstock")}

        def pct(n): return (n / total * 100) if total else 0

        summary = {
            "total":          total,
            "critical":       counts["critical"],
            "low":            counts["low"],
            "healthy":        counts["healthy"],
            "overstock":      counts["overstock"],
            "critical_pct":   pct(counts["critical"]),
            "low_pct":        pct(counts["low"]),
            "healthy_pct":    pct(counts["healthy"]),
            "overstock_pct":  pct(counts["overstock"]),
            "total_value":    total_value,
            "health_score":   self.rules.health_score(classified),
        }

        local_text = self.gen.inventory_health(summary)
        return {
            "local_text": local_text,
            "insights": self._build_health_insights(summary),
            "recommendations": [],
            "structured": summary,
            "context_for_llm": (
                f"Health score {summary['health_score']}/100. "
                f"{counts['critical']} critical, {counts['low']} low, "
                f"{counts['healthy']} healthy products. "
                f"Total value: NPR {total_value:,.0f}."
            ),
        }

    async def _demand_forecast(self, _msg, _role) -> dict:
        forecasts = await self.data.get_ml_forecasts()
        forecasts.sort(key=lambda f: _f(f.get("forecast_30d")), reverse=True)
        has_ml = len(forecasts) > 0

        local_text = self.gen.demand_forecast(forecasts, has_ml)
        return {
            "local_text": local_text,
            "insights": [],
            "recommendations": [],
            "structured": {"forecast_count": len(forecasts), "has_ml_model": has_ml},
            "context_for_llm": (
                f"ML forecasts available for {len(forecasts)} products. "
                + (f"Top demand: {forecasts[0].get('product_name','?')} "
                   f"({int(_f(forecasts[0].get('forecast_30d')))} units/30d)."
                   if forecasts else "No ML forecasts yet.")
            ),
        }

    async def _sales_analysis(self, _msg, _role) -> dict:
        sales = await self.data.get_sales_aggregated(30)
        local_text = self.gen.sales_analysis(sales)
        return {
            "local_text": local_text,
            "insights": [],
            "recommendations": [],
            "structured": sales,
            "context_for_llm": (
                f"Last 30 days: Revenue NPR {sales['total_revenue']:,.0f}, "
                f"{sales['total_qty']:,} units sold."
            ),
        }

    async def _supplier_query(self, _msg, _role) -> dict:
        suppliers = await self.data.get_suppliers()
        local_text = self.gen.supplier_query(suppliers)
        return {
            "local_text": local_text,
            "insights": [],
            "recommendations": [],
            "structured": {"supplier_count": len(suppliers)},
            "context_for_llm": (
                f"{len(suppliers)} active suppliers. "
                + (f"Best rated: {suppliers[0].get('name','?')} "
                   f"(lead time {suppliers[0].get('leadTimeDays','?')} days)."
                   if suppliers else "")
            ),
        }

    async def _alerts_handler(self, _msg, _role) -> dict:
        alerts     = await self.data.get_active_alerts()
        local_text = self.gen.alerts(alerts)
        return {
            "local_text": local_text,
            "insights": [
                {
                    "type":    ("critical" if (a.get("priority") or "").lower() in ("critical", "high") else "warning"),
                    "title":   (a.get("type") or "Alert").replace("_", " ").title(),
                    "message": a.get("message", ""),
                    "action":  "Review and acknowledge",
                }
                for a in alerts[:3]
            ],
            "recommendations": [],
            "structured":      {"alert_count": len(alerts), "alerts": alerts[:5]},
            "context_for_llm": (
                f"{len(alerts)} active alert(s). "
                + (" | ".join(a.get("message", "") for a in alerts[:3]))
            ),
        }

    async def _analytics(self, _msg, _role) -> dict:
        products, forecasts, daily_demand = await asyncio.gather(
            self.data.get_products(),
            self.data.get_ml_forecasts(),
            self.data.get_daily_demand_per_product(30),
        )

        total_value  = sum(_f(p.get("currentStock")) * _f(p.get("buyingPrice")) for p in products)
        total_stock  = sum(_f(p.get("currentStock")) for p in products)
        total_dd     = sum(daily_demand.values())
        turnover_days = round(total_stock / total_dd) if total_dd > 0 else None

        mapes = [_f(f.get("mape")) for f in forecasts if f.get("mape") and _f(f.get("mape")) > 0]
        avg_acc = round(100 - (sum(mapes) / len(mapes)), 1) if mapes else None

        classified = []
        for p in products:
            status = self.rules.classify_stock(
                _f(p.get("currentStock")), _f(p.get("reorderLevel")),
                _f(p.get("minStock")),    _f(p.get("maxStock")),
            )
            p["_status"] = status
            classified.append(p)

        counts = {s: sum(1 for p in classified if p["_status"] == s)
                  for s in ("critical", "low", "healthy", "overstock")}
        h_score = self.rules.health_score(classified)

        metrics = {
            "health_score":           h_score,
            "total":                  len(products),
            "total_value":            total_value,
            "turnover_days":          turnover_days,
            "avg_forecast_accuracy":  avg_acc,
            **counts,
        }

        local_text = self.gen.analytics(metrics)
        return {
            "local_text":     local_text,
            "insights":       self._build_health_insights(counts),
            "recommendations": [],
            "structured":     metrics,
            "context_for_llm": (
                f"Inventory health {h_score}/100. "
                f"Total value: NPR {total_value:,.0f}. "
                f"Turnover: {turnover_days} days. "
                f"Forecast accuracy: {avg_acc}%."
            ),
        }

    async def _specific_product(self, message: str, product: dict) -> dict:
        sku = product.get("sku", "")
        ml_recs, forecasts, daily_demand_map = await asyncio.gather(
            self.data.get_ml_inventory_recs(),
            self.data.get_ml_forecasts(),
            self.data.get_daily_demand_per_product(30),
        )
        rec = next((r for r in ml_recs if r.get("sku_id") == sku), None)
        fc  = next((f for f in forecasts if f.get("sku_id") == sku), None)
        dd  = daily_demand_map.get(str(product.get("_id", "")), 0)

        local_text = self.gen.specific_product(product, fc, rec, dd)
        return {
            "local_text": local_text,
            "insights": [],
            "recommendations": [{
                "action": "purchase",
                "product": product.get("name"),
                "sku": sku,
                "priority": RuleEngine.classify_stock(
                    _f(product.get("currentStock")), _f(product.get("reorderLevel")),
                    _f(product.get("minStock")), _f(product.get("maxStock")),
                ),
                "message": f"Review and place purchase order for {product.get('name')}.",
            }],
            "structured": {"product": product.get("name"), "sku": sku},
            "context_for_llm": (
                f"Specific analysis for {product.get('name')}: "
                f"current stock {int(_f(product.get('currentStock')))} {product.get('unit','pcs')}, "
                f"forecast 30d {int(_f(fc.get('forecast_30d')) if fc else dd*30)} units."
            ),
            "intent": "specific_product",
        }

    async def _general(self, _msg, _role) -> dict:
        products = await self.data.get_products()
        total_value = sum(_f(p.get("currentStock")) * _f(p.get("buyingPrice")) for p in products)
        counts = {"total": len(products), "total_value": total_value, "critical": 0, "low": 0, "healthy": 0}
        for p in products:
            s = self.rules.classify_stock(
                _f(p.get("currentStock")), _f(p.get("reorderLevel")),
                _f(p.get("minStock")), _f(p.get("maxStock")),
            )
            counts[s] = counts.get(s, 0) + 1

        local_text = self.gen.general(counts)
        return {
            "local_text": local_text, "insights": [], "recommendations": [],
            "structured": counts, "context_for_llm": "",
        }

    # ── Helpers ────────────────────────────────────────────────────────────────

    async def _maybe_specific_product(self, message: str) -> dict | None:
        words = [w for w in message.lower().split() if len(w) >= 3]
        skip  = {"low", "high", "stock", "the", "for", "how", "much", "should", "what", "purchase",
                 "order", "buy", "today", "need", "tell", "show", "give", "me", "products", "inventory"}
        keywords = [w for w in words if w not in skip]
        for kw in keywords:
            product = await self.data.find_product_by_keyword(kw)
            if product:
                return product
        return None

    @staticmethod
    def _build_insights_from_products(products: list[dict]) -> tuple[list, list]:
        insights, recs = [], []
        for p in products[:3]:
            s = p.get("_status", "low")
            insights.append({
                "type":    s,
                "title":   "Critical Stock Alert" if s == "critical" else "Low Stock Warning",
                "message": (f"{p.get('name')} has only {int(_f(p.get('currentStock')))} "
                            f"{p.get('unit','pcs')} remaining."),
                "action":  "Order immediately" if s == "critical" else "Schedule reorder",
                "product": p.get("name"),
                "sku":     p.get("sku"),
            })
            recs.append({
                "action":        "reorder",
                "product":       p.get("name"),
                "sku":           p.get("sku"),
                "current_stock": int(_f(p.get("currentStock"))),
                "priority":      "high" if s == "critical" else "medium",
                "message":       f"Reorder {p.get('name')} — stock is {s}.",
            })
        return insights, recs

    @staticmethod
    def _build_insights_from_recs(recs: list[dict]) -> tuple[list, list]:
        insights, recommendations = [], []
        for r in recs[:3]:
            insights.append({
                "type":    "warning" if r["priority"] == "medium" else "critical",
                "title":   "Purchase Required",
                "message": f"Order {r['suggested_purchase']} {r['unit']} of {r['name']}.",
                "action":  "Place order",
                "product": r["name"],
                "sku":     r["sku"],
            })
            recommendations.append({
                "action":   "purchase",
                "product":  r["name"],
                "sku":      r["sku"],
                "priority": r["priority"],
                "quantity": r["suggested_purchase"],
                "cost":     r["estimated_cost"],
                "message":  r["reason"],
            })
        return insights, recommendations

    @staticmethod
    def _build_health_insights(summary: dict) -> list[dict]:
        ins = []
        if summary["critical"] > 0:
            ins.append({
                "type": "critical", "title": "Critical Stock Alert",
                "message": f"{summary['critical']} products are critically low or out of stock.",
                "action": "Order immediately",
            })
        if summary["low"] > 0:
            ins.append({
                "type": "warning", "title": "Low Stock Warning",
                "message": f"{summary['low']} products are below reorder level.",
                "action": "Schedule reorder",
            })
        if summary["overstock"] > 0:
            ins.append({
                "type": "info", "title": "Overstock Notice",
                "message": f"{summary['overstock']} products have excess inventory.",
                "action": "Reduce orders",
            })
        return ins

    # ── Proactive insights for side panel ─────────────────────────────────────

    async def generate_proactive_insights(self) -> list[dict]:
        products, daily_demand = await asyncio.gather(
            self.data.get_products(),
            self.data.get_daily_demand_per_product(30),
        )
        panel: list[dict] = []

        for p in products:
            status = self.rules.classify_stock(
                _f(p.get("currentStock")), _f(p.get("reorderLevel")),
                _f(p.get("minStock")), _f(p.get("maxStock")),
            )
            if status == "critical":
                panel.append({
                    "type": "critical", "icon": "alert-triangle",
                    "title": "Critical Stock Alert",
                    "message": (f"{p.get('name')} has only {int(_f(p.get('currentStock')))} "
                                f"{p.get('unit','pcs')} left."),
                    "action": "Order immediately",
                    "product": p.get("name"), "sku": p.get("sku"),
                })
            elif status == "low":
                panel.append({
                    "type": "warning", "icon": "package",
                    "title": "Low Stock Warning",
                    "message": (f"{p.get('name')} is below reorder level "
                                f"({int(_f(p.get('currentStock')))} / {int(_f(p.get('reorderLevel')))})."),
                    "action": "Schedule reorder",
                    "product": p.get("name"), "sku": p.get("sku"),
                })
            if len(panel) >= 6:
                break

        # ML stockout risks
        try:
            ml_recs = await self.data.get_ml_inventory_recs()
            for rec in sorted(ml_recs, key=lambda r: -_f(r.get("stockout_risk")))[:2]:
                if _f(rec.get("stockout_risk")) >= 0.7:
                    panel.append({
                        "type": "forecast", "icon": "trending-up",
                        "title": "ML Stockout Risk",
                        "message": (f"{rec.get('product_name','?')} has "
                                    f"{_f(rec.get('stockout_risk'))*100:.0f}% stockout risk."),
                        "action": "Review reorder schedule",
                        "product": rec.get("product_name"),
                    })
        except Exception:
            pass

        return panel[:8]

    # ── Rich context for LLM system prompt ────────────────────────────────────

    async def get_rich_context(self, bi_result: dict | None = None) -> dict:
        """
        Build a comprehensive context bundle for the LLM system prompt.

        Fetches all relevant business data in one parallel sweep and caches
        the result for 3 minutes to avoid hammering MongoDB on every message.

        The bundle is intentionally over-inclusive — the system prompt
        formatter (_build_system_prompt in ai_chat_service) picks what to show.
        """
        from app.core.cache import chat_cache as _cc

        ckey   = "bi:rich_context"
        cached = _cc.get(ckey)
        if cached:
            return cached

        # Parallel fetch — everything the LLM might need
        products, alerts, forecasts, sales, ml_recs = await asyncio.gather(
            self.data.get_products(),
            self.data.get_active_alerts(),
            self.data.get_ml_forecasts(),
            self.data.get_sales_aggregated(30),
            self.data.get_ml_inventory_recs(),
        )

        daily_demand = await self.data.get_daily_demand_per_product(30)

        # Classify products
        classified   = []
        total_value  = 0.0
        for p in products:
            status = self.rules.classify_stock(
                _f(p.get("currentStock")), _f(p.get("reorderLevel")),
                _f(p.get("minStock")),    _f(p.get("maxStock")),
            )
            p["_status"] = status
            total_value += _f(p.get("currentStock")) * _f(p.get("buyingPrice"))
            classified.append(p)

        counts = {s: sum(1 for p in classified if p["_status"] == s)
                  for s in ("critical", "low", "healthy", "overstock")}

        low_stock = [
            p for p in classified if p["_status"] in ("critical", "low")
        ]
        low_stock.sort(key=lambda p: (
            0 if p["_status"] == "critical" else 1,
            _f(p.get("currentStock")),
        ))

        # Quick purchase recommendations for context
        ml_rec_map = {r.get("sku_id", ""): r for r in ml_recs}
        fc_map     = {f.get("sku_id",  ""): f for f in forecasts}

        purchase_recs = []
        for p in low_stock[:5]:
            sku  = p.get("sku", "")
            mr   = ml_rec_map.get(sku) or {}
            fc   = fc_map.get(sku) or {}
            dd   = daily_demand.get(str(p.get("_id", "")), 0)
            lt   = _f(p.get("leadTimeDays"), 7)
            ss   = _f(mr.get("safety_stock")) or self.rules.safety_stock(dd, lt)
            fc30 = _f(fc.get("forecast_30d")) or (dd * 30)
            sugg = self.rules.suggested_purchase(_f(p.get("currentStock")), fc30, ss)
            if sugg > 0:
                purchase_recs.append({
                    "name":               p.get("name", ""),
                    "sku":                sku,
                    "unit":               p.get("unit", "pcs"),
                    "suggested_purchase": int(sugg),
                    "estimated_cost":     sugg * _f(p.get("buyingPrice")),
                    "priority":           "high" if p["_status"] == "critical" else "medium",
                })

        ctx = {
            "alerts":        alerts,
            "low_stock":     low_stock[:8],
            "top_forecasts": sorted(forecasts, key=lambda f: -_f(f.get("forecast_30d")))[:6],
            "sales_summary": sales,
            "purchase_recs": purchase_recs,
            "health": {
                "health_score": self.rules.health_score(classified),
                "total":        len(classified),
                "total_value":  total_value,
                **counts,
            },
        }

        _cc.set(ckey, ctx, ttl=180)
        return ctx

    # ── Suggestions ────────────────────────────────────────────────────────────

    @staticmethod
    def get_suggestions(user_role: str) -> list[str]:
        base = [
            "Which products are low in stock?",
            "What should I purchase today?",
            "Show inventory health summary.",
            "Which products sold the most this month?",
            "Are there any active alerts?",
        ]
        manager_extra = [
            "Show demand forecast for the next 30 days.",
            "Which supplier has the best performance?",
            "How much rice should I order?",
            "What is the total inventory value?",
            "Which products may stock out next week?",
            "Explain the forecast accuracy metrics.",
            "What does MAPE mean and is ours good?",
            "Show analytics overview.",
            "Which products have declining sales trends?",
            "What is the inventory turnover rate?",
        ]
        if user_role in ("admin", "inventory_manager"):
            return base + manager_extra
        return base + [
            "Show today's sales summary.",
            "Which items are critically low?",
            "What is the reorder status?",
        ]
