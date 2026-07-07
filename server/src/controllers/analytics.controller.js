'use strict'
const mongoose = require('mongoose')
const Sale     = require('../models/Sale')
const Product  = require('../models/Product')
const Alert    = require('../models/Alert')
const Supplier = require('../models/Supplier')
const { success } = require('../utils/response')

// ── helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (n - 1))
  return d
}

function monthsAgo(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  d.setDate(1); d.setHours(0, 0, 0, 0)
  return d
}

// Access raw MongoDB collections written by the Python AI service
function rawColl(name) {
  return mongoose.connection.db ? mongoose.connection.db.collection(name) : null
}

// Stock status expression reused across multiple aggregations
const STOCK_STATUS_EXPR = {
  $switch: {
    branches: [
      { case: { $lte: ['$currentStock', 0] },
        then: 'out_of_stock' },
      { case: { $lte: ['$currentStock', '$minStock'] },
        then: 'critical' },
      { case: { $lte: ['$currentStock', '$reorderLevel'] },
        then: 'low' },
      { case: { $and: [
        { $gt:  ['$maxStock', 0] },
        { $gte: ['$currentStock', { $multiply: ['$maxStock', 0.9] }] },
      ]}, then: 'overstock' },
    ],
    default: 'healthy',
  },
}

// Stockout risk (0–1): 1 when stock = 0, scales linearly to 0 at reorderLevel
const STOCKOUT_RISK_EXPR = {
  $cond: [
    { $lte: ['$currentStock', 0] },
    1,
    {
      $max: [
        0,
        {
          $cond: [
            { $gt: ['$reorderLevel', 0] },
            {
              $divide: [
                { $subtract: ['$reorderLevel', '$currentStock'] },
                '$reorderLevel',
              ],
            },
            0,
          ],
        },
      ],
    },
  ],
}

// Nepal festival calendar (Gregorian approximations for peak days)
const FESTIVAL_DATES = [
  { year: 2022, name: 'Dashain 2022', type: 'dashain', peak: new Date('2022-10-05'), window: 14 },
  { year: 2022, name: 'Tihar 2022',   type: 'tihar',   peak: new Date('2022-10-26'), window:  7 },
  { year: 2023, name: 'Dashain 2023', type: 'dashain', peak: new Date('2023-10-23'), window: 14 },
  { year: 2023, name: 'Tihar 2023',   type: 'tihar',   peak: new Date('2023-11-13'), window:  7 },
  { year: 2024, name: 'Dashain 2024', type: 'dashain', peak: new Date('2024-10-13'), window: 14 },
  { year: 2024, name: 'Tihar 2024',   type: 'tihar',   peak: new Date('2024-11-01'), window:  7 },
  { year: 2025, name: 'Dashain 2025', type: 'dashain', peak: new Date('2025-10-02'), window: 14 },
  { year: 2025, name: 'Tihar 2025',   type: 'tihar',   peak: new Date('2025-10-21'), window:  7 },
  { year: 2026, name: 'Dashain 2026', type: 'dashain', peak: new Date('2026-10-21'), window: 14 },
  { year: 2026, name: 'Tihar 2026',   type: 'tihar',   peak: new Date('2026-11-09'), window:  7 },
]

function festivalWindow(f) {
  const start = new Date(f.peak); start.setDate(start.getDate() - f.window)
  const end   = new Date(f.peak); end.setDate(end.getDate() + f.window)
  return { start, end }
}

function gradeFromScore(score) {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

exports.getDashboardSummary = async (req, res) => {
  const days     = Math.max(1, parseInt(req.query.days || 30))
  const from     = daysAgo(days)
  const from7    = daysAgo(7)
  const prevFrom = new Date(from - days * 86400000)
  const prevTo   = new Date(from - 1)

  const [curr, curr7, prev, alerts, stockCounts] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: from }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: from7 }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' } } },
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: prevFrom, $lte: prevTo }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Alert.countDocuments({ isRead: false }),
    Product.aggregate([
      { $match: { isActive: true } },
      { $addFields: { stockStatus: STOCK_STATUS_EXPR } },
      { $group: { _id: '$stockStatus', count: { $sum: 1 } } },
    ]),
  ])

  const c = curr[0]  || { revenue: 0, count: 0 }
  const w = curr7[0] || { revenue: 0 }
  const p = prev[0]  || { revenue: 0, count: 0 }
  const revenueGrowthPct = p.revenue > 0
    ? +((c.revenue - p.revenue) / p.revenue * 100).toFixed(1) : null

  const stock_status = { healthy: 0, low: 0, critical: 0, out_of_stock: 0, overstock: 0 }
  stockCounts.forEach(r => { if (r._id in stock_status) stock_status[r._id] = r.count })

  return success(res, {
    revenue_30d:            c.revenue,
    revenue_7d:             w.revenue,
    total_transactions_30d: c.count,
    avg_order_value_30d:    c.count > 0 ? +(c.revenue / c.count).toFixed(2) : 0,
    unread_alerts:          alerts,
    revenue_growth_pct:     revenueGrowthPct,
    stock_status,
  })
}

exports.getRevenueTrend = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 30))
  const from = daysAgo(days)

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $group: {
      _id:     { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
      revenue: { $sum: '$grandTotal' },
      orders:  { $sum: 1 },
    }},
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', revenue: 1, orders: 1 } },
  ])
  return success(res, rows)
}

exports.getRevenueBreakdown = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 30))
  const from = daysAgo(days)

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
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
      _id:   { $ifNull: ['$cat.name', 'Uncategorised'] },
      value: { $sum: '$items.total' },
    }},
    { $sort: { value: -1 } },
    { $limit: 10 },
    { $project: { _id: 0, name: '$_id', value: 1 } },
  ])
  return success(res, rows)
}

exports.getDashboardTopProducts = async (req, res) => {
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || 10)))
  const by    = req.query.by === 'quantity' ? 'total_qty' : 'total_revenue'
  const days  = Math.max(1, parseInt(req.query.days || 30))
  const from  = daysAgo(days)

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $unwind: '$items' },
    { $group: {
      _id:           '$items.product',
      total_revenue: { $sum: '$items.total' },
      total_qty:     { $sum: '$items.quantity' },
      product_name:  { $first: '$items.productName' },
    }},
    { $sort: { [by]: -1 } },
    { $limit: limit },
    { $lookup: {
      from: 'products', localField: '_id', foreignField: '_id', as: '_p',
      pipeline: [{ $project: { name: 1, sku: 1 } }],
    }},
    { $unwind: { path: '$_p', preserveNullAndEmptyArrays: true } },
    { $project: {
      _id: 0,
      sku_id:   '$_id',
      name:     { $ifNull: ['$_p.name', { $ifNull: ['$product_name', 'Unknown'] }] },
      sku:      { $ifNull: ['$_p.sku', ''] },
      revenue:  '$total_revenue',
      quantity: '$total_qty',
    }},
  ])
  return success(res, rows)
}

exports.getStockHealth = async (req, res) => {
  const rows = await Product.aggregate([
    { $match: { isActive: true } },
    { $addFields: { stockStatus: STOCK_STATUS_EXPR } },
    { $group: { _id: '$stockStatus', value: { $sum: 1 } } },
    { $project: { _id: 0, name: '$_id', value: 1 } },
  ])
  return success(res, rows)
}

exports.getMonthlyTrend = async (req, res) => {
  const months = Math.max(1, Math.min(24, parseInt(req.query.months || 12)))
  const from   = monthsAgo(months)

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $unwind: '$items' },
    { $group: {
      _id:      { $dateToString: { format: '%Y-%m', date: '$saleDate' } },
      revenue:  { $sum: '$items.total' },
      quantity: { $sum: '$items.quantity' },
    }},
    { $sort: { _id: 1 } },
    { $project: { _id: 0, label: '$_id', revenue: 1, quantity: 1 } },
  ])
  return success(res, rows)
}

exports.getSalesHeatmap = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 90))
  const from = daysAgo(days)

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $group: {
      _id: {
        day_of_week: { $dayOfWeek: '$saleDate' },
        hour:        { $hour: '$saleDate' },
      },
      orders: { $sum: 1 },
    }},
    { $project: {
      _id: 0,
      // MongoDB $dayOfWeek: 1=Sun…7=Sat → convert to 1=Mon…7=Sun
      day_of_week: {
        $subtract: [{ $mod: [{ $add: ['$_id.day_of_week', 5] }, 7] }, -1],
      },
      hour:   '$_id.hour',
      orders: 1,
    }},
    { $sort: { day_of_week: 1, hour: 1 } },
  ])
  return success(res, rows)
}

// ── Inventory ─────────────────────────────────────────────────────────────────

exports.getInventorySummary = async (req, res) => {
  const from30 = daysAgo(30)

  const [baseStat, salesRates] = await Promise.all([
    Product.aggregate([
      { $match: { isActive: true } },
      { $addFields: {
        inv_value:     { $multiply: ['$currentStock', '$buyingPrice'] },
        stockout_risk: STOCKOUT_RISK_EXPR,
      }},
      { $group: {
        _id: null,
        total_inventory_units:    { $sum: '$currentStock' },
        total_inventory_value:    { $sum: '$inv_value' },
        high_stockout_risk_items: { $sum: { $cond: [{ $gte: ['$stockout_risk', 0.5] }, 1, 0] } },
        zero_stock_items:         { $sum: { $cond: [{ $lte:  ['$currentStock',   0] }, 1, 0] } },
      }},
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: from30 }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: {
        _id:       '$items.product',
        total_qty: { $sum: '$items.quantity' },
      }},
    ]),
  ])

  let avgDoS = null
  if (salesRates.length > 0) {
    const ids = salesRates.map(r => r._id)
    const stocks = await Product.aggregate([
      { $match: { _id: { $in: ids }, isActive: true } },
      { $project: { currentStock: 1 } },
    ])
    const stockMap = {}
    stocks.forEach(s => { stockMap[String(s._id)] = s.currentStock })

    const dosArr = salesRates
      .map(r => {
        const stock     = stockMap[String(r._id)] ?? 0
        const dailyRate = r.total_qty / 30
        return dailyRate > 0 ? Math.min(365, stock / dailyRate) : (stock > 0 ? 365 : 0)
      })
      .filter(v => v > 0)

    if (dosArr.length > 0)
      avgDoS = Math.round(dosArr.reduce((a, b) => a + b, 0) / dosArr.length)
  }

  const base = baseStat[0] || {
    total_inventory_units: 0, total_inventory_value: 0,
    high_stockout_risk_items: 0, zero_stock_items: 0,
  }

  return success(res, { ...base, avg_days_of_supply: avgDoS })
}

exports.getInventoryStatusBreakdown = async (req, res) => {
  const rows = await Product.aggregate([
    { $match: { isActive: true } },
    { $addFields: { s: STOCK_STATUS_EXPR } },
    { $group: { _id: '$s', value: { $sum: 1 } } },
    { $project: { _id: 0, name: '$_id', value: 1 } },
  ])

  const ORDER  = ['healthy', 'low', 'critical', 'out_of_stock', 'overstock']
  const map    = {}
  rows.forEach(r => { map[r.name] = r.value })

  const result = ORDER.map(s => ({ name: s, value: map[s] || 0 })).filter(r => r.value > 0)
  return success(res, result)
}

exports.getCategoryStock = async (req, res) => {
  const rows = await Product.aggregate([
    { $match: { isActive: true } },
    { $lookup: {
      from: 'categories', localField: 'category', foreignField: '_id', as: 'cat',
      pipeline: [{ $project: { name: 1 } }],
    }},
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $group: {
      _id:         { $ifNull: ['$cat.name', 'Uncategorised'] },
      total_value: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } },
      total_units: { $sum: '$currentStock' },
    }},
    { $sort: { total_value: -1 } },
    { $project: { _id: 0, name: '$_id', total_value: 1, total_units: 1 } },
  ])
  return success(res, rows)
}

exports.getRiskScatter = async (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || 200)))

  const products = await Product.aggregate([
    { $match: { isActive: true } },
    { $lookup: {
      from: 'categories', localField: 'category', foreignField: '_id', as: 'cat',
      pipeline: [{ $project: { name: 1 } }],
    }},
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $addFields: { stockStatus: STOCK_STATUS_EXPR } },
    { $limit: limit },
    { $project: {
      _id: 0,
      name:     1,
      category: '$cat.name',
      status:   '$stockStatus',
      x: {
        $cond: [
          { $lte: ['$currentStock', 0] },
          1,
          { $min: [1, { $divide: ['$reorderLevel', { $max: ['$currentStock', 1] }] }] },
        ],
      },
      y: {
        $cond: [
          { $lte: ['$maxStock', 0] },
          0,
          { $min: [1, { $max: [0, { $divide: [
            { $subtract: ['$currentStock', { $multiply: ['$maxStock', 0.9] }] },
            { $max: ['$maxStock', 1] },
          ]}]}] },
        ],
      },
    }},
  ])
  return success(res, products)
}

exports.getInventoryTurnover = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 90))
  const from = daysAgo(days)

  const [cogs, inv] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: from }, status: 'completed' } },
      { $unwind: '$items' },
      { $lookup: {
        from: 'products', localField: 'items.product', foreignField: '_id', as: 'pd',
        pipeline: [{ $project: { buyingPrice: 1, category: 1 } }],
      }},
      { $unwind: { path: '$pd', preserveNullAndEmptyArrays: true } },
      { $lookup: {
        from: 'categories', localField: 'pd.category', foreignField: '_id', as: 'cat',
        pipeline: [{ $project: { name: 1 } }],
      }},
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:  { $ifNull: ['$cat.name', 'Uncategorised'] },
        cogs: { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$pd.buyingPrice', 0] }] } },
      }},
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      { $lookup: {
        from: 'categories', localField: 'category', foreignField: '_id', as: 'cat',
        pipeline: [{ $project: { name: 1 } }],
      }},
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:       { $ifNull: ['$cat.name', 'Uncategorised'] },
        inv_value: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } },
      }},
    ]),
  ])

  const invMap = {}
  inv.forEach(r => { invMap[r._id] = r.inv_value })
  const factor = 365 / days

  const rows = cogs
    .map(r => ({
      name:          r._id,
      turnover_rate: invMap[r._id] > 0
        ? +((r.cogs * factor) / invMap[r._id]).toFixed(2)
        : 0,
    }))
    .filter(r => r.turnover_rate > 0)
    .sort((a, b) => b.turnover_rate - a.turnover_rate)
    .slice(0, 10)

  return success(res, rows)
}

exports.getLowStockItems = async (req, res) => {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || 30)))
  const from30 = daysAgo(30)

  const [products, salesRates] = await Promise.all([
    Product.aggregate([
      {
        $match: {
          isActive: true,
          $or: [
            { currentStock: { $lte: 0 } },
            { $expr: { $lte: ['$currentStock', '$reorderLevel'] } },
          ],
        },
      },
      { $lookup: {
        from: 'categories', localField: 'category', foreignField: '_id', as: 'cat',
        pipeline: [{ $project: { name: 1 } }],
      }},
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $addFields: {
        stockStatus:   STOCK_STATUS_EXPR,
        stockout_risk: STOCKOUT_RISK_EXPR,
        safety_stock:  '$minStock',
        reorder_point: '$reorderLevel',
        recommended_order_qty: {
          $cond: [
            { $gt: ['$maxStock', 0] },
            { $max: [0, { $subtract: ['$maxStock', '$currentStock'] }] },
            { $multiply: ['$reorderLevel', 3] },
          ],
        },
      }},
      { $sort: { stockout_risk: -1, currentStock: 1 } },
      { $limit: limit },
      { $project: {
        _id:                  0,
        sku_id:               '$_id',
        name:                 1,
        category:             '$cat.name',
        status:               '$stockStatus',
        current_stock:        '$currentStock',
        reorder_point:        '$reorderLevel',
        safety_stock:         '$minStock',
        recommended_order_qty: 1,
        stockout_risk:        1,
        lead_time_days:       '$leadTimeDays',
      }},
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: from30 }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', total_qty: { $sum: '$items.quantity' } } },
    ]),
  ])

  const rateMap = {}
  salesRates.forEach(r => { rateMap[String(r._id)] = r.total_qty / 30 })

  const enriched = products.map(p => ({
    ...p,
    days_of_supply: rateMap[String(p.sku_id)] > 0
      ? Math.round(p.current_stock / rateMap[String(p.sku_id)])
      : (p.current_stock > 0 ? 365 : 0),
  }))

  return success(res, enriched)
}

// ── Forecast ──────────────────────────────────────────────────────────────────

exports.getForecastAccuracy = async (req, res) => {
  const coll = rawColl('mlModels')
  if (!coll) return success(res, [])

  const raw = await coll.aggregate([
    { $match: { 'meta.mape': { $exists: true, $gt: 0 } } },
    { $group: {
      _id:      '$model_name',
      avg_mape: { $avg: '$meta.mape'     },
      avg_mae:  { $avg: '$meta.mae'      },
      avg_rmse: { $avg: '$meta.rmse'     },
      avg_wape: { $avg: '$meta.wape'     },
      sku_count:{ $sum: 1 },
    }},
    { $sort: { avg_mape: 1 } },
  ]).toArray()

  const DISPLAY = { prophet: 'Prophet', rf: 'Random Forest', lstm: 'LSTM', xgboost: 'XGBoost' }
  const rows = raw.map(r => ({
    model:        r._id,
    display_name: DISPLAY[r._id] || r._id,
    avg_mape:     r.avg_mape  != null ? +r.avg_mape.toFixed(2)  : null,
    avg_mae:      r.avg_mae   != null ? +r.avg_mae.toFixed(2)   : null,
    avg_rmse:     r.avg_rmse  != null ? +r.avg_rmse.toFixed(2)  : null,
    avg_wape:     r.avg_wape  != null ? +r.avg_wape.toFixed(2)  : null,
    sku_coverage: r.sku_count,
  }))

  return success(res, rows)
}

exports.getModelCoverage = async (req, res) => {
  const coll = rawColl('mlModels')
  const totalSkus = await Product.countDocuments({ isActive: true })

  if (!coll) {
    return success(res, {
      chart_data:  [{ name: 'No Model', value: totalSkus }],
      total_skus:  totalSkus,
      covered_skus: 0,
    })
  }

  const models   = ['prophet', 'rf', 'lstm', 'xgboost']
  const DISPLAY  = { prophet: 'Prophet', rf: 'Random Forest', lstm: 'LSTM', xgboost: 'XGBoost' }

  const counts = await coll.aggregate([
    { $match: { model_name: { $in: models } } },
    { $group: {
      _id:   '$model_name',
      count: { $sum: 1 },
    }},
  ]).toArray()

  const countMap = {}
  counts.forEach(c => { countMap[c._id] = c.count })

  // SKUs covered by at least one model
  const coveredSkuIds = await coll.distinct('sku_id')
  const coveredCount  = coveredSkuIds.length
  const uncovered     = Math.max(0, totalSkus - coveredCount)

  const chart_data = models
    .filter(m => countMap[m])
    .map(m => ({ name: DISPLAY[m], value: countMap[m] }))
  if (uncovered > 0) chart_data.push({ name: 'No Model', value: uncovered })

  return success(res, { chart_data, total_skus: totalSkus, covered_skus: coveredCount })
}

exports.getDemandVsActual = async (req, res) => {
  const skuId = req.query.sku_id
  const days  = Math.max(1, parseInt(req.query.days || 30))
  const from  = daysAgo(days)

  if (!skuId) return success(res, { series: [], model_used: null })

  // Resolve skuId to an ObjectId if possible
  let productId
  try { productId = new mongoose.Types.ObjectId(skuId) } catch { productId = null }
  if (!productId) return success(res, { series: [], model_used: null })

  // Actual daily sales for this product
  const actualRows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $unwind: '$items' },
    { $match: { 'items.product': productId } },
    { $group: {
      _id:      { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
      actual:   { $sum: '$items.quantity' },
    }},
    { $sort: { _id: 1 } },
  ])

  const actualMap = {}
  actualRows.forEach(r => { actualMap[r._id] = r.actual })

  // Stored forecast (try mlForecasts collection)
  const fcColl = rawColl('mlForecasts')
  let forecastMap = {}
  let modelUsed   = null

  if (fcColl) {
    // Pick the best available model (preference order)
    for (const modelName of ['prophet', 'rf', 'lstm']) {
      const fc = await fcColl.findOne(
        { sku_id: skuId, model: modelName },
        { sort: { forecast_date: -1 } }
      )
      if (fc?.forecasts?.length) {
        modelUsed = modelName
        fc.forecasts.forEach(f => {
          const dateStr = new Date(f.date).toISOString().slice(0, 10)
          forecastMap[dateStr] = Math.max(0, f.value ?? f.demand ?? 0)
        })
        break
      }
    }
  }

  // Build merged series over the requested date range
  const series = []
  for (let i = 0; i < days; i++) {
    const d   = new Date(); d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    if (key in actualMap || key in forecastMap) {
      series.push({
        date:     key,
        actual:   actualMap[key]   ?? 0,
        forecast: forecastMap[key] ?? null,
      })
    }
  }

  const MODEL_DISPLAY = { prophet: 'Prophet', rf: 'Random Forest', lstm: 'LSTM' }
  return success(res, {
    series,
    model_used: modelUsed ? (MODEL_DISPLAY[modelUsed] || modelUsed) : null,
  })
}

exports.getDemandByCategory = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 30))
  const from = daysAgo(days)

  const fcColl = rawColl('mlForecasts')
  if (!fcColl) return success(res, [])

  // Get all forecasts generated after `from`
  const forecasts = await fcColl.find({
    forecast_date: { $gte: from },
  }, { projection: { sku_id: 1, model: 1, forecasts: 1 } }).toArray()

  if (!forecasts.length) return success(res, [])

  // Build sku_id → model → total_qty map
  const skuModelQty = {}
  for (const fc of forecasts) {
    if (!fc.forecasts?.length) continue
    const totalQty = fc.forecasts.reduce((s, f) => s + Math.max(0, f.value ?? f.demand ?? 0), 0)
    const key = String(fc.sku_id)
    if (!skuModelQty[key]) skuModelQty[key] = {}
    skuModelQty[key][fc.model] = (skuModelQty[key][fc.model] || 0) + totalQty
  }

  // Resolve sku_id → category
  const skuIds = Object.keys(skuModelQty)
  const objectIds = skuIds.map(id => { try { return new mongoose.Types.ObjectId(id) } catch { return null } }).filter(Boolean)

  const products = await Product.aggregate([
    { $match: { _id: { $in: objectIds }, isActive: true } },
    { $lookup: {
      from: 'categories', localField: 'category', foreignField: '_id', as: 'cat',
      pipeline: [{ $project: { name: 1 } }],
    }},
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $project: { category: { $ifNull: ['$cat.name', 'Uncategorised'] } } },
  ])

  const catMap = {}
  products.forEach(p => { catMap[String(p._id)] = p.category })

  // Aggregate by category
  const catData = {}
  for (const [skuId, modelQtys] of Object.entries(skuModelQty)) {
    const cat = catMap[skuId] || 'Uncategorised'
    if (!catData[cat]) catData[cat] = { prophet: 0, rf: 0, lstm: 0 }
    for (const [model, qty] of Object.entries(modelQtys)) {
      if (model in catData[cat]) catData[cat][model] += qty
    }
  }

  const rows = Object.entries(catData)
    .map(([name, m]) => ({
      name,
      prophet: Math.round(m.prophet),
      rf:      Math.round(m.rf),
      lstm:    Math.round(m.lstm),
    }))
    .sort((a, b) => (b.prophet + b.rf + b.lstm) - (a.prophet + a.rf + a.lstm))

  return success(res, rows)
}

exports.getDemandHeatmap = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 90))
  const from = daysAgo(days)

  // Sales quantity heatmap: category × day-of-week
  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
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
      _id: {
        category:    { $ifNull: ['$cat.name', 'Uncategorised'] },
        day_of_week: { $dayOfWeek: '$saleDate' },
      },
      total_qty: { $sum: '$items.quantity' },
    }},
    { $project: {
      _id: 0,
      category:    '$_id.category',
      day_of_week: {
        $subtract: [{ $mod: [{ $add: ['$_id.day_of_week', 5] }, 7] }, -1],
      },
      total_qty: 1,
    }},
    { $sort: { category: 1, day_of_week: 1 } },
  ])
  return success(res, rows)
}

// ── Product ───────────────────────────────────────────────────────────────────

exports.getCategoryPerformance = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 30))
  const from = daysAgo(days)

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
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
      _id:          { $ifNull: ['$cat.name', 'Uncategorised'] },
      revenue:      { $sum: '$items.total' },
      transactions: { $addToSet: '$_id' },
    }},
    { $project: {
      _id: 0, name: '$_id', revenue: 1,
      transactions: { $size: '$transactions' },
    }},
    { $sort: { revenue: -1 } },
  ])

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const data = rows.map(r => ({
    ...r,
    avg_order_value: r.transactions > 0 ? +(r.revenue / r.transactions).toFixed(2) : 0,
    revenue_pct:     totalRevenue > 0 ? +((r.revenue / totalRevenue) * 100).toFixed(2) : 0,
  }))
  return success(res, data)
}

exports.getVelocityRanking = async (req, res) => {
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || 15)))
  const days  = Math.max(1, parseInt(req.query.days || 30))
  const from  = daysAgo(days)

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $unwind: '$items' },
    { $group: {
      _id:          '$items.product',
      total_qty:    { $sum: '$items.quantity' },
      product_name: { $first: '$items.productName' },
    }},
    { $sort: { total_qty: -1 } },
    { $limit: limit },
    { $lookup: {
      from: 'products', localField: '_id', foreignField: '_id', as: '_p',
      pipeline: [{ $project: { name: 1 } }],
    }},
    { $unwind: { path: '$_p', preserveNullAndEmptyArrays: true } },
    { $project: {
      _id: 0,
      sku_id: '$_id',
      name:   { $ifNull: ['$_p.name', { $ifNull: ['$product_name', 'Unknown'] }] },
      velocity_per_day: { $round: [{ $divide: ['$total_qty', days] }, 2] },
    }},
  ])
  return success(res, rows)
}

exports.getPeriodComparison = async (req, res) => {
  const days     = Math.max(1, parseInt(req.query.days || 30))
  const from     = daysAgo(days)
  const prevFrom = new Date(from - days * 86400000)
  const prevTo   = new Date(from - 1)

  const categoryPipeline = (matchStage) => [
    { $match: matchStage },
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
    }},
  ]

  const [curr, prev] = await Promise.all([
    Sale.aggregate(categoryPipeline({ saleDate: { $gte: from },              status: 'completed' })),
    Sale.aggregate(categoryPipeline({ saleDate: { $gte: prevFrom, $lte: prevTo }, status: 'completed' })),
  ])

  const prevMap = {}
  prev.forEach(r => { prevMap[r._id] = r.revenue })
  const currMap = {}
  curr.forEach(r => { currMap[r._id] = r.revenue })

  const allCats = [...new Set([...Object.keys(currMap), ...Object.keys(prevMap)])]
  const rows    = allCats
    .map(name => ({
      name,
      current_revenue:  currMap[name]  || 0,
      previous_revenue: prevMap[name]  || 0,
    }))
    .sort((a, b) => b.current_revenue - a.current_revenue)
    .slice(0, 10)

  return success(res, rows)
}

exports.getPriceTrends = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 90))
  const from = monthsAgo(Math.ceil(days / 30))

  const rows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $unwind: '$items' },
    { $match: { 'items.unitPrice': { $gt: 0 } } },
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
      _id: {
        label:    { $dateToString: { format: '%Y-%m', date: '$saleDate' } },
        category: { $ifNull: ['$cat.name', 'Uncategorised'] },
      },
      avg_price: { $avg: '$items.unitPrice' },
    }},
    { $sort: { '_id.label': 1 } },
  ])

  // Pivot: [{label, Cat1: avgPrice, Cat2: avgPrice, ...}]
  const months   = [...new Set(rows.map(r => r._id.label))].sort()
  const categories = [...new Set(rows.map(r => r._id.category))]

  const lookup = {}
  rows.forEach(r => {
    const k = `${r._id.label}::${r._id.category}`
    lookup[k] = +r.avg_price.toFixed(2)
  })

  const pivot = months.map(m => {
    const obj = { label: m }
    categories.forEach(c => { obj[c] = lookup[`${m}::${c}`] ?? null })
    return obj
  })

  return success(res, { pivot, categories })
}

exports.getSkuTrend = async (req, res) => {
  const skuId = req.query.sku_id
  const days  = Math.max(1, parseInt(req.query.days || 90))
  const from  = daysAgo(days)

  if (!skuId) return success(res, { series: [], product_name: null })

  let productId
  try { productId = new mongoose.Types.ObjectId(skuId) } catch { productId = null }
  if (!productId) return success(res, { series: [], product_name: null })

  const [rows, product] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: from }, status: 'completed' } },
      { $unwind: '$items' },
      { $match: { 'items.product': productId } },
      { $group: {
        _id:      { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        revenue:  { $sum: '$items.total' },
        quantity: { $sum: '$items.quantity' },
      }},
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', revenue: 1, quantity: 1 } },
    ]),
    Product.findById(productId).select('name').lean(),
  ])

  return success(res, { series: rows, product_name: product?.name || null })
}

// ── Advanced ──────────────────────────────────────────────────────────────────

exports.getAdvancedForecastComparison = async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days || 30))
  const from = daysAgo(days)

  // Actual daily sales aggregated across all products
  const actualRows = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $unwind: '$items' },
    { $group: {
      _id:    { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
      actual: { $sum: '$items.quantity' },
    }},
    { $sort: { _id: 1 } },
  ])

  const actualMap = {}
  let totalActualQty = 0
  actualRows.forEach(r => { actualMap[r._id] = r.actual; totalActualQty += r.actual })

  // ML forecasts aggregated per day per model
  const fcColl    = rawColl('mlForecasts')
  const modelDays = { prophet: {}, rf: {}, lstm: {} }

  if (fcColl) {
    const forecasts = await fcColl.find({
      forecast_date: { $gte: from },
      model:         { $in: ['prophet', 'rf', 'lstm'] },
    }, { projection: { model: 1, forecasts: 1 } }).toArray()

    for (const fc of forecasts) {
      if (!fc.forecasts?.length) continue
      const m = fc.model
      if (!(m in modelDays)) continue
      for (const f of fc.forecasts) {
        const key = new Date(f.date).toISOString().slice(0, 10)
        modelDays[m][key] = (modelDays[m][key] || 0) + Math.max(0, f.value ?? f.demand ?? 0)
      }
    }
  }

  // Build date range
  const allDates = new Set([...Object.keys(actualMap)])
  for (const m of Object.values(modelDays)) Object.keys(m).forEach(d => allDates.add(d))
  const sortedDates = [...allDates].sort()

  const daily_comparison = sortedDates.map(date => ({
    date,
    actual:  Math.round(actualMap[date]              || 0),
    prophet: Math.round(modelDays.prophet[date]      || 0),
    rf:      Math.round(modelDays.rf[date]           || 0),
    lstm:    Math.round(modelDays.lstm[date]         || 0),
  }))

  // Compute MAPE per model vs actual (only on dates with actual sales)
  const computed_mape = {}
  for (const [model, dmap] of Object.entries(modelDays)) {
    const pairs = sortedDates
      .filter(d => actualMap[d] > 0 && dmap[d] > 0)
      .map(d => ({ actual: actualMap[d], forecast: dmap[d] }))

    if (pairs.length > 0) {
      const mape = pairs.reduce((sum, p) =>
        sum + Math.abs(p.actual - p.forecast) / Math.max(p.actual, 1e-8), 0) / pairs.length * 100
      computed_mape[model] = +mape.toFixed(2)
    }
  }

  // Get stored accuracy metrics from mlModels
  const fcAccColl = rawColl('mlModels')
  const model_accuracy = []
  if (fcAccColl) {
    const raw = await fcAccColl.aggregate([
      { $match: { 'meta.mape': { $exists: true, $gt: 0 } } },
      { $group: {
        _id:       '$model_name',
        avg_mape:  { $avg: '$meta.mape'  },
        avg_mae:   { $avg: '$meta.mae'   },
        avg_rmse:  { $avg: '$meta.rmse'  },
        avg_wape:  { $avg: '$meta.wape'  },
        sku_count: { $sum: 1 },
      }},
      { $sort: { avg_mape: 1 } },
    ]).toArray()

    const DISPLAY = { prophet: 'Prophet', rf: 'Random Forest', lstm: 'LSTM' }
    raw.forEach(r => {
      if (['prophet', 'rf', 'lstm'].includes(r._id)) {
        model_accuracy.push({
          model:        r._id,
          display_name: DISPLAY[r._id] || r._id,
          avg_mape:     r.avg_mape  != null ? +r.avg_mape.toFixed(2)  : 0,
          avg_mae:      r.avg_mae   != null ? +r.avg_mae.toFixed(2)   : 0,
          avg_rmse:     r.avg_rmse  != null ? +r.avg_rmse.toFixed(2)  : 0,
          avg_wape:     r.avg_wape  != null ? +r.avg_wape.toFixed(2)  : 0,
          sku_coverage: r.sku_count,
        })
      }
    })
  }

  const best_model = model_accuracy.length > 0 ? model_accuracy[0].model : null

  return success(res, {
    daily_comparison,
    model_accuracy,
    best_model,
    total_actual_qty: totalActualQty,
    computed_mape,
  })
}

exports.getInventoryHealth = async (req, res) => {
  const from30 = daysAgo(30)

  const [products, salesData] = await Promise.all([
    Product.aggregate([
      { $match: { isActive: true } },
      { $lookup: {
        from: 'categories', localField: 'category', foreignField: '_id', as: 'cat',
        pipeline: [{ $project: { name: 1 } }],
      }},
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $project: {
        name:          1,
        category:      { $ifNull: ['$cat.name', 'Uncategorised'] },
        currentStock:  1,
        minStock:      1,
        reorderLevel:  1,
        maxStock:      1,
        leadTimeDays:  1,
        buyingPrice:   1,
      }},
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: from30 }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: {
        _id:       '$items.product',
        total_qty: { $sum: '$items.quantity' },
        count:     { $sum: 1 },
      }},
    ]),
  ])

  const salesMap = {}
  salesData.forEach(s => { salesMap[String(s._id)] = s })

  const items = products.map(p => {
    const sid      = String(p._id)
    const sale     = salesMap[sid]
    const dailyAvg = sale ? sale.total_qty / 30 : 0
    const stock    = p.currentStock
    const rop      = p.reorderLevel || 0
    const min      = p.minStock     || 0
    const max      = p.maxStock     || 0

    // Stockout risk
    const stockout_risk = stock <= 0 ? 1
      : rop > 0 ? Math.max(0, Math.min(1, (rop - stock) / rop))
      : 0

    // Stock adequacy: 0 if out/critical, scales to 1 at 2×reorderLevel
    const ideal    = max > 0 ? max * 0.6 : rop * 2 || 50
    const adequacy = stock <= 0 ? 0
      : stock <= min ? 0.1
      : stock <= rop ? 0.4
      : max > 0 && stock >= max * 0.9 ? 0.5
      : Math.min(1, stock / ideal)

    // Demand stability: coefficient of variation proxy (0 = unstable, 1 = stable)
    // If no sales: moderate stability (0.6), if sales exist use sale frequency
    const demand_stability = !sale ? 0.6
      : sale.count >= 15 ? 0.85
      : sale.count >= 7  ? 0.7
      : 0.55

    // Days of supply
    const dos = dailyAvg > 0 ? Math.min(365, Math.round(stock / dailyAvg)) : (stock > 0 ? 365 : 0)

    // Overstock penalty (0 = fine, 1 = extreme overstock)
    const overstock = max > 0 && stock > max ? Math.min(1, (stock - max) / max) : 0

    // Composite health score (0–100)
    const raw_score = (
      0.35 * adequacy +
      0.30 * (1 - stockout_risk) +
      0.20 * demand_stability +
      0.15 * (1 - overstock)
    )
    const health_score = Math.round(raw_score * 100)
    const grade        = gradeFromScore(health_score)

    // Stock status
    const stock_status = stock <= 0 ? 'out_of_stock'
      : stock <= min ? 'critical'
      : stock <= rop ? 'low'
      : max > 0 && stock >= max * 0.9 ? 'overstock'
      : 'healthy'

    return {
      sku_id:           sid,
      name:             p.name,
      category:         p.category,
      health_score,
      grade,
      stock_status,
      days_of_supply:   dos,
      stockout_risk_pct: Math.round(stockout_risk * 100),
      components: {
        stock_adequacy:   +adequacy.toFixed(3),
        demand_stability: +demand_stability.toFixed(3),
        overstock_ratio:  +overstock.toFixed(3),
      },
    }
  }).sort((a, b) => a.health_score - b.health_score)

  // Portfolio metrics
  const total_skus       = items.length
  const portfolio_score  = total_skus > 0
    ? Math.round(items.reduce((s, i) => s + i.health_score, 0) / total_skus) : 0
  const portfolio_grade  = gradeFromScore(portfolio_score)

  const grade_distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  items.forEach(i => { grade_distribution[i.grade]++ })

  // Category health averages
  const catScores = {}
  items.forEach(i => {
    if (!catScores[i.category]) catScores[i.category] = { sum: 0, count: 0 }
    catScores[i.category].sum   += i.health_score
    catScores[i.category].count++
  })
  const category_health = Object.entries(catScores)
    .map(([category, v]) => ({ category, avg_score: Math.round(v.sum / v.count) }))
    .sort((a, b) => a.avg_score - b.avg_score)

  return success(res, {
    portfolio_score,
    portfolio_grade,
    total_skus,
    grade_distribution,
    category_health,
    items: items.slice(0, 50),  // worst 50 items
  })
}

exports.getSupplierPerformance = async (req, res) => {
  const from30 = daysAgo(30)

  const [suppliers, products, salesRates] = await Promise.all([
    Supplier.find({ status: 'active' }).lean(),
    Product.aggregate([
      { $match: { isActive: true, supplier: { $ne: null } } },
      { $addFields: {
        stockStatus:   STOCK_STATUS_EXPR,
        stockout_risk: STOCKOUT_RISK_EXPR,
      }},
      { $project: {
        supplier:      1,
        name:          1,
        stockStatus:   1,
        stockout_risk: 1,
        currentStock:  1,
        reorderLevel:  1,
        buyingPrice:   1,
        leadTimeDays:  1,
      }},
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: from30 }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', total_qty: { $sum: '$items.quantity' } } },
    ]),
  ])

  const rateMap = {}
  salesRates.forEach(r => { rateMap[String(r._id)] = r.total_qty / 30 })

  // Group products by supplier
  const supMap = {}
  for (const sup of suppliers) {
    supMap[String(sup._id)] = {
      id:           String(sup._id),
      name:         sup.name,
      lead_time_days: sup.leadTimeDays || 7,
      products:     [],
    }
  }

  for (const p of products) {
    const sid = String(p.supplier)
    if (supMap[sid]) {
      const dailyRate  = rateMap[String(p._id)] || 0
      const dos        = dailyRate > 0 ? Math.min(365, p.currentStock / dailyRate) : (p.currentStock > 0 ? 365 : 0)
      supMap[sid].products.push({
        stockStatus:   p.stockStatus,
        stockout_risk: p.stockout_risk,
        dos,
      })
    }
  }

  const result = []
  for (const sup of Object.values(supMap)) {
    if (sup.products.length === 0) continue

    const sku_count       = sup.products.length
    const critical_items  = sup.products.filter(p => ['critical', 'out_of_stock'].includes(p.stockStatus)).length
    const avg_stockout    = sup.products.reduce((s, p) => s + p.stockout_risk, 0) / sku_count
    const avg_dos         = Math.round(sup.products.reduce((s, p) => s + p.dos, 0) / sku_count)

    // Reliability = proportion of healthy/low items (not critical/out)
    const bad_items      = sup.products.filter(p => ['critical', 'out_of_stock'].includes(p.stockStatus)).length
    const reliability    = 1 - bad_items / sku_count

    // Lead time factor (0=30d, 1=0d)
    const lead_factor    = Math.max(0, 1 - sup.lead_time_days / 30)

    // Performance score
    const perf_raw       = 0.50 * reliability + 0.30 * (1 - avg_stockout) + 0.20 * lead_factor
    const perf_score     = Math.round(perf_raw * 100)

    result.push({
      id:                 sup.id,
      name:               sup.name,
      sku_count,
      critical_items,
      avg_stockout_risk:  +avg_stockout.toFixed(3),
      avg_days_of_supply: avg_dos,
      lead_time_days:     sup.lead_time_days,
      reliability_score:  +reliability.toFixed(3),
      performance_score:  perf_score,
      performance_grade:  gradeFromScore(perf_score),
    })
  }

  result.sort((a, b) => b.performance_score - a.performance_score)

  const total_suppliers        = result.length
  const avg_reliability_score  = total_suppliers > 0
    ? result.reduce((s, r) => s + r.reliability_score, 0) / total_suppliers : 0
  const at_risk_count          = result.filter(r => ['D', 'F'].includes(r.performance_grade)).length
  const top_performer          = result[0]?.name || null

  return success(res, {
    suppliers: result,
    summary: {
      total_suppliers,
      avg_reliability_score: +avg_reliability_score.toFixed(3),
      at_risk_count,
      top_performer,
    },
  })
}

exports.getFestivalDemand = async (req, res) => {
  const days = Math.max(30, parseInt(req.query.days || 730))
  const from = daysAgo(days)
  const now  = new Date()

  // Festivals within analysis window
  const relevantFestivals = FESTIVAL_DATES.filter(f => {
    const { start, end } = festivalWindow(f)
    return end >= from
  })

  // Build festival day intervals as [{start, end, type, year}]
  const festIntervals = relevantFestivals.map(f => {
    const { start, end } = festivalWindow(f)
    return { start, end, type: f.type, year: f.year, name: f.name }
  })

  function isFestivalDate(date) {
    return festIntervals.some(fi => date >= fi.start && date <= fi.end)
  }

  // Aggregate daily sales in the analysis window
  const dailySales = await Sale.aggregate([
    { $match: { saleDate: { $gte: from }, status: 'completed' } },
    { $unwind: '$items' },
    { $group: {
      _id:    { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
      qty:    { $sum: '$items.quantity' },
    }},
    { $sort: { _id: 1 } },
  ])

  // Separate festival vs normal days
  let festDays = 0, festTotalQty = 0
  let normDays = 0, normTotalQty = 0

  const dailyMap = {}
  for (const row of dailySales) {
    const d = new Date(row._id)
    dailyMap[row._id] = row.qty
    if (isFestivalDate(d)) {
      festDays++; festTotalQty += row.qty
    } else {
      normDays++; normTotalQty += row.qty
    }
  }

  const avgFest = festDays > 0 ? Math.round(festTotalQty / festDays) : 0
  const avgNorm = normDays > 0 ? Math.round(normTotalQty / normDays) : 0
  const uplift  = avgNorm > 0 ? Math.round((avgFest - avgNorm) / avgNorm * 100) : 0

  // Upcoming festivals
  const upcoming = FESTIVAL_DATES
    .filter(f => f.peak > now)
    .map(f => {
      const { start, end } = festivalWindow(f)
      return {
        name:              f.name,
        festival_type:     f.type,
        peak_date:         f.peak.toISOString().slice(0, 10),
        start_date:        start.toISOString().slice(0, 10),
        end_date:          end.toISOString().slice(0, 10),
        days_until:        Math.ceil((f.peak - now) / 86400000),
        expected_uplift_pct: f.type === 'dashain' ? 35 : 20,
      }
    })
    .sort((a, b) => a.days_until - b.days_until)
    .slice(0, 4)

  // Historical Dashain spikes (per year)
  const historical_spikes = []
  const dashainFests = relevantFestivals.filter(f => f.type === 'dashain' && f.peak < now)

  for (const f of dashainFests) {
    const { start, end } = festivalWindow(f)
    let fyFest = 0, fyFestDays = 0, fyNorm = 0, fyNormDays = 0

    // Check 60 days around peak
    const checkFrom = new Date(f.peak); checkFrom.setDate(checkFrom.getDate() - 30)
    const checkTo   = new Date(f.peak); checkTo.setDate(checkTo.getDate()   + 30)

    for (const [dateStr, qty] of Object.entries(dailyMap)) {
      const d = new Date(dateStr)
      if (d < checkFrom || d > checkTo) continue
      if (d >= start && d <= end) { fyFest += qty; fyFestDays++ }
      else                        { fyNorm += qty; fyNormDays++ }
    }

    if (fyFestDays > 0) {
      historical_spikes.push({
        year:                     f.year,
        avg_daily_qty_festival:   Math.round(fyFest / fyFestDays),
        avg_daily_qty_normal:     fyNormDays > 0 ? Math.round(fyNorm / fyNormDays) : 0,
        uplift_pct:               fyNormDays > 0 && fyNorm > 0
          ? Math.round((fyFest / fyFestDays - fyNorm / fyNormDays) / (fyNorm / fyNormDays) * 100)
          : 0,
      })
    }
  }

  // Weekly demand (ISO week buckets)
  const weeklyMap = {}
  for (const [dateStr, qty] of Object.entries(dailyMap)) {
    const d    = new Date(dateStr)
    const dayN = (d.getDay() + 6) % 7  // Mon=0
    const mon  = new Date(d); mon.setDate(d.getDate() - dayN)
    const wk   = mon.toISOString().slice(0, 10)
    if (!weeklyMap[wk]) weeklyMap[wk] = { qty: 0, isFest: false }
    weeklyMap[wk].qty   += qty
    if (isFestivalDate(d)) weeklyMap[wk].isFest = true
  }

  const weekly_demand = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wk, v]) => ({
      label:             wk,
      total_qty:         v.qty,
      is_festival_week:  v.isFest,
    }))

  // Top festival-sensitive SKUs
  const festMatchStage = festIntervals.length > 0
    ? { status: 'completed', saleDate: { $gte: from }, $or: festIntervals.map(fi => ({ saleDate: { $gte: fi.start, $lte: fi.end } })) }
    : { status: 'completed', saleDate: { $gte: from }, _id: { $exists: false } }  // match nothing if no festivals

  const [festSales, normSales] = await Promise.all([
    Sale.aggregate([
      { $match: festMatchStage },
      { $unwind: '$items' },
      { $group: {
        _id:        '$items.product',
        fest_qty:   { $sum: '$items.quantity' },
        pname:      { $first: '$items.productName' },
      }},
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: from }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: {
        _id:      '$items.product',
        norm_qty: { $sum: '$items.quantity' },
      }},
    ]),
  ])

  const normMap = {}
  normSales.forEach(r => { normMap[String(r._id)] = r.norm_qty })

  // Total festival days in analysis window
  const totalFestDays = Math.max(festDays, 1)
  const totalNormDays = Math.max(normDays, 1)

  const skuUplift = festSales
    .map(r => {
      const sid           = String(r._id)
      const festAvgDaily  = r.fest_qty / totalFestDays
      const normTotalQty  = normMap[sid] || 0
      const normAvgDaily  = normTotalQty / totalNormDays
      const ratio         = normAvgDaily > 0 ? festAvgDaily / normAvgDaily : 0
      const uplift_pct    = normAvgDaily > 0 ? Math.round((ratio - 1) * 100) : 0
      return {
        sku_id:            sid,
        _pname:            r.pname,
        festival_avg_daily: +festAvgDaily.toFixed(2),
        normal_avg_daily:   +normAvgDaily.toFixed(2),
        festival_ratio:     +ratio.toFixed(2),
        uplift_pct,
        total_festival_qty: r.fest_qty,
      }
    })
    .filter(r => r.uplift_pct > 0)
    .sort((a, b) => b.uplift_pct - a.uplift_pct)
    .slice(0, 20)

  // Enrich with product name + category
  const pIds = skuUplift.map(r => { try { return new mongoose.Types.ObjectId(r.sku_id) } catch { return null } }).filter(Boolean)
  const pDocs = pIds.length
    ? await Product.aggregate([
        { $match: { _id: { $in: pIds } } },
        { $lookup: {
          from: 'categories', localField: 'category', foreignField: '_id', as: 'cat',
          pipeline: [{ $project: { name: 1 } }],
        }},
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        { $project: { name: 1, category: '$cat.name' } },
      ])
    : []

  const pMap = {}
  pDocs.forEach(p => { pMap[String(p._id)] = p })

  const top_festival_skus = skuUplift.map(r => {
    const p = pMap[r.sku_id] || {}
    return {
      sku_id:            r.sku_id,
      name:              p.name || r._pname || 'Unknown',
      category:          p.category || '—',
      uplift_pct:        r.uplift_pct,
      festival_avg_daily: r.festival_avg_daily,
      normal_avg_daily:  r.normal_avg_daily,
      festival_ratio:    r.festival_ratio,
      total_festival_qty: r.total_festival_qty,
    }
  })

  return success(res, {
    upcoming_festivals:   upcoming,
    historical_spikes:    historical_spikes.sort((a, b) => a.year - b.year),
    top_festival_skus,
    weekly_demand,
    festival_summary: {
      avg_daily_festival_qty: avgFest,
      avg_daily_normal_qty:   avgNorm,
      festival_uplift_pct:    uplift,
      festival_days_analyzed: festDays,
    },
  })
}
