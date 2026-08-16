const mongoose = require('mongoose')
const Sale = require('../models/Sale')
const Product = require('../models/Product')
const StockMovement = require('../models/StockMovement')
const Alert = require('../models/Alert')
const AuditLog = require('../models/AuditLog')
require('../models/User') // register User schema so Sale.populate('recordedBy') resolves
const { success, created, error, paginated } = require('../utils/response')
const { isOverstocked, queueUpsert } = require('../utils/stockAlerts')

const SALES_SORTABLE_FIELDS = { saleDate: 'saleDate', grandTotal: 'grandTotal', invoiceNumber: 'invoiceNumber' }

exports.getSales = async (req, res) => {
  const { startDate, endDate, status, search, sortBy, sortDir } = req.query
  const page  = Math.max(1, parseInt(req.query.page)  || 1)
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100)
  const skip  = (page - 1) * limit
  const sortField = SALES_SORTABLE_FIELDS[sortBy] || 'saleDate'
  const sortOrder  = sortDir === 'asc' ? 1 : -1
  const query = {}

  if (startDate || endDate) {
    query.saleDate = {}
    if (startDate) query.saleDate.$gte = new Date(startDate)
    if (endDate)   query.saleDate.$lte = new Date(endDate + 'T23:59:59')
  }
  if (status) query.status = status
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(safe, 'i')
    query.$or = [{ invoiceNumber: re }, { customerName: re }]
  }

  const [sales, total] = await Promise.all([
    Sale.find(query).populate('recordedBy', 'fullName email').sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
    Sale.countDocuments(query),
  ])

  return paginated(res, { data: sales, total, page, limit })
}

exports.getSale = async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('recordedBy', 'fullName email')
  if (!sale) return error(res, 'Sale not found', 404)
  return success(res, { sale })
}

exports.createSale = async (req, res) => {
  const { validationResult } = require('express-validator')
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const { items, customerName, customerPhone, paymentMethod, discount = 0, tax = 0, notes } = req.body

  if (!items?.length) return error(res, 'Sale must have at least one item', 400)

  // Reject orders with the same product listed twice — quantities should be
  // combined by the caller before submission.
  const seenIds = new Set()
  for (const item of items) {
    const id = item.product?.toString()
    if (seenIds.has(id)) {
      return error(res, 'Duplicate product in sale — combine quantities instead of listing the same product twice', 400)
    }
    seenIds.add(id)
  }

  // Batch all product lookups into a single round trip (avoids N+1 queries).
  const productIds = items.map(i => i.product)
  const products   = await Product.find({ _id: { $in: productIds } }).lean()
  const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]))

  const enriched = []
  for (const item of items) {
    const product = productMap[item.product?.toString()]
    if (!product) return error(res, `Product not found: ${item.product}`, 404)
    if (product.currentStock < item.quantity) {
      return error(res, `Insufficient stock for "${product.name}" (available: ${product.currentStock})`, 400)
    }
    enriched.push({ product, item })
  }

  const { sale, alertChecks } = await _executeSaleOperation(enriched, {
    customerName, customerPhone, paymentMethod, discount, tax, notes,
    recordedBy: req.user._id, staffName: req.user.fullName,
  })

  // Advisory alerts — best-effort so alert failures never block a completed sale.
  for (const { product, stockAfter } of alertChecks) {
    await _createStockAlertIfNeeded(product, stockAfter).catch((alertErr) =>
      console.warn(`[Sales] Alert creation failed for ${product.name}:`, alertErr.message)
    )
  }

  return created(res, { sale }, 'Sale recorded successfully')
}

// ── Sale execution (no session required) ─────────────────────────────────────
//
// Root-cause fix: the previous implementation used mongoose.startSession() +
// session.startTransaction(), which requires MongoDB to run as a replica set.
// On a standalone MongoDB instance this throws:
//   MongoServerError: Transaction numbers are only allowed on a replica set member or mongos
//
// Fix: each product stock deduction uses an atomic findOneAndUpdate CAS
// (compare-and-swap) — a single-document atomic operation that is safe without
// a multi-document transaction.  If Sale.create fails AFTER some deductions
// have been applied, the deducted stock is immediately compensated via bulkWrite
// so no phantom deductions persist.
async function _executeSaleOperation(enriched, opts) {
  const deducted     = []   // tracks each { _id, qty } that was deducted, for rollback
  let   sale         = null // set once Sale.create succeeds

  try {
    const saleItems    = []
    const movementDocs = []
    const alertChecks  = []

    for (const { product, item } of enriched) {
      const unitPrice = item.unitPrice ?? product.sellingPrice
      const qty       = item.quantity

      // Atomic CAS: decrement stock only if currentStock >= qty.
      // This prevents negative stock even under concurrent requests, without
      // requiring a replica-set-level transaction.
      const updated = await Product.findOneAndUpdate(
        { _id: product._id, currentStock: { $gte: qty } },
        { $inc: { currentStock: -qty } },
        { new: true }
      )

      if (!updated) {
        const err = new Error(`Insufficient stock for "${product.name}" — stock may have changed`)
        err.statusCode = 409
        throw err
      }

      deducted.push({ _id: product._id, qty })

      const stockAfter  = updated.currentStock
      const stockBefore = stockAfter + qty

      saleItems.push({
        product:     product._id,
        productName: product.name,
        sku:         product.sku,
        quantity:    qty,
        unitPrice,
        // Snapshot cost price at sale time so COGS remains accurate if
        // buyingPrice changes later.
        buyingPrice: updated.buyingPrice,
        total:       qty * unitPrice,
      })
      movementDocs.push({
        product:     product._id,
        productName: product.name,
        type:        'sale',
        quantity:    -qty,
        stockBefore,
        stockAfter,
        notes:       `Sale by ${opts.staffName}`,
        recordedBy:  opts.recordedBy,
      })
      alertChecks.push({ product: updated, stockAfter })
    }

    const subtotal   = saleItems.reduce((s, i) => s + i.total, 0)
    const discounted = subtotal - opts.discount
    const grandTotal = discounted + (discounted * opts.tax / 100)

    // Create the Sale document first so its _id and invoiceNumber can be
    // stamped onto the movement records as a cross-collection reference.
    sale = await Sale.create({
      items:         saleItems,
      subtotal,
      discount:      opts.discount,
      tax:           opts.tax,
      grandTotal,
      paymentMethod: opts.paymentMethod,
      customerName:  opts.customerName,
      customerPhone: opts.customerPhone,
      notes:         opts.notes,
      recordedBy:    opts.recordedBy,
    })

    for (const doc of movementDocs) {
      doc.referenceId   = sale._id
      doc.referenceType = 'Sale'
      doc.reference     = sale.invoiceNumber
    }

    // StockMovement creation is best-effort: if it fails, the sale and stock
    // deduction are still valid — the movement log is advisory.
    await StockMovement.create(movementDocs).catch((smErr) =>
      console.error('[Sales] StockMovement create failed (non-fatal):', smErr.message)
    )

    // Fire-and-forget audit log — must not block or roll back a completed sale.
    AuditLog.create({
      user:       opts.recordedBy,
      action:     'SALE_CREATED',
      resource:   'Sale',
      resourceId: sale._id.toString(),
      details:    { invoiceNumber: sale.invoiceNumber, grandTotal, itemCount: saleItems.length },
      status:     'success',
    }).catch(() => {})

    return { sale, alertChecks }
  } catch (err) {
    // Compensate: restore stock for every product that was successfully
    // deducted before the failure, but only when the sale was not yet
    // persisted (if sale exists the deduction is legitimate).
    if (!sale && deducted.length > 0) {
      await Product.bulkWrite(
        deducted.map(({ _id, qty }) => ({
          updateOne: { filter: { _id }, update: { $inc: { currentStock: qty } } },
        }))
      ).catch((rollbackErr) =>
        console.error('[Sales] Stock rollback failed:', rollbackErr.message)
      )
    }
    throw err
  }
}

async function _createStockAlertIfNeeded(product, currentStock) {
  const bulkOps = []
  if (currentStock <= 0) {
    queueUpsert(bulkOps, {
      type: 'out_of_stock', priority: 'critical',
      title:   `Out of Stock: ${product.name}`,
      message: `${product.name} (${product.sku}) is out of stock. Immediate restocking required.`,
      product: product._id, productName: product.name,
    })
  } else if (currentStock <= product.reorderLevel) {
    queueUpsert(bulkOps, {
      type:     'low_stock',
      priority: currentStock <= product.reorderLevel * 0.5 ? 'high' : 'medium',
      title:    `Low Stock: ${product.name}`,
      message:  `${product.name} has only ${currentStock} units left. Reorder level is ${product.reorderLevel}.`,
      product:  product._id, productName: product.name,
      metadata: { currentStock, reorderLevel: product.reorderLevel },
    })
  }
  if (bulkOps.length) await Alert.bulkWrite(bulkOps, { ordered: false })

  // A sale reduces stock — if that pulled the product back below the overstock
  // threshold, the earlier overstock alert (created on restock) is now stale.
  if (!isOverstocked({ currentStock, maxStock: product.maxStock })) {
    await Alert.updateMany(
      { product: product._id, type: 'overstock', isAcknowledged: false },
      { $set: { isAcknowledged: true, acknowledgedAt: new Date() } }
    )
  }
}

exports.voidSale = async (req, res) => {
  const existing = await Sale.findById(req.params.id)
  if (!existing)                       return error(res, 'Sale not found', 404)
  if (existing.status === 'void')      return error(res, 'Sale is already voided', 400)
  if (existing.status === 'refunded')  return error(res, 'A refunded sale cannot be voided — stock was already restored during the refund', 400)

  // Atomically flip status to 'void'.
  const voided = await Sale.findByIdAndUpdate(
    req.params.id,
    { status: 'void' },
    { new: true }
  )

  // Restore stock for each line item and record the reversal movement.
  // Each findByIdAndUpdate is atomic at the document level; no session needed.
  const movementDocs = []
  for (const item of existing.items) {
    const updated = await Product.findByIdAndUpdate(
      item.product,
      { $inc: { currentStock: item.quantity } },
      { new: true }
    )
    if (!updated) continue // product deleted after sale — skip

    movementDocs.push({
      product:       item.product,
      productName:   item.productName,
      type:          'return',
      quantity:      item.quantity,
      stockBefore:   updated.currentStock - item.quantity,
      stockAfter:    updated.currentStock,
      reference:     existing.invoiceNumber,
      referenceId:   existing._id,
      referenceType: 'Sale',
      notes:         `Stock restored — sale ${existing.invoiceNumber} voided`,
      recordedBy:    req.user._id,
    })
  }

  if (movementDocs.length) {
    await StockMovement.create(movementDocs).catch((err) =>
      console.error('[Sales] voidSale movement creation failed (non-fatal):', err.message)
    )
  }

  // Auto-resolve stale low_stock / out_of_stock alerts for products whose
  // stock was just restored.
  const restoredIds = existing.items.map(i => i.product)
  Alert.updateMany(
    { product: { $in: restoredIds }, type: { $in: ['low_stock', 'out_of_stock'] }, isAcknowledged: false },
    { $set: { isAcknowledged: true, acknowledgedAt: new Date() } }
  ).catch(() => {})

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'SALE_VOIDED', resource: 'Sale', resourceId: existing._id.toString(),
    details: { invoiceNumber: existing.invoiceNumber, grandTotal: existing.grandTotal },
    status: 'success',
  }).catch(() => {})

  return success(res, { sale: voided }, 'Sale voided and stock restored')
}

exports.getSalesStats = async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [todaySales, monthSales, totalSales] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: today }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: monthStart }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Sale.countDocuments({ status: 'completed' }),
  ])

  return success(res, {
    today:   { revenue: todaySales[0]?.revenue || 0, count: todaySales[0]?.count || 0 },
    month:   { revenue: monthSales[0]?.revenue || 0, count: monthSales[0]?.count || 0 },
    total:   totalSales,
  })
}

exports.getSalesTrend = async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 365)
  const from = new Date(); from.setDate(from.getDate() - days)

  const trend = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $group: {
      _id:     { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
      revenue: { $sum: '$grandTotal' },
      count:   { $sum: 1 },
    }},
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', revenue: 1, count: 1 } },
  ])

  return success(res, { trend })
}
