const Alert = require('../models/Alert')
const Product = require('../models/Product')
const { success, error, paginated } = require('../utils/response')

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

// Auto-generate stock alerts — single bulk read for existing alerts avoids N+1 queries
exports.generateStockAlerts = async (req, res) => {
  const products = await Product.find({ isActive: true })
    .select('name sku currentStock reorderLevel')
    .lean()

  if (!products.length) return success(res, { alertsCreated: 0 }, 'No active products')

  const productIds = products.map(p => p._id)

  // Fetch all open alerts for these products in one query
  const openAlerts = await Alert.find({
    product: { $in: productIds },
    isAcknowledged: false,
    type: { $in: ['out_of_stock', 'low_stock'] },
  }).select('product type').lean()

  const openSet = new Set(openAlerts.map(a => `${a.product}:${a.type}`))

  const toCreate = []
  for (const product of products) {
    const pid = product._id.toString()
    if (product.currentStock <= 0) {
      if (!openSet.has(`${pid}:out_of_stock`)) {
        toCreate.push({
          type: 'out_of_stock', priority: 'critical',
          title: `Out of Stock: ${product.name}`,
          message: `${product.name} (${product.sku}) is out of stock. Immediate restocking required.`,
          product: product._id, productName: product.name,
        })
      }
    } else if (product.currentStock <= product.reorderLevel) {
      if (!openSet.has(`${pid}:low_stock`)) {
        toCreate.push({
          type: 'low_stock',
          priority: product.currentStock <= product.reorderLevel * 0.5 ? 'high' : 'medium',
          title: `Low Stock: ${product.name}`,
          message: `${product.name} has only ${product.currentStock} units left. Reorder level is ${product.reorderLevel}.`,
          product: product._id, productName: product.name,
          metadata: { currentStock: product.currentStock, reorderLevel: product.reorderLevel },
        })
      }
    }
  }

  if (toCreate.length) await Alert.insertMany(toCreate, { ordered: false })

  return success(res, { alertsCreated: toCreate.length }, `Generated ${toCreate.length} new alerts`)
}
