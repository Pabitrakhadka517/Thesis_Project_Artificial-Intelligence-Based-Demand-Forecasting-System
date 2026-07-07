'use strict'
const mongoose = require('mongoose')
const Sale          = require('../models/Sale')
const Purchase      = require('../models/Purchase')
const Product       = require('../models/Product')
const Supplier      = require('../models/Supplier')
const StockMovement = require('../models/StockMovement')
const { success }   = require('../utils/response')

function rawColl(name) {
  return mongoose.connection.db ? mongoose.connection.db.collection(name) : null
}

// ── Date helper ───────────────────────────────────────────────────────────────
// Accepts: ?period=today|yesterday|week|month|lastMonth|quarter|year
//          ?days=N  (last N calendar days)
//          ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
function parseDateRange(q) {
  const now = new Date()

  if (q.period) {
    switch (q.period) {
      case 'today': {
        const f = new Date(now); f.setHours(0, 0, 0, 0)
        const t = new Date(now); t.setHours(23, 59, 59, 999)
        return { from: f, to: t }
      }
      case 'yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1)
        const f = new Date(y); f.setHours(0, 0, 0, 0)
        const t = new Date(y); t.setHours(23, 59, 59, 999)
        return { from: f, to: t }
      }
      case 'week': {
        const f = new Date(now); f.setDate(f.getDate() - 6); f.setHours(0, 0, 0, 0)
        return { from: f, to: new Date(now) }
      }
      case 'month': {
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now) }
      }
      case 'lastMonth': {
        const f = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const t = new Date(now.getFullYear(), now.getMonth(), 0); t.setHours(23, 59, 59, 999)
        return { from: f, to: t }
      }
      case 'quarter': {
        const qtr = Math.floor(now.getMonth() / 3)
        return { from: new Date(now.getFullYear(), qtr * 3, 1), to: new Date(now) }
      }
      case 'year': {
        return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now) }
      }
      default: break
    }
  }

  // Legacy: startDate + endDate
  // Fix #19: new Date('garbage') produces Invalid Date (NaN internally).
  // Passing Invalid Date to MongoDB causes an aggregation error or returns no
  // data silently.  Validate before using.
  if (q.startDate && q.endDate) {
    const from = new Date(q.startDate); from.setHours(0, 0, 0, 0)
    const to   = new Date(q.endDate);   to.setHours(23, 59, 59, 999)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      const fallbackTo = new Date()
      const fallbackFrom = new Date(fallbackTo - 30 * 86400000)
      fallbackFrom.setHours(0, 0, 0, 0)
      return { from: fallbackFrom, to: fallbackTo }
    }
    return { from, to }
  }

  // Legacy: days=N
  const days = Math.max(1, parseInt(q.days || 30))
  const to   = new Date()
  const from = new Date(to - days * 86400000); from.setHours(0, 0, 0, 0)
  return { from, to }
}

// ── Sales Report ──────────────────────────────────────────────────────────────
exports.getSalesReport = async (req, res) => {
  const { from, to }           = parseDateRange(req.query)
  const { category, supplier } = req.query
  const matchBase              = { saleDate: { $gte: from, $lte: to }, status: 'completed' }

  if (category || supplier) {
    const pf = { isActive: true }
    if (category) pf.category = new mongoose.Types.ObjectId(category)
    if (supplier) pf.supplier = new mongoose.Types.ObjectId(supplier)
    const pIds = (await Product.find(pf).select('_id').lean()).map(p => p._id)
    if (!pIds.length) return success(res, {
      totalRevenue: 0, totalOrders: 0, avgOrderValue: 0, totalItemsSold: 0,
      totalDiscount: 0, trend: [], topProducts: [], byCategory: [], byPaymentMethod: [],
    })
    matchBase['items.product'] = { $in: pIds }
  }

  const [aggregate, trend, topProducts, byPaymentMethod, byCategory] = await Promise.all([
    // ── Totals
    Sale.aggregate([
      { $match: matchBase },
      { $group: {
        _id:           null,
        totalRevenue:  { $sum: '$grandTotal' },
        totalOrders:   { $sum: 1 },
        totalDiscount: { $sum: '$discount' },
        totalItems:    { $sum: { $size: '$items' } },
      }},
    ]),

    // ── Daily trend
    Sale.aggregate([
      { $match: matchBase },
      { $group: {
        _id:     { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        revenue: { $sum: '$grandTotal' },
        orders:  { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', revenue: 1, orders: 1 } },
    ]),

    // ── Top 10 products by revenue
    Sale.aggregate([
      { $match: matchBase },
      { $unwind: '$items' },
      { $group: {
        _id:     '$items.productName',
        revenue: { $sum: '$items.total' },
        qty:     { $sum: '$items.quantity' },
      }},
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, name: '$_id', revenue: 1, qty: 1 } },
    ]),

    // ── By payment method
    Sale.aggregate([
      { $match: matchBase },
      { $group: {
        _id:    '$paymentMethod',
        count:  { $sum: 1 },
        amount: { $sum: '$grandTotal' },
      }},
      { $project: { _id: 0, method: '$_id', count: 1, amount: 1 } },
    ]),

    // ── Sales by category
    Sale.aggregate([
      { $match: matchBase },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { category: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $lookup: {
        from: 'categories', localField: 'pd.category', foreignField: '_id', as: 'cat',
        pipeline: [{ $project: { name: 1 } }],
      }},
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:     { $ifNull: ['$cat.name', 'Uncategorised'] },
        revenue: { $sum: '$items.total' },
        qty:     { $sum: '$items.quantity' },
        orders:  { $addToSet: '$_id' },
      }},
      { $project: {
        _id: 0, name: '$_id', revenue: 1, qty: 1,
        orders: { $size: '$orders' },
      }},
      { $sort: { revenue: -1 } },
      { $limit: 12 },
    ]),
  ])

  const totals       = aggregate[0] || {}
  const totalRevenue = totals.totalRevenue || 0
  const totalOrders  = totals.totalOrders  || 0
  const totalItemsSold = topProducts.reduce((s, p) => s + p.qty, 0)

  return success(res, {
    totalRevenue,
    totalOrders,
    avgOrderValue:  totalOrders ? Math.round(totalRevenue / totalOrders) : 0,
    totalItemsSold,
    totalDiscount:  totals.totalDiscount || 0,
    trend,
    topProducts,
    byPaymentMethod,
    byCategory,
  })
}

// ── Purchase Report ───────────────────────────────────────────────────────────
exports.getPurchaseReport = async (req, res) => {
  const { from, to }            = parseDateRange(req.query)
  const { supplier, category }  = req.query
  const matchBase               = { purchaseDate: { $gte: from, $lte: to } }
  if (supplier) matchBase.supplier = new mongoose.Types.ObjectId(supplier)

  if (category) {
    const pIds = (await Product.find({ category: new mongoose.Types.ObjectId(category) }).select('_id').lean()).map(p => p._id)
    if (!pIds.length) return success(res, {
      totalSpent: 0, totalOrders: 0, avgOrderValue: 0,
      receivedOrders: 0, pendingOrders: 0,
      trend: [], topSuppliers: [], byPaymentStatus: [], byStatus: [],
    })
    matchBase['items.product'] = { $in: pIds }
  }

  const [aggregate, trend, topSuppliers, byPayStatus, byStatus] = await Promise.all([
    Purchase.aggregate([
      { $match: matchBase },
      { $group: {
        _id:            null,
        totalSpent:     { $sum: '$grandTotal' },
        totalOrders:    { $sum: 1 },
        received:       { $sum: { $cond: [{ $eq: ['$status', 'received'] }, 1, 0] } },
        pending:        { $sum: { $cond: [{ $eq: ['$status', 'ordered']  }, 1, 0] } },
      }},
    ]),

    Purchase.aggregate([
      { $match: { ...matchBase, status: 'received' } },
      { $group: {
        _id:    { $dateToString: { format: '%Y-%m-%d', date: '$purchaseDate' } },
        amount: { $sum: '$grandTotal' },
        count:  { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', amount: 1, count: 1 } },
    ]),

    Purchase.aggregate([
      { $match: matchBase },
      { $group: { _id: '$supplier', amount: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'sup' } },
      { $unwind: { path: '$sup', preserveNullAndEmptyArrays: true } },
      { $sort: { amount: -1 } },
      { $limit: 8 },
      { $project: { _id: 0, name: { $ifNull: ['$sup.name', 'Unknown'] }, amount: 1, count: 1 } },
    ]),

    Purchase.aggregate([
      { $match: matchBase },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 }, amount: { $sum: '$grandTotal' } } },
      { $project: { _id: 0, status: '$_id', count: 1, amount: 1 } },
    ]),

    Purchase.aggregate([
      { $match: matchBase },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$grandTotal' } } },
      { $project: { _id: 0, status: '$_id', count: 1, amount: 1 } },
    ]),
  ])

  const totals = aggregate[0] || {}

  return success(res, {
    totalSpent:      totals.totalSpent   || 0,
    totalOrders:     totals.totalOrders  || 0,
    avgOrderValue:   totals.totalOrders
      ? Math.round((totals.totalSpent || 0) / totals.totalOrders) : 0,
    receivedOrders:  totals.received     || 0,
    pendingOrders:   totals.pending      || 0,
    trend,
    topSuppliers,
    byPaymentStatus: byPayStatus,
    byStatus,
  })
}

// ── Inventory Report ──────────────────────────────────────────────────────────
exports.getInventoryReport = async (req, res) => {
  const { from, to }            = parseDateRange(req.query)
  const { category, supplier }  = req.query
  const pFilter                 = { isActive: true }
  if (category) pFilter.category = new mongoose.Types.ObjectId(category)
  if (supplier) pFilter.supplier = new mongoose.Types.ObjectId(supplier)

  const [aggregate, byCategory, lowStock, bySupplier, movementSummary, cogsAgg] = await Promise.all([
    // ── Snapshot totals
    Product.aggregate([
      { $match: pFilter },
      { $group: {
        _id:        null,
        total:      { $sum: 1 },
        totalValue: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } },
        outOfStock: { $sum: { $cond: [{ $lte: ['$currentStock', 0] }, 1, 0] } },
        critical:   { $sum: { $cond: [{
          $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderLevel'] }]
        }, 1, 0] } },
        // Guard maxStock > 0: default maxStock=0 makes 0*0.9=0, which
        // would flag every product with any stock as overstock.
        overstock:  { $sum: { $cond: [{
          $and: [
            { $gt: ['$maxStock', 0] },
            { $gte: ['$currentStock', { $multiply: ['$maxStock', 0.9] }] },
          ]
        }, 1, 0] } },
      }},
    ]),

    // ── Value by category
    Product.aggregate([
      { $match: pFilter },
      { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:   '$cat.name',
        value: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } },
        count: { $sum: 1 },
      }},
      { $sort: { value: -1 } },
      { $project: { _id: 0, name: { $ifNull: ['$_id', 'Uncategorised'] }, value: 1, count: 1 } },
    ]),

    // ── Low / out-of-stock products
    Product.aggregate([
      { $match: { ...pFilter, $expr: { $lte: ['$currentStock', '$reorderLevel'] } } },
      { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'cat' } },
      { $lookup: { from: 'suppliers',  localField: 'supplier',  foreignField: '_id', as: 'sup' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$sup', preserveNullAndEmptyArrays: true } },
      { $sort: { currentStock: 1 } },
      { $limit: 30 },
      { $project: {
        name: 1, sku: 1, currentStock: 1, reorderLevel: 1, unit: 1, buyingPrice: 1,
        image: 1, imageUrl: 1,
        category: '$cat.name', supplier: '$sup.name',
        stockValue: { $multiply: ['$currentStock', '$buyingPrice'] },
      }},
    ]),

    // ── Value by supplier
    Product.aggregate([
      { $match: pFilter },
      { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: 'sup' } },
      { $unwind: { path: '$sup', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:   '$sup.name',
        value: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } },
        count: { $sum: 1 },
      }},
      { $sort: { value: -1 } },
      { $limit: 8 },
      { $project: { _id: 0, name: { $ifNull: ['$_id', 'No Supplier'] }, value: 1, count: 1 } },
    ]),

    // ── Stock movement summary for the selected period
    StockMovement.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: {
        _id:        '$type',
        count:      { $sum: 1 },
        totalUnits: { $sum: { $abs: '$quantity' } },
      }},
      { $project: { _id: 0, type: '$_id', count: 1, totalUnits: 1 } },
    ]),

    // ── COGS for the period (used for turnover calc)
    // Prefer items.buyingPrice (snapshotted at sale time) for accuracy.
    // Fall back to pd.buyingPrice for sales recorded before the snapshot
    // was introduced, then to 0 for deleted products.
    Sale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to }, status: 'completed' } },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { buyingPrice: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:  null,
        cogs: { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.buyingPrice', { $ifNull: ['$pd.buyingPrice', 0] }] }] } },
      }},
    ]),
  ])

  const totals        = aggregate[0] || {}
  const totalProducts = totals.total      || 0
  const totalValue    = totals.totalValue || 0
  const outOfStock    = totals.outOfStock || 0
  const critical      = totals.critical   || 0
  const overstock     = totals.overstock  || 0
  const healthy       = Math.max(0, totalProducts - outOfStock - critical - overstock)

  // Inventory turnover = COGS / avg-inventory-value
  const cogs          = cogsAgg[0]?.cogs || 0
  const turnover      = totalValue > 0 ? +(cogs / totalValue).toFixed(2) : null

  return success(res, {
    totalProducts, totalValue, outOfStock, critical, overstock, healthy,
    byCategory, bySupplier, lowStockProducts: lowStock,
    movementSummary, cogs, inventoryTurnover: turnover,
  })
}

// ── Supplier Report ───────────────────────────────────────────────────────────
exports.getSupplierReport = async (req, res) => {
  const { supplier }  = req.query
  const { from, to }  = parseDateRange(req.query)
  const filter        = supplier ? { _id: new mongoose.Types.ObjectId(supplier) } : {}

  const rows = await Supplier.aggregate([
    { $match: filter },
    { $lookup: {
      from: 'purchases', let: { sid: '$_id' },
      pipeline: [
        { $match: { $expr: { $and: [
          { $eq: ['$supplier', '$$sid'] },
          { $gte: ['$purchaseDate', from] },
          { $lte: ['$purchaseDate', to] },
        ]}}},
      ],
      as: 'orders',
    }},
    { $lookup: {
      from: 'products', localField: '_id', foreignField: 'supplier', as: 'products',
      pipeline: [{ $project: { currentStock: 1, buyingPrice: 1 } }],
    }},
    { $addFields: {
      totalOrders:    { $size: '$orders' },
      totalSpend:     { $sum: '$orders.grandTotal' },
      receivedOrders: { $size: { $filter: { input: '$orders', cond: { $eq: ['$$this.status', 'received'] } } } },
      pendingOrders:  { $size: { $filter: { input: '$orders', cond: { $eq: ['$$this.status', 'ordered']  } } } },
      productCount:   { $size: '$products' },
      inventoryValue: { $sum: { $map: {
        input: '$products', as: 'p',
        in: { $multiply: ['$$p.currentStock', '$$p.buyingPrice'] },
      }}},
      // Avg delivery time in days (for orders where deliveryDate is set)
      avgDeliveryDays: {
        $let: {
          vars: {
            withDelivery: {
              $filter: {
                input: '$orders',
                cond: { $and: ['$$this.deliveryDate', { $eq: ['$$this.status', 'received'] }] },
              },
            },
          },
          in: {
            $cond: [
              { $gt: [{ $size: '$$withDelivery' }, 0] },
              {
                $divide: [
                  { $sum: { $map: { input: '$$withDelivery', as: 'o',
                    in: { $divide: [
                      { $subtract: ['$$o.deliveryDate', '$$o.purchaseDate'] },
                      86400000,
                    ]},
                  }}},
                  { $size: '$$withDelivery' },
                ],
              },
              null,
            ],
          },
        },
      },
    }},
    { $project: {
      _id: 1, name: 1, contactPerson: 1, phone: 1, email: 1, district: 1,
      leadTimeDays: 1, paymentTerms: 1, status: 1, rating: 1,
      totalOrders: 1, totalSpend: 1, pendingOrders: 1, receivedOrders: 1,
      productCount: 1, inventoryValue: 1, avgDeliveryDays: 1,
    }},
    { $sort: { totalSpend: -1 } },
  ])

  // Backend summary so frontend doesn't need to calc
  const totalSpend    = rows.reduce((s, r) => s + (r.totalSpend   || 0), 0)
  const activeCount   = rows.filter(r => r.status === 'active').length
  const avgLeadTime   = rows.length
    ? +(rows.reduce((s, r) => s + (r.leadTimeDays || 0), 0) / rows.length).toFixed(1)
    : 0

  return success(res, {
    suppliers: rows,
    total:     rows.length,
    summary: { totalSpend, activeCount, avgLeadTime },
  })
}

// ── Profit Report ─────────────────────────────────────────────────────────────
exports.getProfitReport = async (req, res) => {
  const { from, to }            = parseDateRange(req.query)
  const { category, supplier }  = req.query
  const matchBase               = { saleDate: { $gte: from, $lte: to }, status: 'completed' }

  if (category || supplier) {
    const pf = { isActive: true }
    if (category) pf.category = new mongoose.Types.ObjectId(category)
    if (supplier) pf.supplier = new mongoose.Types.ObjectId(supplier)
    const pIds = (await Product.find(pf).select('_id').lean()).map(p => p._id)
    if (!pIds.length) return success(res, {
      revenue: 0, cogs: 0, profit: 0, margin: 0, trend: [], topMarginProducts: [],
    })
    matchBase['items.product'] = { $in: pIds }
  }

  const [aggregate, trend, topByMargin] = await Promise.all([
    Sale.aggregate([
      { $match: matchBase },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { buyingPrice: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:     null,
        revenue: { $sum: '$items.total' },
        cogs:    { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.buyingPrice', { $ifNull: ['$pd.buyingPrice', 0] }] }] } },
      }},
    ]),

    Sale.aggregate([
      { $match: matchBase },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { buyingPrice: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:     { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        revenue: { $sum: '$items.total' },
        cogs:    { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.buyingPrice', { $ifNull: ['$pd.buyingPrice', 0] }] }] } },
      }},
      { $sort: { _id: 1 } },
      { $project: {
        _id: 0, date: '$_id', revenue: 1, cogs: 1,
        profit: { $subtract: ['$revenue', '$cogs'] },
      }},
    ]),

    Sale.aggregate([
      { $match: matchBase },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { buyingPrice: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:     '$items.productName',
        revenue: { $sum: '$items.total' },
        cogs:    { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.buyingPrice', { $ifNull: ['$pd.buyingPrice', 0] }] }] } },
        qty:     { $sum: '$items.quantity' },
      }},
      { $addFields: {
        profit: { $subtract: ['$revenue', '$cogs'] },
        margin: { $cond: [
          { $gt: ['$revenue', 0] },
          { $multiply: [{ $divide: [{ $subtract: ['$revenue', '$cogs'] }, '$revenue'] }, 100] },
          0,
        ]},
      }},
      { $sort: { margin: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, name: '$_id', revenue: 1, cogs: 1, profit: 1, margin: 1, qty: 1 } },
    ]),
  ])

  const totals = aggregate[0] || { revenue: 0, cogs: 0 }
  const profit = totals.revenue - totals.cogs
  const margin = totals.revenue > 0 ? +((profit / totals.revenue) * 100).toFixed(2) : 0

  return success(res, {
    revenue: totals.revenue, cogs: totals.cogs, profit, margin,
    trend, topMarginProducts: topByMargin,
  })
}

// ── Executive Report ──────────────────────────────────────────────────────────
exports.getExecutiveReport = async (req, res) => {
  const { from, to } = parseDateRange(req.query)
  const periodMs     = to - from
  const prevFrom     = new Date(from - periodMs)
  const prevTo       = new Date(from - 1)

  const [
    salesCurr, salesPrev, purchCurr, purchPrev,
    invAgg, topProducts, topSuppliers, profitCurr, profitPrev,
  ] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: from,     $lte: to     }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: prevFrom, $lte: prevTo  }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { purchaseDate: { $gte: from,     $lte: to     } } },
      { $group: { _id: null, spent: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { purchaseDate: { $gte: prevFrom, $lte: prevTo  } } },
      { $group: { _id: null, spent: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: {
        _id: null,
        totalProducts:  { $sum: 1 },
        inventoryValue: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } },
        outOfStock:     { $sum: { $cond: [{ $lte: ['$currentStock', 0] }, 1, 0] } },
        lowStock:       { $sum: { $cond: [{
          $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderLevel'] }]
        }, 1, 0] } },
      }},
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.productName', revenue: { $sum: '$items.total' }, qty: { $sum: '$items.quantity' },
      }},
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: '$_id', revenue: 1, qty: 1 } },
    ]),
    Purchase.aggregate([
      { $match: { purchaseDate: { $gte: from, $lte: to } } },
      { $group: { _id: '$supplier', amount: { $sum: '$grandTotal' } } },
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'sup' } },
      { $unwind: { path: '$sup', preserveNullAndEmptyArrays: true } },
      { $sort: { amount: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: { $ifNull: ['$sup.name', 'Unknown'] }, amount: 1 } },
    ]),
    // Profit for current period
    Sale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to }, status: 'completed' } },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { buyingPrice: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:     null,
        revenue: { $sum: '$items.total' },
        cogs:    { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.buyingPrice', { $ifNull: ['$pd.buyingPrice', 0] }] }] } },
      }},
    ]),
    // Profit for previous period
    Sale.aggregate([
      { $match: { saleDate: { $gte: prevFrom, $lte: prevTo }, status: 'completed' } },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { buyingPrice: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:     null,
        revenue: { $sum: '$items.total' },
        cogs:    { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.buyingPrice', { $ifNull: ['$pd.buyingPrice', 0] }] }] } },
      }},
    ]),
  ])

  const sc  = salesCurr[0] || { revenue: 0, orders: 0 }
  const sp  = salesPrev[0] || { revenue: 0, orders: 0 }
  const pc  = purchCurr[0] || { spent:   0, orders: 0 }
  const pp  = purchPrev[0] || { spent:   0, orders: 0 }
  const inv = invAgg[0]    || { totalProducts: 0, inventoryValue: 0, outOfStock: 0, lowStock: 0 }

  const prc   = profitCurr[0] || { revenue: 0, cogs: 0 }
  const prp   = profitPrev[0] || { revenue: 0, cogs: 0 }
  const profit     = prc.revenue - prc.cogs
  const profitPrevVal = prp.revenue - prp.cogs
  const margin     = prc.revenue > 0 ? +((profit / prc.revenue) * 100).toFixed(2) : 0
  const profitGrowth = profitPrevVal > 0
    ? +((profit - profitPrevVal) / profitPrevVal * 100).toFixed(1) : null

  return success(res, {
    revenue:        sc.revenue,
    orders:         sc.orders,
    revenueGrowth:  sp.revenue > 0 ? +((sc.revenue - sp.revenue) / sp.revenue * 100).toFixed(1) : null,
    spend:          pc.spent,
    spendGrowth:    pp.spent > 0   ? +((pc.spent   - pp.spent)   / pp.spent   * 100).toFixed(1) : null,
    profit,
    profitGrowth,
    margin,
    inventoryValue: inv.inventoryValue,
    totalProducts:  inv.totalProducts,
    outOfStock:     inv.outOfStock,
    lowStock:       inv.lowStock,
    topProducts,
    topSuppliers,
  })
}

// ── Forecast Report ───────────────────────────────────────────────────────────
exports.getForecastReport = async (req, res) => {
  let Prediction = null
  try { Prediction = require('../models/Prediction') } catch {}

  const { category, supplier } = req.query
  const predFilter = { status: 'ready' }

  if (category || supplier) {
    const pf = { isActive: true }
    if (category) pf.category = new mongoose.Types.ObjectId(category)
    if (supplier) pf.supplier = new mongoose.Types.ObjectId(supplier)
    const pIds = (await Product.find(pf).select('_id').lean()).map(p => p._id)
    predFilter.product = { $in: pIds }
  }

  // Pull ML model accuracy from Python AI service collection
  const mlColl = rawColl('mlModels')
  const [predictions, summary, mlModelDocs] = await Promise.all([
    Prediction
      ? Prediction.find(predFilter)
          .populate('product', 'name sku currentStock reorderLevel unit')
          .sort({ inventoryRisk: 1, suggestedPurchase: -1 })
          .limit(50).lean()
      : Promise.resolve([]),
    Prediction
      ? Prediction.aggregate([
          { $match: predFilter },
          { $group: {
            _id:               null,
            total:             { $sum: 1 },
            avgConfidence:     { $avg: '$confidenceScore' },
            highRisk:          { $sum: { $cond: [{ $eq: ['$inventoryRisk', 'high']   }, 1, 0] } },
            mediumRisk:        { $sum: { $cond: [{ $eq: ['$inventoryRisk', 'medium'] }, 1, 0] } },
            lowRisk:           { $sum: { $cond: [{ $eq: ['$inventoryRisk', 'low']    }, 1, 0] } },
            totalSuggestedBuy: { $sum: '$suggestedPurchase' },
            withHistory:       { $sum: { $cond: ['$hasHistoricalData', 1, 0] } },
            avgMape:           { $avg: '$metrics.mape' },
          }},
        ])
      : Promise.resolve([]),
    mlColl
      ? mlColl.aggregate([
          { $group: {
            _id:       '$model_name',
            avg_mape:  { $avg: '$mape'  },
            avg_mae:   { $avg: '$mae'   },
            avg_rmse:  { $avg: '$rmse'  },
            avg_wape:  { $avg: '$wape'  },
            sku_count: { $sum: 1 },
          }},
          { $sort: { avg_mape: 1 } },
        ]).toArray()
      : Promise.resolve([]),
  ])

  const s = summary[0] || {}

  // Build per-model accuracy table from ML service data
  const modelAccuracy = mlModelDocs.map(m => ({
    model:     m._id,
    avg_mape:  m.avg_mape  != null ? +m.avg_mape.toFixed(2)  : null,
    avg_mae:   m.avg_mae   != null ? +m.avg_mae.toFixed(2)   : null,
    avg_rmse:  m.avg_rmse  != null ? +m.avg_rmse.toFixed(2)  : null,
    avg_wape:  m.avg_wape  != null ? +m.avg_wape.toFixed(2)  : null,
    sku_count: m.sku_count || 0,
  }))

  return success(res, {
    predictions,
    hasAiData:  predictions.length > 0,
    hasMlData:  modelAccuracy.length > 0,
    modelAccuracy,
    summary: {
      total:             s.total             || 0,
      avgConfidence:     s.avgConfidence     ? +s.avgConfidence.toFixed(1) : null,
      highRisk:          s.highRisk          || 0,
      mediumRisk:        s.mediumRisk        || 0,
      lowRisk:           s.lowRisk           || 0,
      totalSuggestedBuy: s.totalSuggestedBuy || 0,
      withHistory:       s.withHistory       || 0,
      avgMape:           s.avgMape           ? +s.avgMape.toFixed(2) : null,
    },
    riskDistribution: [
      { name: 'High Risk',   value: s.highRisk   || 0, color: '#EF4444' },
      { name: 'Medium Risk', value: s.mediumRisk || 0, color: '#F59E0B' },
      { name: 'Low Risk',    value: s.lowRisk    || 0, color: '#10B981' },
    ].filter(r => r.value > 0),
  })
}

// ── Low Stock Report ──────────────────────────────────────────────────────────
exports.getLowStockReport = async (req, res) => {
  const { category, supplier } = req.query
  const pFilter = { isActive: true, $expr: { $lte: ['$currentStock', '$reorderLevel'] } }
  if (category) pFilter.category = new mongoose.Types.ObjectId(category)
  if (supplier) pFilter.supplier = new mongoose.Types.ObjectId(supplier)

  let Prediction = null
  try { Prediction = require('../models/Prediction') } catch {}

  const products = await Product.find(pFilter)
    .populate('category', 'name')
    .populate('supplier', 'name phone leadTimeDays')
    .sort({ currentStock: 1 })
    .limit(100).lean()

  const predMap = {}
  if (Prediction && products.length) {
    const preds = await Prediction.find({
      product: { $in: products.map(p => p._id) }, status: 'ready',
    })
      .select('product suggestedPurchase safetyStock reorderPoint daysOfStock inventoryRisk confidenceScore')
      .lean()
    preds.forEach(p => { predMap[p.product.toString()] = p })
  }

  const rows = products.map(p => {
    const pred     = predMap[p._id.toString()]
    const shortage = Math.max(0, (p.reorderLevel || 0) - (p.currentStock || 0))
    const status   = p.currentStock <= 0 ? 'out_of_stock'
      : p.currentStock <= p.reorderLevel * 0.5 ? 'critical' : 'low'
    const suggested = pred?.suggestedPurchase ?? shortage * 2
    return {
      _id: p._id, name: p.name, sku: p.sku,
      category: p.category?.name || '—',
      supplier: p.supplier?.name || '—',
      supplierPhone: p.supplier?.phone || '—',
      currentStock: p.currentStock, reorderLevel: p.reorderLevel, shortage, unit: p.unit,
      buyingPrice: p.buyingPrice,
      stockValue: p.currentStock * p.buyingPrice,
      suggestedPurchase: suggested,
      estimatedCost: suggested * p.buyingPrice,
      daysOfStock: pred?.daysOfStock ?? null,
      inventoryRisk: pred?.inventoryRisk ?? (status === 'out_of_stock' ? 'high' : 'medium'),
      confidence: pred?.confidenceScore ?? null,
      leadTimeDays: p.supplier?.leadTimeDays ?? p.leadTimeDays ?? 7,
      status, isAiEnhanced: !!pred,
    }
  })

  return success(res, {
    products: rows,
    summary: {
      total:            rows.length,
      outOfStock:       rows.filter(r => r.status === 'out_of_stock').length,
      critical:         rows.filter(r => r.status === 'critical').length,
      low:              rows.filter(r => r.status === 'low').length,
      totalReorderCost: rows.reduce((s, r) => s + (r.estimatedCost || 0), 0),
    },
  })
}

// ── Inventory Aging ───────────────────────────────────────────────────────────
exports.getInventoryAgingReport = async (req, res) => {
  const { from }               = parseDateRange(req.query)
  const { category, supplier } = req.query
  const pFilter                = { isActive: true, currentStock: { $gt: 0 } }
  if (category) pFilter.category = new mongoose.Types.ObjectId(category)
  if (supplier) pFilter.supplier = new mongoose.Types.ObjectId(supplier)

  const products = await Product.find(pFilter)
    .populate('category', 'name')
    .populate('supplier', 'name')
    .lean()

  if (!products.length) return success(res, { products: [], buckets: {}, totalValue: 0, bucketChart: [] })

  const pIds     = products.map(p => p._id)
  const lastSales = await Sale.aggregate([
    { $match: { 'items.product': { $in: pIds }, status: 'completed' } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: pIds } } },
    { $group: { _id: '$items.product', lastSaleDate: { $max: '$saleDate' } } },
  ])

  const saleMap = {}
  lastSales.forEach(s => { saleMap[s._id.toString()] = s.lastSaleDate })

  const now = Date.now()
  const aged = products.map(p => {
    const lastSaleDate  = saleMap[p._id.toString()] || null
    const daysSinceSale = lastSaleDate
      ? Math.floor((now - new Date(lastSaleDate)) / 86400000) : null

    return {
      _id: p._id, name: p.name, sku: p.sku,
      category: p.category?.name || '—', supplier: p.supplier?.name || '—',
      currentStock: p.currentStock, unit: p.unit,
      buyingPrice: p.buyingPrice,
      stockValue: p.currentStock * p.buyingPrice,
      lastSaleDate, daysSinceSale,
      agingBucket: !lastSaleDate ? 'Never Sold'
        : daysSinceSale > 180 ? '180+ days'
        : daysSinceSale > 90  ? '90–180 days'
        : daysSinceSale > 60  ? '60–90 days'
        : '30–60 days',
    }
  })
    .filter(p => !p.lastSaleDate || new Date(p.lastSaleDate) < from)
    .sort((a, b) => (b.daysSinceSale ?? 9999) - (a.daysSinceSale ?? 9999))

  const bucketOrder = ['Never Sold', '180+ days', '90–180 days', '60–90 days', '30–60 days']
  const buckets     = {}
  bucketOrder.forEach(b => { buckets[b] = { count: 0, value: 0 } })
  aged.forEach(p => {
    buckets[p.agingBucket] = buckets[p.agingBucket] || { count: 0, value: 0 }
    buckets[p.agingBucket].count++
    buckets[p.agingBucket].value += p.stockValue
  })

  return success(res, {
    products:    aged.slice(0, 100),
    buckets,
    totalValue:  aged.reduce((s, p) => s + p.stockValue, 0),
    bucketChart: bucketOrder
      .filter(b => buckets[b]?.count > 0)
      .map(b => ({ name: b, count: buckets[b].count, value: buckets[b].value })),
  })
}
