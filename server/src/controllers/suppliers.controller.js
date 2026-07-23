const mongoose = require('mongoose')
const Supplier      = require('../models/Supplier')
const Purchase      = require('../models/Purchase')
const Product       = require('../models/Product')
const AuditLog      = require('../models/AuditLog')
const { success, created, error, paginated } = require('../utils/response')
const cloudinary    = require('../services/cloudinary.service')

const SUPPLIERS_FOLDER = process.env.CLOUDINARY_SUPPLIERS_FOLDER || 'stockwise/suppliers'

// ─── helpers ──────────────────────────────────────────────────────────────────
const toId = (id) => new mongoose.Types.ObjectId(id)

// ─── LIST / CRUD ──────────────────────────────────────────────────────────────

exports.getSuppliers = async (req, res) => {
  const { page = 1, limit: _limit = 20, search, status } = req.query
  const limit = Math.min(parseInt(_limit), 100)
  const skip  = (parseInt(page) - 1) * limit
  const query = {}
  if (search) query.$text = { $search: search }
  if (status) query.status = status

  const [suppliers, total] = await Promise.all([
    Supplier.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Supplier.countDocuments(query),
  ])
  return paginated(res, { data: suppliers, total, page: parseInt(page), limit: parseInt(limit) })
}

exports.getSupplier = async (req, res) => {
  const supplier = await Supplier.findById(req.params.id)
  if (!supplier) return error(res, 'Supplier not found', 404)
  return success(res, { supplier })
}

exports.createSupplier = async (req, res) => {
  const { validationResult } = require('express-validator')
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  // Fix #10: Supplier.create(req.body) allowed callers to inject server-owned
  // fields: totalPurchases, lastOrderDate, logo, logoPublicId, etc.
  // Whitelist only the fields a user is permitted to supply on creation.
  const {
    name, contactPerson, phone, email, address, district,
    leadTimeDays, paymentTerms, status, rating, notes,
  } = req.body

  const supplier = await Supplier.create({
    name, contactPerson, phone, email, address, district,
    leadTimeDays, paymentTerms, status, rating, notes,
  })

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'SUPPLIER_CREATED', resource: 'Supplier', resourceId: supplier._id.toString(),
    details: { name: supplier.name },
    status: 'success',
  }).catch(() => {})

  return created(res, { supplier }, 'Supplier created')
}

exports.updateSupplier = async (req, res) => {
  const {
    name, contactPerson, phone, email, address, district,
    leadTimeDays, paymentTerms, status, rating, notes,
  } = req.body
  const updates = Object.fromEntries(
    Object.entries({ name, contactPerson, phone, email, address, district, leadTimeDays, paymentTerms, status, rating, notes })
      .filter(([, v]) => v !== undefined)
  )
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
  if (!supplier) return error(res, 'Supplier not found', 404)

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'SUPPLIER_UPDATED', resource: 'Supplier', resourceId: supplier._id.toString(),
    details: { changed: Object.keys(updates), name: supplier.name },
    status: 'success',
  }).catch(() => {})

  return success(res, { supplier }, 'Supplier updated')
}

exports.deleteSupplier = async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(
    req.params.id, { status: 'inactive' }, { new: true }
  )
  if (!supplier) return error(res, 'Supplier not found', 404)

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'SUPPLIER_DELETED', resource: 'Supplier', resourceId: supplier._id.toString(),
    details: { name: supplier.name },
    status: 'success',
  }).catch(() => {})

  return success(res, {}, 'Supplier deactivated')
}

// ─── LOGO ──────────────────────────────────────────────────────────────────────

exports.uploadLogo = async (req, res) => {
  if (!req.file) return error(res, 'No image file provided', 400)

  const supplier = await Supplier.findById(req.params.id)
  if (!supplier) return error(res, 'Supplier not found', 404)

  let meta
  try {
    meta = await cloudinary.replaceImage(req.file, SUPPLIERS_FOLDER, supplier.logoPublicId)
  } catch (uploadErr) {
    return error(res, uploadErr.message, uploadErr.status || 502)
  }

  supplier.logo         = meta.url
  supplier.logoPublicId = meta.publicId
  supplier.logoAssetId  = meta.assetId
  supplier.logoFormat   = meta.format
  await supplier.save()

  return success(res, { supplier }, 'Supplier logo updated')
}

exports.deleteLogo = async (req, res) => {
  const supplier = await Supplier.findById(req.params.id)
  if (!supplier) return error(res, 'Supplier not found', 404)

  if (supplier.logoPublicId) await cloudinary.deleteImage(supplier.logoPublicId)

  supplier.logo         = null
  supplier.logoPublicId = null
  supplier.logoAssetId  = null
  supplier.logoFormat   = null
  await supplier.save()

  return success(res, { supplier }, 'Supplier logo removed')
}

exports.getAllForSelect = async (req, res) => {
  const suppliers = await Supplier.find({ status: 'active' }, 'name phone email leadTimeDays').sort({ name: 1 })
  return success(res, { suppliers })
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [
    totalSuppliers,
    activeSuppliers,
    purchaseStats,
    topSuppliers,
    monthlyTrend,
    ratingDist,
    paymentOverview,
  ] = await Promise.all([
    Supplier.countDocuments(),
    Supplier.countDocuments({ status: 'active' }),

    // Overall purchase totals
    Purchase.aggregate([
      { $group: {
        _id:           null,
        totalAmount:   { $sum: '$grandTotal' },
        totalOrders:   { $sum: 1 },
        outstandingAmount: {
          $sum: { $cond: [{ $in: ['$paymentStatus', ['pending', 'partial']] }, '$grandTotal', 0] },
        },
      }},
    ]),

    // Top 5 suppliers by purchase volume
    Purchase.aggregate([
      { $group: {
        _id:         '$supplier',
        totalAmount: { $sum: '$grandTotal' },
        orderCount:  { $sum: 1 },
        lastOrder:   { $max: '$purchaseDate' },
      }},
      { $sort: { totalAmount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'info' } },
      { $unwind: '$info' },
      { $project: {
        _id: 0,
        supplierId:  '$_id',
        name:        '$info.name',
        rating:      '$info.rating',
        status:      '$info.status',
        totalAmount: 1,
        orderCount:  1,
        lastOrder:   1,
      }},
    ]),

    // Monthly purchase spend (last 6 months)
    Purchase.aggregate([
      { $match: { purchaseDate: { $gte: sixMonthsAgo } } },
      { $group: {
        _id:    { year: { $year: '$purchaseDate' }, month: { $month: '$purchaseDate' } },
        amount: { $sum: '$grandTotal' },
        count:  { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month', amount: 1, count: 1 } },
    ]),

    // Rating distribution
    Supplier.aggregate([
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, rating: '$_id', count: 1 } },
    ]),

    // Payment status breakdown across all purchases
    Purchase.aggregate([
      { $group: {
        _id:    '$paymentStatus',
        count:  { $sum: 1 },
        amount: { $sum: '$grandTotal' },
      }},
      { $project: { _id: 0, status: '$_id', count: 1, amount: 1 } },
    ]),
  ])

  // Avg delivery time across all received purchases
  const deliveryAvg = await Purchase.aggregate([
    { $match: {
      status:       'received',
      deliveryDate: { $exists: true, $ne: null },
      purchaseDate: { $exists: true, $ne: null },
    }},
    { $project: {
      days: { $divide: [{ $subtract: ['$deliveryDate', '$purchaseDate'] }, 86400000] },
    }},
    { $match: { days: { $gt: 0 } } },
    { $group: {
      _id: null,
      avgDays: { $avg: '$days' },
    }},
  ])

  const ps = purchaseStats[0] || {}

  return success(res, {
    totalSuppliers,
    activeSuppliers,
    totalPurchaseAmount:  ps.totalAmount   || 0,
    totalPurchaseOrders:  ps.totalOrders   || 0,
    outstandingAmount:    ps.outstandingAmount || 0,
    avgDeliveryDays:      deliveryAvg[0]   ? Math.round(deliveryAvg[0].avgDays * 10) / 10 : null,
    topSuppliers,
    monthlyTrend,
    ratingDistribution:   ratingDist,
    paymentOverview,
  })
}

// ─── SINGLE SUPPLIER PERFORMANCE ─────────────────────────────────────────────

exports.getPerformance = async (req, res) => {
  const supplier = await Supplier.findById(req.params.id)
  if (!supplier) return error(res, 'Supplier not found', 404)

  const sid = supplier._id
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [
    perfStats,
    paymentBreakdown,
    topProducts,
    monthlyTrend,
    recentPurchases,
    activeProducts,
  ] = await Promise.all([

    // Core performance metrics (received orders only for delivery timing)
    Purchase.aggregate([
      { $match: { supplier: sid } },
      {
        $facet: {
          // delivery timing only on received orders with both dates
          deliveryStats: [
            { $match: {
              status:       { $in: ['received', 'partial'] },
              deliveryDate: { $exists: true, $ne: null },
              purchaseDate: { $exists: true, $ne: null },
            }},
            { $project: {
              grandTotal: 1,
              days: { $divide: [{ $subtract: ['$deliveryDate', '$purchaseDate'] }, 86400000] },
            }},
            { $match: { days: { $gt: 0 } } },
            { $group: {
              _id:             null,
              avgDeliveryDays: { $avg: '$days' },
              minDeliveryDays: { $min: '$days' },
              maxDeliveryDays: { $max: '$days' },
              lateCount: {
                $sum: { $cond: [{ $gt: ['$days', supplier.leadTimeDays] }, 1, 0] },
              },
              onTimeCount: {
                $sum: { $cond: [{ $lte: ['$days', supplier.leadTimeDays] }, 1, 0] },
              },
              lastDelivery: { $max: '$deliveryDate' },
            }},
          ],
          // All order totals
          orderStats: [
            { $group: {
              _id:          null,
              totalOrders:  { $sum: 1 },
              totalAmount:  { $sum: '$grandTotal' },
              avgOrderValue: { $avg: '$grandTotal' },
              lastOrderDate: { $max: '$purchaseDate' },
              lastDelivery:  { $max: '$deliveryDate' },
            }},
          ],
        },
      },
    ]),

    // Payment breakdown
    Purchase.aggregate([
      { $match: { supplier: sid } },
      { $group: {
        _id:    '$paymentStatus',
        count:  { $sum: 1 },
        amount: { $sum: '$grandTotal' },
      }},
      { $project: { _id: 0, status: '$_id', count: 1, amount: 1 } },
    ]),

    // Top 6 products by purchase amount
    Purchase.aggregate([
      { $match: { supplier: sid } },
      { $unwind: '$items' },
      { $group: {
        _id:         '$items.product',
        productName: { $first: '$items.productName' },
        sku:         { $first: '$items.sku' },
        totalQty:    { $sum: '$items.quantity' },
        totalAmount: { $sum: '$items.total' },
        orderCount:  { $sum: 1 },
      }},
      { $sort: { totalAmount: -1 } },
      { $limit: 6 },
      { $project: {
        _id: 0, productId: '$_id', productName: 1, sku: 1,
        totalQty: 1, totalAmount: 1, orderCount: 1,
      }},
    ]),

    // Monthly spend trend (last 6 months)
    Purchase.aggregate([
      { $match: { supplier: sid, purchaseDate: { $gte: sixMonthsAgo } } },
      { $group: {
        _id:    { year: { $year: '$purchaseDate' }, month: { $month: '$purchaseDate' } },
        amount: { $sum: '$grandTotal' },
        count:  { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month', amount: 1, count: 1 } },
    ]),

    // Recent 8 purchases
    Purchase.find({ supplier: sid })
      .sort({ purchaseDate: -1 })
      .limit(8)
      .select('purchaseNumber purchaseDate deliveryDate status paymentStatus grandTotal items'),

    // Active products linked to this supplier
    Product.countDocuments({ supplier: sid, isActive: true }),
  ])

  const delivery = perfStats[0]?.deliveryStats[0] || {}
  const orders   = perfStats[0]?.orderStats[0]   || {}

  const outstandingBalance = paymentBreakdown
    .filter(p => ['pending', 'partial'].includes(p.status))
    .reduce((s, p) => s + p.amount, 0)

  const totalDelivered = (delivery.lateCount || 0) + (delivery.onTimeCount || 0)

  return success(res, {
    supplier,
    performance: {
      totalOrders:      orders.totalOrders      || 0,
      totalAmount:      orders.totalAmount      || 0,
      avgOrderValue:    orders.avgOrderValue    ? Math.round(orders.avgOrderValue) : 0,
      lastOrderDate:    orders.lastOrderDate    || null,
      lastDelivery:     orders.lastDelivery     || null,
      activeProducts,
      outstandingBalance,
      // Delivery timing
      avgDeliveryDays:  delivery.avgDeliveryDays ? Math.round(delivery.avgDeliveryDays * 10) / 10 : null,
      minDeliveryDays:  delivery.minDeliveryDays ? Math.round(delivery.minDeliveryDays * 10) / 10 : null,
      maxDeliveryDays:  delivery.maxDeliveryDays ? Math.round(delivery.maxDeliveryDays * 10) / 10 : null,
      lateDeliveries:   delivery.lateCount      || 0,
      onTimeDeliveries: delivery.onTimeCount    || 0,
      onTimeRate: totalDelivered > 0
        ? Math.round((delivery.onTimeCount / totalDelivered) * 100)
        : null,
    },
    paymentBreakdown,
    topProducts,
    monthlyTrend,
    recentPurchases,
  })
}

// ─── ANALYTICS (comparative, all suppliers) ───────────────────────────────────

exports.getAnalytics = async (req, res) => {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [
    supplierComparison,
    paymentOverview,
    deliveryPerformance,
    monthlySpendBySupplier,
    categoryBreakdown,
  ] = await Promise.all([

    // Full comparison table — all suppliers with purchase totals
    Purchase.aggregate([
      { $group: {
        _id:           '$supplier',
        totalAmount:   { $sum: '$grandTotal' },
        totalOrders:   { $sum: 1 },
        avgOrderValue: { $avg: '$grandTotal' },
        lastOrder:     { $max: '$purchaseDate' },
        pendingAmount: {
          $sum: { $cond: [{ $in: ['$paymentStatus', ['pending', 'partial']] }, '$grandTotal', 0] },
        },
      }},
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'info' } },
      { $unwind: '$info' },
      { $project: {
        _id: 0,
        supplierId:    '$_id',
        name:          '$info.name',
        status:        '$info.status',
        rating:        '$info.rating',
        leadTimeDays:  '$info.leadTimeDays',
        paymentTerms:  '$info.paymentTerms',
        district:      '$info.district',
        totalAmount:   1,
        totalOrders:   1,
        avgOrderValue: { $round: ['$avgOrderValue', 0] },
        lastOrder:     1,
        pendingAmount: 1,
      }},
      { $sort: { totalAmount: -1 } },
    ]),

    // Payment status overview
    Purchase.aggregate([
      { $group: {
        _id:    '$paymentStatus',
        count:  { $sum: 1 },
        amount: { $sum: '$grandTotal' },
      }},
      { $project: { _id: 0, status: '$_id', count: 1, amount: 1 } },
    ]),

    // Delivery performance per supplier (avg days vs lead time)
    Purchase.aggregate([
      { $match: {
        status:       'received',
        deliveryDate: { $exists: true, $ne: null },
        purchaseDate: { $exists: true, $ne: null },
      }},
      { $project: {
        supplier: 1,
        days: { $divide: [{ $subtract: ['$deliveryDate', '$purchaseDate'] }, 86400000] },
      }},
      { $match: { days: { $gt: 0 } } },
      { $group: {
        _id:             '$supplier',
        avgDays:         { $avg: '$days' },
        minDays:         { $min: '$days' },
        maxDays:         { $max: '$days' },
        orderCount:      { $sum: 1 },
      }},
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'info' } },
      { $unwind: '$info' },
      { $project: {
        _id: 0,
        supplierId:   '$_id',
        name:         '$info.name',
        leadTimeDays: '$info.leadTimeDays',
        avgDays:      { $round: ['$avgDays',  1] },
        minDays:      { $round: ['$minDays',  1] },
        maxDays:      { $round: ['$maxDays',  1] },
        orderCount:   1,
        onTime: { $cond: [{ $lte: [{ $round: ['$avgDays', 1] }, '$info.leadTimeDays'] }, true, false] },
      }},
      { $sort: { avgDays: 1 } },
    ]),

    // Monthly spend per top-5 supplier (last 6 months)
    Purchase.aggregate([
      { $match: { purchaseDate: { $gte: sixMonthsAgo } } },
      { $group: {
        _id:    { supplier: '$supplier', year: { $year: '$purchaseDate' }, month: { $month: '$purchaseDate' } },
        amount: { $sum: '$grandTotal' },
      }},
      { $lookup: { from: 'suppliers', localField: '_id.supplier', foreignField: '_id', as: 'info' } },
      { $unwind: '$info' },
      { $project: {
        _id:          0,
        supplierName: '$info.name',
        year:         '$_id.year',
        month:        '$_id.month',
        amount:       1,
      }},
      { $sort: { year: 1, month: 1 } },
    ]),

    // Product category spend breakdown by supplier
    Purchase.aggregate([
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'prod' } },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'categories', localField: 'prod.category', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:    { supplier: '$supplier', category: '$cat.name' },
        amount: { $sum: '$items.total' },
        qty:    { $sum: '$items.quantity' },
      }},
      { $lookup: { from: 'suppliers', localField: '_id.supplier', foreignField: '_id', as: 'sup' } },
      { $unwind: '$sup' },
      { $project: {
        _id:          0,
        supplierName: '$sup.name',
        category:     { $ifNull: ['$_id.category', 'Uncategorized'] },
        amount:       1,
        qty:          1,
      }},
      { $sort: { amount: -1 } },
    ]),
  ])

  return success(res, {
    supplierComparison,
    paymentOverview,
    deliveryPerformance,
    monthlySpendBySupplier,
    categoryBreakdown,
  })
}
