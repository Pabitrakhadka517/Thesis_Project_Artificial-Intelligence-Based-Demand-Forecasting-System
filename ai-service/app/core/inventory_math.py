"""
Shared inventory-optimization formulas — single source of truth for
Safety Stock, Reorder Point, EOQ, and Suggested Purchase Quantity.

Consolidates three previously-independent (and disagreeing) implementations
that used to live in ml_forecast_service.py, inventory_analysis.py, and
bi_engine.py:

  - ml_forecast_service.py double-counted safety stock in the suggested
    purchase quantity (`deficit + safety_stock`, but `deficit` already
    contains one safety-stock term since it's computed against the reorder
    point, which itself embeds safety stock).
  - inventory_analysis.py double-counted EOQ instead (`deficit + eoq` always
    won over plain `eoq`, so it always ordered "fill the gap to the reorder
    point, then a full EOQ on top").
  - bi_engine.py's rule-based fallback ignored EOQ and lead time entirely,
    using a different formula altogether.
  - Both ml_forecast_service.py and inventory_analysis.py additionally
    computed safety stock from the standard deviation of the model's own
    *forecast* output instead of real historical demand variance — which
    inverts the intent of a safety buffer (a smoother/better forecast has
    lower self-variance, so a better model would silently give you *less*
    protection against real-world demand noise, not more).

Every call site should go through the functions below instead of
re-deriving these formulas locally.
"""
from __future__ import annotations

import math

# ── shared constants ─────────────────────────────────────────────────────────
Z_95 = 1.645                    # one-tailed z-score for a 95% service level
ORDERING_COST = 500.0           # NPR per purchase order, fixed across SKUs
HOLDING_RATE = 0.20             # 20% of unit buying price, held for one year
DEMAND_STD_CV_FALLBACK = 0.30   # coefficient of variation used to estimate
                                 # demand std when no real historical std is
                                 # available (e.g. a single data point, or a
                                 # stored forecast predating that field).
                                 # Used identically by bi_engine.py,
                                 # inventory_analysis.py, and
                                 # ml_forecast_service.py so their safety-stock
                                 # numbers agree for the same inputs.


def safety_stock(daily_demand_std: float, lead_time_days: float, z: float = Z_95) -> int:
    """
    SS = Z x sigma_demand x sqrt(lead_time)

    `daily_demand_std` MUST be the standard deviation of real historical
    daily demand (or a held-out RMSE as a proxy when history is thin) —
    never the standard deviation of a forecast's own point predictions.
    See module docstring for why that substitution is wrong.

    Worked example: daily_demand_std=3, lead_time_days=5, z=1.645
      -> SS = 1.645 * 3 * sqrt(5) ~= 11 units
    """
    if daily_demand_std <= 0 or lead_time_days <= 0:
        return 1
    return max(1, round(z * daily_demand_std * math.sqrt(lead_time_days)))


def reorder_point(daily_demand: float, lead_time_days: float, ss: float) -> int:
    """
    ROP = (daily_demand x lead_time) + safety_stock

    Worked example: daily_demand=10, lead_time_days=5, ss=11 -> ROP = 61
    """
    return round(daily_demand * lead_time_days + ss)


def eoq(
    annual_demand: float,
    order_cost: float = ORDERING_COST,
    holding_cost_per_unit: float | None = None,
    unit_cost: float | None = None,
    holding_rate: float = HOLDING_RATE,
) -> int:
    """
    EOQ = sqrt(2 x D x S / H)
      D = annual demand (units/year)
      S = fixed cost per purchase order
      H = holding cost per unit per year

    Pass `holding_cost_per_unit` directly, or `unit_cost` (+ optionally a
    non-default `holding_rate`) to have H derived as unit_cost * holding_rate.

    Worked example: annual_demand=3650, order_cost=500, unit_cost=100
      -> H = 100 * 0.20 = 20; EOQ = sqrt(2*3650*500/20) ~= 427 units
    """
    if holding_cost_per_unit is None:
        if unit_cost is None:
            raise ValueError("eoq() requires either holding_cost_per_unit or unit_cost")
        holding_cost_per_unit = max(1.0, unit_cost * holding_rate)
    if annual_demand <= 0 or holding_cost_per_unit <= 0:
        return 0
    return max(1, round(math.sqrt((2 * annual_demand * order_cost) / holding_cost_per_unit)))


def suggested_purchase_qty(current_stock: float, rop: float, eoq_qty: float) -> int:
    """
    How much to order right now, given the product is at or below its
    reorder point.

      suggested_purchase = max(EOQ, ROP - current_stock)

    `rop` already embeds one safety-stock term (see reorder_point above) —
    do not add safety_stock again here, and do not add EOQ on top of the
    ROP gap. Both were bugs in the previous, independent implementations;
    see the module docstring.

    Worked example: current_stock=20, rop=61, eoq=45
      -> deficit = 61-20 = 41; suggested = max(45, 41) = 45
    """
    if current_stock > rop:
        return 0
    deficit = max(0.0, rop - current_stock)
    return int(max(eoq_qty, deficit))
