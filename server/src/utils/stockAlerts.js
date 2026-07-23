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

const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical']

// Alerts are written as upserts keyed on (product, type, isAcknowledged:false) —
// enforced unique by the partial index on Alert (see models/Alert.js) — rather
// than a plain insert-if-none-open check. This means a product that stays in a
// bad state across scans gets its ALERT CONTENT refreshed (priority/message)
// instead of being frozen at whatever it looked like when first flagged.
//
// isRead resets to false whenever the new priority is more severe than
// whatever's currently stored, so an alert a user already dismissed resurfaces
// if the underlying problem gets worse (e.g. low_stock -> out_of_stock)
// instead of staying silently marked read.
//
// Shared by alerts.controller.js (periodic scan), purchases.controller.js
// (restock can push into overstock) and sales.controller.js (a sale can
// worsen low_stock -> out_of_stock) so all three call sites stay consistent.
function queueUpsert(bulkOps, alert) {
  const { product, type, ...content } = alert
  const newRank = PRIORITY_ORDER.indexOf(content.priority)
  bulkOps.push({
    updateOne: {
      filter: { product, type, isAcknowledged: false },
      update: [
        {
          $set: {
            ...content,
            product: { $ifNull: ['$product', product] },
            type:    { $ifNull: ['$type', type] },
            isRead: {
              $cond: [
                { $gt: [newRank, { $indexOfArray: [PRIORITY_ORDER, '$priority'] }] },
                false,
                { $ifNull: ['$isRead', false] },
              ],
            },
          },
        },
      ],
      upsert: true,
    },
  })
}

module.exports = { OVERSTOCK_RATIO, isOverstocked, buildOverstockAlert, queueUpsert }
