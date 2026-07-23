"""
Live-data adapter for the ML forecasting pipeline.

Lets DataPreprocessor fall back to real MongoDB Sale/Product documents for
any active inventory product that isn't one of the 50 synthetic dataset SKUs,
provided it has enough sale-day history to satisfy ModelTrainer's minimum.
"""
from __future__ import annotations

import os

import pandas as pd
from pymongo import MongoClient

_SYNTHETIC_MARKER = "__synthetic__"

# ModelTrainer.train_sku() requires >= 60 clean rows after dropping the first
# 30 days (qty_lag_30 warm-up), so a SKU needs at least 90 days of calendar
# span between its first and last sale to ever produce a trainable series.
MIN_SALE_DAYS = 90

_client: MongoClient | None = None


def _db():
    global _client
    if _client is None:
        _client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    return _client["stockwise"]


def list_live_products(min_days: int = MIN_SALE_DAYS) -> list[dict]:
    """
    Every active (non-synthetic) inventory product, annotated with its live
    sales history span and whether it currently has enough data (>= min_days)
    for ModelTrainer to train on. Products with no sales yet get sale_days=0.
    """
    db = _db()
    pipeline = [
        {"$match": {"notes": {"$ne": _SYNTHETIC_MARKER}, "status": "completed"}},
        {"$unwind": "$items"},
        # Group by (sku, calendar day) first so sale_days below counts distinct
        # days with an actual sale, not the calendar span between first/last —
        # a SKU with 4 sales spread across 90 days must not look like 90 days
        # of real history.
        {"$group": {
            "_id":     {"sku": "$items.sku", "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$saleDate"}}},
            "records": {"$sum": 1},
        }},
        {"$group": {
            "_id":        "$_id.sku",
            "sale_days":  {"$sum": 1},
            "records":    {"$sum": "$records"},
        }},
    ]
    spans = {row["_id"]: row for row in db["sales"].aggregate(pipeline) if row["_id"]}

    prod_docs = list(db["products"].find({
        "isActive":    True,
        "description": {"$ne": _SYNTHETIC_MARKER},
    }))
    cat_ids   = {p["category"] for p in prod_docs if p.get("category")}
    cat_names = {c["_id"]: c["name"] for c in db["categories"].find({"_id": {"$in": list(cat_ids)}})}

    out = []
    for p in prod_docs:
        sku  = p["sku"]
        span = spans.get(sku)
        sale_days    = span["sale_days"] if span else 0
        sale_records = span["records"] if span else 0
        eligible     = sale_days >= min_days
        out.append({
            "product_sku":    sku,
            "product_name":   p.get("name", sku),
            "category":       cat_names.get(p.get("category"), "Uncategorized"),
            "unit":           p.get("unit", "unit"),
            "is_perishable":  int(bool(p.get("isPerishable"))),
            "lead_time_days": int(p.get("leadTimeDays", 7)),
            "reorder_level":  int(p.get("reorderLevel", 10)),
            "max_stock":      int(p.get("maxStock") or 1000),
            "buying_price":   float(p.get("buyingPrice", 0)),
            "selling_price":  float(p.get("sellingPrice", 0)),
            "source":         "live",
            "sale_days":      sale_days,
            "sale_records":   sale_records,
            "eligible":       eligible,
            "days_needed":    max(0, min_days - sale_days),
        })
    return out


def load_daily_series(sku_id: str) -> pd.DataFrame:
    """Aggregate real Sale documents for one SKU into a per-day quantity series."""
    db = _db()
    pipeline = [
        {"$match": {"notes": {"$ne": _SYNTHETIC_MARKER}, "status": "completed"}},
        {"$unwind": "$items"},
        {"$match": {"items.sku": sku_id}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$saleDate"}},
            "qty": {"$sum": "$items.quantity"},
        }},
        {"$sort": {"_id": 1}},
    ]
    rows = list(db["sales"].aggregate(pipeline))
    if not rows:
        raise ValueError(f"No live sales found for SKU '{sku_id}'")
    return pd.DataFrame({
        "date": pd.to_datetime([r["_id"] for r in rows]),
        "qty":  [float(r["qty"]) for r in rows],
    })


def get_product_meta(sku_id: str) -> dict:
    """
    Static product metadata for a real (non-synthetic) product, shaped like
    DataPreprocessor.get_sku_meta()'s CSV-based output.
    """
    db = _db()
    p = db["products"].find_one({"sku": sku_id, "description": {"$ne": _SYNTHETIC_MARKER}})
    if not p:
        raise ValueError(f"Product '{sku_id}' not found")

    cat = db["categories"].find_one({"_id": p["category"]}) if p.get("category") else None
    buying  = float(p.get("buyingPrice", 0))
    selling = float(p.get("sellingPrice", 0))
    margin  = round((selling - buying) / selling * 100, 2) if selling else 0.0

    return {
        "product_sku":            sku_id,
        "product_name":           p.get("name", sku_id),
        "category":               cat["name"] if cat else "Uncategorized",
        "unit":                   p.get("unit", "unit"),
        "is_perishable":          int(bool(p.get("isPerishable"))),
        "lead_time_days":         int(p.get("leadTimeDays", 7)),
        "reorder_level":          int(p.get("reorderLevel", 10)),
        "max_stock":              int(p.get("maxStock") or 1000),
        "buying_price":           buying,
        "selling_price":          selling,
        "margin_pct":             margin,
        # Not derivable from live sales history yet (no elasticity/trend study
        # data for real products) — neutral defaults, matching the CSV loader's
        # own fillna() defaults for these same columns.
        "price_elasticity_index": 1.0,
        "demand_index":           1.0,
        "annual_trend_factor":    1.0,
    }
