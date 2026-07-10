'use strict'

// Shared overstock logic — used by alerts.controller.js (manual/periodic scan),
// purchases.controller.js (a restock can push a product into overstock), and
// sales.controller.js (a sale can pull a product back out of overstock).
// Centralised so the threshold and alert copy can't drift between the three
// independent call sites that need to know "is this product overstocked?".

const OVERSTOCK_RATIO = 0.9 // fraction of maxStock that counts as "near capacity"

// maxStock === 0 means "unlimited / not configured" (see Product.js) — never overstocked.
function isOverstocked({ currentStock, maxStock }) {
  return maxStock > 0 && currentStock >= maxStock * OVERSTOCK_RATIO
}

function buildOverstockAlert({ _id, name, currentStock, maxStock }) {
  return {
    type: 'overstock',
    priority: currentStock >= maxStock ? 'high' : 'medium',
    title: `Overstock: ${name}`,
    message: `${name} has ${currentStock} units — at or near max capacity of ${maxStock}. Consider slowing reorders or running a promotion.`,
    product: _id,
    productName: name,
    metadata: { currentStock, maxStock },
  }
}

module.exports = { OVERSTOCK_RATIO, isOverstocked, buildOverstockAlert }
