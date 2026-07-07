const mongoose = require('mongoose')
const Purchase = require('../models/Purchase')
const Product = require('../models/Product')
const Supplier = require('../models/Supplier')
const StockMovement = require('../models/StockMovement')
const Alert = require('../models/Alert')
const AuditLog = require('../models/AuditLog')
require('../models/User') // register User schema so Purchase.populate('recordedBy') resolves
const { success, created, error, paginated } = require('../utils/response')

exports.getPurchases = async (req, res) => {
  try {
    const { page = 1, limit: _limit = 20, supplier, status, startDate, endDate, search } = req.query
    const limit = Math.min(parseInt(_limit), 100)
    const skip  = (parseInt(page) - 1) * limit
    const query = {}

    if (supplier) query.supplier = supplier
    if (status)   query.status   = status
    if (startDate || endDate) {
      query.purchaseDate = {}
      if (startDate) query.purchaseDate.$gte = new Date(startDate)
      if (endDate)   query.purchaseDate.$lte = new Date(endDate + 'T23:59:59')
    }
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.purchaseNumber = new RegExp(safe, 'i')
    }

    const [purchases, total] = await Promise.all([
      Purchase.find(query)
        .populate('supplier', 'name phone email')
        .populate('recordedBy', 'fullName email')
        .sort({ purchaseDate: -1 })
        .skip(skip).limit(limit),
      Purchase.countDocuments(query),
    ])

    return paginated(res, { data: purchases, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    console.error('[Purchases] getPurchases Error:', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch purchases.', timestamp: new Date() })
  }
}

exports.getPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('supplier', 'name phone email address')
      .populate('recordedBy', 'fullName email')
    if (!purchase) return error(res, 'Purchase not found', 404)
    return success(res, { purchase })
  } catch (err) {
    console.error('[Purchases] getPurchase Error:', err)
    return res.status(err.statusCode || 500).json({
      success: false, message: err.statusCode ? err.message : 'Failed to fetch purchase.', timestamp: new Date(),
    })
  }
}

exports.createPurchase = async (req, res) => {
  try {
    const { supplier, items, discount = 0, paymentMethod, paymentStatus, deliveryDate, notes } = req.body

    if (!items?.length) return error(res, 'Purchase must have at least one item', 400)
    if (!supplier)      return error(res, 'Supplier is required', 400)

    // Reject orders with the same product listed twice — quantities should be
    // combined by the caller before submission.
    const seenIds = new Set()
    for (const item of items) {
      const id = item.product?.toString()
      if (seenIds.has(id)) {
        return error(res, 'Duplicate product in purchase order — combine quantities instead of listing the same product twice', 400)
      }
      seenIds.add(id)
    }

    const supplierDoc = await Supplier.findById(supplier)
    if (!supplierDoc) return error(res, 'Supplier not found', 404)

    // Batch all product lookups into a single round trip (avoids N+1 queries).
    const productIds = items.map(i => i.product)
    const products   = await Product.find({ _id: { $in: productIds } }).lean()
    const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]))

    const purchaseItems = []
    for (const item of items) {
      const product = productMap[item.product?.toString()]
      if (!product) return error(res, `Product not found: ${item.product}`, 404)
      const price = item.buyingPrice ?? product.buyingPrice
      purchaseItems.push({
        product:     product._id,
        productName: product.name,
        sku:         product.sku,
        quantity:    item.quantity,
        buyingPrice: price,
        total:       item.quantity * price,
      })
    }

    const subtotal   = purchaseItems.reduce((s, i) => s + i.total, 0)
    // Floor at 0 — a discount larger than the subtotal must never produce a
    // negative grand total (e.g. a data-entry mistake with discount = 999999).
    const grandTotal = Math.max(0, subtotal - discount)

    const purchase = await Purchase.create({
      supplier, items: purchaseItems, subtotal, discount, grandTotal,
      paymentMethod, paymentStatus, deliveryDate, notes,
      recordedBy: req.user._id,
    })

    AuditLog.create({
      user: req.user._id, userEmail: req.user.email,
      action: 'PURCHASE_CREATED', resource: 'Purchase', resourceId: purchase._id.toString(),
      details: { purchaseNumber: purchase.purchaseNumber, supplier: supplierDoc.name, grandTotal },
      status: 'success',
    }).catch(() => {})

    return created(res, { purchase }, 'Purchase order created')
  } catch (err) {
    console.error('[Purchases] createPurchase Error:', err)

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message)
      return res.status(400).json({
        success: false, message: messages.join('. '), timestamp: new Date(),
      })
    }
    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false, message: `Invalid value for "${err.path}": "${err.value}"`, timestamp: new Date(),
      })
    }
    const statusCode = err.statusCode || 500
    return res.status(statusCode).json({
      success:   false,
      message:   statusCode < 500 ? err.message : 'Failed to create purchase order. Please try again.',
      timestamp: new Date(),
      ...(process.env.NODE_ENV === 'development' && { details: err.message }),
    })
  }
}

exports.receivePurchase = async (req, res) => {
  try {
    // Confirm the purchase exists before any writes (clear 404 message).
    const purchaseCheck = await Purchase.findById(req.params.id).lean()
    if (!purchaseCheck) return error(res, 'Purchase not found', 404)

    // Cancelled POs must never be received.
    if (purchaseCheck.status === 'cancelled') {
      return error(res, 'Cannot receive a cancelled purchase order', 400)
    }

    // Root-cause fix: the previous implementation used mongoose.startSession() +
    // session.startTransaction(), which requires MongoDB to run as a replica set.
    // On a standalone MongoDB instance this throws:
    //   MongoServerError: Transaction numbers are only allowed on a replica set member or mongos
    //
    // Fix: use findOneAndUpdate with an atomic status guard ($in check) to prevent
    // double-receive races, then update each product stock with individual atomic
    // increments.  These are all single-document atomic operations that work on
    // any MongoDB topology (standalone or replica set).
    const receivedPurchase = await Purchase.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['ordered', 'partial'] } },
      { $set: { status: 'received', deliveryDate: new Date() } },
      { new: true }
    )

    if (!receivedPurchase) {
      return error(res, 'Purchase already received or not in a receivable state', 400)
    }

    // Atomically increment stock for each received product.
    const movementDocs = []
    for (const item of receivedPurchase.items) {
      const updated = await Product.findByIdAndUpdate(
        item.product,
        { $inc: { currentStock: item.quantity } },
        { new: true }
      )
      if (!updated) continue // product deleted after PO was created — skip

      const stockAfter  = updated.currentStock
      const stockBefore = stockAfter - item.quantity

      movementDocs.push({
        product:       updated._id,
        productName:   updated.name,
        type:          'purchase',
        quantity:      item.quantity,
        stockBefore,
        stockAfter,
        reference:     receivedPurchase.purchaseNumber,
        referenceId:   receivedPurchase._id,
        referenceType: 'Purchase',
        notes:         `Purchase received — ${receivedPurchase.purchaseNumber}`,
        recordedBy:    req.user._id,
      })
    }

    if (movementDocs.length) {
      await StockMovement.create(movementDocs).catch((smErr) =>
        console.error('[Purchases] StockMovement create failed (non-fatal):', smErr.message)
      )
    }

    // ── Advisory side-effects (non-blocking) ────────────────────────────────────

    // Supplier analytics update — not inventory-critical.
    Supplier.findByIdAndUpdate(receivedPurchase.supplier, {
      lastOrderDate: new Date(),
      $inc: { totalPurchases: receivedPurchase.grandTotal },
    }).catch((e) => console.warn('[Purchases] Supplier stats update failed:', e.message))

    // Auto-resolve any outstanding low_stock / out_of_stock alerts for products
    // that just had stock received — stale alerts confuse the dashboard.
    const receivedProductIds = receivedPurchase.items.map(i => i.product)
    Alert.updateMany(
      { product: { $in: receivedProductIds }, type: { $in: ['low_stock', 'out_of_stock'] }, isAcknowledged: false },
      { $set: { isAcknowledged: true, acknowledgedAt: new Date() } }
    ).catch(() => {})

    AuditLog.create({
      user: req.user._id, userEmail: req.user.email,
      action: 'PURCHASE_RECEIVED', resource: 'Purchase', resourceId: receivedPurchase._id.toString(),
      details: {
        purchaseNumber: receivedPurchase.purchaseNumber,
        itemCount: receivedPurchase.items.length,
        grandTotal: receivedPurchase.grandTotal,
      },
      status: 'success',
    }).catch(() => {})

    return success(res, { purchase: receivedPurchase }, 'Purchase received and inventory updated')
  } catch (err) {
    console.error('[Purchases] receivePurchase Error:', err)
    const statusCode = err.statusCode || 500
    return res.status(statusCode).json({
      success:   false,
      message:   statusCode < 500 ? err.message : 'Failed to receive purchase. Please try again.',
      timestamp: new Date(),
      ...(process.env.NODE_ENV === 'development' && { details: err.message }),
    })
  }
}

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus, paymentMethod } = req.body
    const allowed = ['paid', 'partial', 'pending']
    if (!allowed.includes(paymentStatus)) return error(res, 'Invalid payment status', 400)

    const purchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      { paymentStatus, ...(paymentMethod && { paymentMethod }) },
      { new: true, runValidators: true }
    ).populate('supplier', 'name')
    if (!purchase) return error(res, 'Purchase not found', 404)
    return success(res, { purchase }, 'Payment status updated')
  } catch (err) {
    console.error('[Purchases] updatePaymentStatus Error:', err)
    return res.status(err.statusCode || 500).json({
      success: false, message: err.statusCode ? err.message : 'Failed to update payment status.', timestamp: new Date(),
    })
  }
}

exports.deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
    if (!purchase) return error(res, 'Purchase not found', 404)

    // 'received' and 'partial' both mean goods have already entered stock —
    // deleting the PO would create phantom inventory with no paper trail.
    if (purchase.status === 'received' || purchase.status === 'partial') {
      return error(res, 'Cannot delete a received or partially-received purchase order. Create a return instead.', 400)
    }

    await purchase.deleteOne()
    return success(res, {}, 'Purchase deleted')
  } catch (err) {
    console.error('[Purchases] deletePurchase Error:', err)
    return res.status(err.statusCode || 500).json({
      success: false, message: err.statusCode ? err.message : 'Failed to delete purchase.', timestamp: new Date(),
    })
  }
}

exports.getPurchaseStats = async (req, res) => {
  try {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

    const [monthStats, totalStats, pendingCount, outstandingData] = await Promise.all([
      Purchase.aggregate([
        { $match: { purchaseDate: { $gte: monthStart }, status: 'received' } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
      Purchase.aggregate([
        { $match: { status: 'received' } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, avgOrder: { $avg: '$grandTotal' } } },
      ]),
      Purchase.countDocuments({ status: 'ordered' }),
      // Exclude cancelled purchases — a cancelled order with paymentStatus:'pending'
      // is not actually owed.
      Purchase.aggregate([
        { $match: { paymentStatus: { $in: ['pending', 'partial'] }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
    ])

    return success(res, {
      month:         { total: monthStats[0]?.total  || 0, count: monthStats[0]?.count  || 0 },
      all:           { total: totalStats[0]?.total  || 0, count: totalStats[0]?.count  || 0 },
      avgOrder:      totalStats[0]?.avgOrder || 0,
      pendingOrders: pendingCount,
      outstanding:   { total: outstandingData[0]?.total || 0, count: outstandingData[0]?.count || 0 },
    })
  } catch (err) {
    console.error('[Purchases] getPurchaseStats Error:', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase stats.', timestamp: new Date() })
  }
}
