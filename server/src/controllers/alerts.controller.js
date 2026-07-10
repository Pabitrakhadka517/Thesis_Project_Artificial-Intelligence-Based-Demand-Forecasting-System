const Alert = require('../models/Alert')
const Product = require('../models/Product')
const { success, error, paginated } = require('../utils/response')
const { isOverstocked, buildOverstockAlert } = require('../utils/stockAlerts')

exports.getAlerts = async (req, res) => {
  const { page = 1, limit: _limit = 20, isRead, priority, type, status } = req.query
  const limit = Math.min(parseInt(_limit), 100)
  const skip  = (parseInt(page) - 1) * limit
  const query = {}
  if (isRead   !== undefined) query.isRead   = isRead   === 'true'
  if (priority) query.priority = priority
  if (type)     query.type     = type
  if (status === 'active')       { query.isAcknowledged = false; query.isResolved = false }
  else if (status === 'acknowledged') { query.isAcknowledged = true;  query.isResolved = false }
  else if (status === 'resolved')     { query.isResolved = true }

  // Fix #17: the third promise computed `unread` but it was never included in
  // the response — a full extra round trip wasted on every page load.
  // Use GET /alerts/unread-count for the unread badge count.
  const [alerts, total] = await Promise.all([
    Alert.find(query).populate('product', 'name sku').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Alert.countDocuments(query),
  ])

  return paginated(res, { data: alerts, total, page: parseInt(page), limit: parseInt(limit) })
}

exports.markRead = async (req, res) => {
  const alert = await Alert.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true })
  if (!alert) return error(res, 'Alert not found', 404)
  return success(res, { alert })
}

exports.markAllRead = async (req, res) => {
  await Alert.updateMany({ isRead: false }, { isRead: true })
  return success(res, {}, 'All alerts marked as read')
}

exports.acknowledge = async (req, res) => {
  const alert = await Alert.findByIdAndUpdate(
    req.params.id,
    { isAcknowledged: true, acknowledgedBy: req.user._id, acknowledgedAt: new Date(), isRead: true },
    { new: true }
  )
  if (!alert) return error(res, 'Alert not found', 404)
  return success(res, { alert })
}

exports.resolve = async (req, res) => {
  const alert = await Alert.findByIdAndUpdate(
    req.params.id,
    { isResolved: true, resolvedBy: req.user._id, resolvedAt: new Date(), isAcknowledged: true, isRead: true },
    { new: true }
  )
  if (!alert) return error(res, 'Alert not found', 404)
  return success(res, { alert })
}

exports.deleteAlert = async (req, res) => {
  const alert = await Alert.findByIdAndDelete(req.params.id)
  if (!alert) return error(res, 'Alert not found', 404)
  return success(res, {}, 'Alert deleted')
}

exports.getUnreadCount = async (req, res) => {
  const unread = await Alert.countDocuments({ isRead: false })
  return success(res, { unread })
}

// Expiry lookahead window — products expiring within this many days get an
// "expiring soon" alert; already-past-date products get a critical "expired" alert.
const EXPIRY_WARNING_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

// Alerts are written as upserts keyed on (product, type, isAcknowledged:false) —
// enforced unique by the partial index on Alert (see models/Alert.js) — rather
// than a plain insert-if-none-open check. This means a product that stays in a
// bad state across scans gets its ALERT CONTENT refreshed (priority/message)
// instead of being frozen at whatever it looked like when first flagged, which
// previously let e.g. an "expiring soon" (medium) alert block a later "expired"
// (critical) alert from ever appearing for the same product.
function queueUpsert(bulkOps, alert) {
  const { product, type, ...content } = alert
  bulkOps.push({
    updateOne: {
      filter: { product, type, isAcknowledged: false },
      update: { $set: content, $setOnInsert: { product, type } },
      upsert: true,
    },
  })
}

// Auto-generate stock alerts
exports.generateStockAlerts = async (req, res) => {
  const products = await Product.find({ isActive: true })
    .select('name sku currentStock reorderLevel maxStock expiryDate')
    .lean()

  if (!products.length) return success(res, { alertsCreated: 0 }, 'No active products')

  const now = new Date()
  const bulkOps = []

  for (const product of products) {
    if (product.currentStock <= 0) {
      queueUpsert(bulkOps, {
        type: 'out_of_stock', priority: 'critical',
        title: `Out of Stock: ${product.name}`,
        message: `${product.name} (${product.sku}) is out of stock. Immediate restocking required.`,
        product: product._id, productName: product.name,
      })
    } else if (product.currentStock <= product.reorderLevel) {
      queueUpsert(bulkOps, {
        type: 'low_stock',
        priority: product.currentStock <= product.reorderLevel * 0.5 ? 'high' : 'medium',
        title: `Low Stock: ${product.name}`,
        message: `${product.name} has only ${product.currentStock} units left. Reorder level is ${product.reorderLevel}.`,
        product: product._id, productName: product.name,
        metadata: { currentStock: product.currentStock, reorderLevel: product.reorderLevel },
      })
    } else if (isOverstocked(product)) {
      queueUpsert(bulkOps, buildOverstockAlert(product))
    }

    if (product.expiryDate) {
      const daysToExpiry = Math.ceil((product.expiryDate.getTime() - now.getTime()) / MS_PER_DAY)
      if (daysToExpiry <= EXPIRY_WARNING_DAYS) {
        const expired = daysToExpiry < 0
        queueUpsert(bulkOps, {
          type: 'expiry',
          priority: expired ? 'critical' : daysToExpiry <= 3 ? 'high' : 'medium',
          title: expired ? `Expired: ${product.name}` : `Expiring Soon: ${product.name}`,
          message: expired
            ? `${product.name} (${product.sku}) expired on ${product.expiryDate.toDateString()}.`
            : `${product.name} (${product.sku}) expires in ${daysToExpiry} day(s) on ${product.expiryDate.toDateString()}.`,
          product: product._id, productName: product.name,
          metadata: { expiryDate: product.expiryDate, daysToExpiry },
        })
      }
    }
  }

  // ── forecast_change: pull the latest AI demand-trend snapshot from the
  // ai-service's mlInventoryRecs collection (same MongoDB database) and flag
  // products whose forecast is trending up or down, not just holding steady.
  const skuToProduct = new Map(products.map(p => [p.sku, p]))
  const mlRecs = await Product.db.collection('mlInventoryRecs')
    .find({ sku_id: { $in: [...skuToProduct.keys()] } })
    .project({ sku_id: 1, demand_trend: 1, stockout_risk: 1 })
    .toArray()

  const stableProductIds = []
  for (const rec of mlRecs) {
    const product = skuToProduct.get(rec.sku_id)
    if (!product) continue

    if (rec.demand_trend === 'stable') {
      stableProductIds.push(product._id)
      continue
    }
    if (rec.demand_trend !== 'rising' && rec.demand_trend !== 'falling') continue

    const rising = rec.demand_trend === 'rising'
    queueUpsert(bulkOps, {
      type: 'forecast_change',
      priority: rising && rec.stockout_risk === 'high' ? 'high' : 'medium',
      title: rising ? `Demand Rising: ${product.name}` : `Demand Falling: ${product.name}`,
      message: rising
        ? `${product.name} is trending upward in the latest AI forecast — consider increasing reorder quantities.`
        : `${product.name} is trending downward in the latest AI forecast — consider reducing reorder quantities to avoid overstock.`,
      product: product._id, productName: product.name,
      metadata: { demand_trend: rec.demand_trend, stockout_risk: rec.stockout_risk },
    })
  }

  let alertsCreated = 0
  if (bulkOps.length) {
    const result = await Alert.bulkWrite(bulkOps, { ordered: false })
    alertsCreated = result.upsertedCount
  }

  // Auto-acknowledge forecast_change alerts whose trend has since gone stable —
  // mirrors the stale-alert cleanup already done for low_stock/out_of_stock/overstock.
  if (stableProductIds.length) {
    await Alert.updateMany(
      { product: { $in: stableProductIds }, type: 'forecast_change', isAcknowledged: false },
      { $set: { isAcknowledged: true, acknowledgedAt: new Date() } }
    )
  }

  return success(res, { alertsCreated }, `Generated ${alertsCreated} new alerts`)
}
