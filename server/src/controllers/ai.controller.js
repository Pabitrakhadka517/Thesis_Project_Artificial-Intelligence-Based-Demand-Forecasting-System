const axios   = require('axios')
const Product    = require('../models/Product')
const Prediction = require('../models/Prediction')
const { success, error, paginated } = require('../utils/response')

const AI_BASE    = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || ''
const CACHE_TTL  = 6 * 60 * 60 * 1000   // 6 hours in ms
const AI_TIMEOUT = 120_000               // 2 min (Prophet can be slow)

// ── helpers ───────────────────────────────────────────────────────────────────

async function callAI(path, method = 'GET', data = null) {
  try {
    const res = await axios({ method, url: `${AI_BASE}${path}`, data, timeout: AI_TIMEOUT,
      headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': AI_SERVICE_API_KEY } })
    return { data: res.data, offline: false }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET'   || !err.response) {
      return { data: null, offline: true }
    }
    throw err
  }
}

function isFresh(prediction) {
  if (!prediction?.analyzedAt) return false
  return (Date.now() - new Date(prediction.analyzedAt).getTime()) < CACHE_TTL
}

function mapAIToSchema(d) {
  return {
    sku:                  d.sku,
    productName:          d.product_name,
    forecastDemand:       d.forecast_demand,
    dailyDemand:          d.daily_demand,
    demandTrend:          d.demand_trend,
    currentStock:         d.current_stock,
    safetyStock:          d.safety_stock,
    reorderPoint:         d.reorder_point,
    eoq:                  d.eoq,
    suggestedPurchase:    d.suggested_purchase,
    daysOfStock:          d.days_of_stock,
    leadTimeDays:         d.lead_time_days,
    buyingPrice:          d.buying_price,
    confidenceScore:      d.confidence_score,
    inventoryRisk:        d.inventory_risk,
    stockoutProbability:  d.stockout_probability,
    overstockProbability: d.overstock_probability,
    explanation:          d.explanation,
    predictionDate:       d.prediction_date,
    forecastData:         (d.forecast_data || []).map(p => ({
      date: p.date, demand: p.demand, lower: p.lower, upper: p.upper,
    })),
    metrics:              d.metrics || {},
    hasHistoricalData:    d.has_historical_data || false,
    horizonDays:          d.horizon_days || 30,
    status:               'ready',
    analyzedAt:           new Date(),
    error:                undefined,
  }
}

// ── check if AI is reachable ──────────────────────────────────────────────────
exports.getHealth = async (req, res) => {
  const { data, offline } = await callAI('/api/ai/health')
  return success(res, { online: !offline, ...(data || {}) })
}

// ── GET /ai/predictions — all products with cached predictions ────────────────
exports.getAllPredictions = async (req, res) => {
  const { search, risk, sort = 'risk', page = 1, limit = 50 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)

  // All active products
  const productQuery = { isActive: true }
  if (search) {
    const re = new RegExp(search, 'i')
    productQuery.$or = [{ name: re }, { sku: re }]
  }

  const [products, predictions] = await Promise.all([
    Product.find(productQuery).select('_id sku name currentStock reorderLevel leadTimeDays buyingPrice').lean(),
    Prediction.find({ status: 'ready' }).lean(),
  ])

  const predMap = {}
  predictions.forEach(p => { predMap[p.product.toString()] = p })

  let merged = products.map(p => {
    const pred = predMap[p._id.toString()]
    if (!pred) {
      return {
        _id: p._id.toString(), sku: p.sku, productName: p.name,
        currentStock: p.currentStock, reorderPoint: p.reorderLevel,
        leadTimeDays: p.leadTimeDays, buyingPrice: p.buyingPrice,
        status: 'not_analyzed', inventoryRisk: null, confidenceScore: null,
        suggestedPurchase: null, forecastDemand: null,
      }
    }
    return {
      ...pred,
      _id:  pred.product.toString(),
      status: 'ready',
    }
  })

  // Filter by risk
  if (risk && risk !== 'all') {
    merged = merged.filter(p => p.inventoryRisk === risk)
  }

  // Sort
  const sortFns = {
    risk: (a, b) => {
      const o = { high: 0, medium: 1, low: 2, null: 3 }
      return (o[a.inventoryRisk] ?? 3) - (o[b.inventoryRisk] ?? 3)
    },
    confidence:  (a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0),
    reorder:     (a, b) => (b.suggestedPurchase || 0) - (a.suggestedPurchase || 0),
    stockout:    (a, b) => (b.stockoutProbability || 0) - (a.stockoutProbability || 0),
    stock:       (a, b) => (a.daysOfStock || 999) - (b.daysOfStock || 999),
  }
  merged.sort(sortFns[sort] || sortFns.risk)

  const total  = merged.length
  const sliced = merged.slice(skip, skip + parseInt(limit))

  return res.json({
    success: true,
    data: sliced,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    meta: {
      analyzed:     predictions.length,
      not_analyzed: products.length - Object.keys(predMap).filter(k => products.some(p => p._id.toString() === k)).length,
    },
  })
}

// ── GET /ai/predictions/:productId — single prediction with auto-fetch ─────────
exports.getProductPrediction = async (req, res) => {
  const id = req.params.productId

  const product = await Product.findById(id).lean()
  if (!product) return error(res, 'Product not found', 404)

  const cached = await Prediction.findOne({ product: id }).lean()

  if (isFresh(cached) && cached.status === 'ready') {
    return success(res, { prediction: { ...cached, _id: cached._id.toString() }, fromCache: true, offline: false })
  }

  // Fetch from FastAPI
  const { data: aiData, offline } = await callAI('/api/ai/inventory/analyze', 'POST', {
    product_id:   id,
    horizon_days: 30,
  })

  if (offline) {
    if (cached?.status === 'ready') {
      return success(res, {
        prediction: { ...cached, _id: cached._id.toString() },
        fromCache: true, offline: true, stale: true,
        staleMessage: 'AI service offline — showing last cached prediction',
      })
    }
    return success(res, { prediction: null, offline: true,
      message: 'AI service offline and no cached prediction available' })
  }

  const updated = await Prediction.findOneAndUpdate(
    { product: id },
    { product: id, ...mapAIToSchema(aiData.data || aiData) },
    { upsert: true, new: true }
  ).lean()

  return success(res, { prediction: { ...updated, _id: updated._id.toString() }, fromCache: false, offline: false })
}

// ── POST /ai/predictions/:productId/refresh — force re-analyze ───────────────
exports.refreshProductPrediction = async (req, res) => {
  const id = req.params.productId

  const product = await Product.findById(id).lean()
  if (!product) return error(res, 'Product not found', 404)

  // Mark as pending
  await Prediction.findOneAndUpdate(
    { product: id },
    { product: id, status: 'pending', analyzedAt: new Date() },
    { upsert: true }
  )

  const { data: aiData, offline } = await callAI('/api/ai/inventory/analyze', 'POST', {
    product_id:   id,
    horizon_days: 30,
  })

  if (offline) {
    await Prediction.findOneAndUpdate({ product: id }, { status: 'failed', error: 'AI service offline' })
    return error(res, 'AI service is offline — cannot run fresh analysis', 503)
  }

  const updated = await Prediction.findOneAndUpdate(
    { product: id },
    { product: id, ...mapAIToSchema(aiData.data || aiData) },
    { upsert: true, new: true }
  ).lean()

  return success(res, { prediction: { ...updated, _id: updated._id.toString() }, offline: false })
}

// ── POST /ai/predictions/refresh-all — background bulk analysis ───────────────
exports.refreshAll = async (req, res) => {
  const products = await Product.find({ isActive: true }).select('_id sku name').lean()
  if (!products.length) return error(res, 'No active products found', 404)

  // Check AI is reachable first
  const { offline } = await callAI('/api/ai/health')
  if (offline) return error(res, 'AI service is offline — cannot start bulk analysis', 503)

  // Mark all as pending
  await Prediction.bulkWrite(products.map(p => ({
    updateOne: {
      filter: { product: p._id },
      update: { $set: { product: p._id, status: 'pending' } },
      upsert: true,
    },
  })))

  // Respond immediately, analyze in background
  res.json({ success: true, message: `Analysis queued for ${products.length} products`, total: products.length })

  // Background loop — non-blocking after response
  setImmediate(async () => {
    for (const p of products) {
      try {
        const { data: aiData, offline: isOff } = await callAI('/api/ai/inventory/analyze', 'POST', {
          product_id:   p._id.toString(),
          horizon_days: 30,
        })
        if (isOff) {
          await Prediction.updateMany({ status: 'pending' }, { status: 'failed', error: 'AI service went offline' })
          break
        }
        await Prediction.findOneAndUpdate(
          { product: p._id },
          { product: p._id, ...mapAIToSchema(aiData.data || aiData) },
          { upsert: true }
        )
      } catch (err) {
        await Prediction.findOneAndUpdate(
          { product: p._id },
          { status: 'failed', error: err.message }
        )
      }
    }
  })
}

// ── GET /ai/dashboard — dashboard aggregation ─────────────────────────────────
exports.getDashboard = async (req, res) => {
  const { data: aiData, offline } = await callAI('/api/ai/inventory/dashboard')

  if (offline) {
    // Compute locally from Mongoose cache
    const predictions = await Prediction.find({ status: 'ready' })
      .populate('product', 'name sku currentStock').lean()

    if (!predictions.length) {
      return success(res, {
        dashboard: null, offline: true, has_data: false,
        message: 'AI service offline and no cached predictions',
      })
    }

    const dash = buildLocalDashboard(predictions)
    return success(res, { ...dash, offline: true, stale: true })
  }

  return success(res, { ...(aiData.data || aiData), offline: false })
}

// ── GET /ai/predictions/status — how many analyzed vs total ───────────────────
exports.getStatus = async (req, res) => {
  const [total, analyzed, failed, pending] = await Promise.all([
    Product.countDocuments({ isActive: true }),
    Prediction.countDocuments({ status: 'ready' }),
    Prediction.countDocuments({ status: 'failed' }),
    Prediction.countDocuments({ status: 'pending' }),
  ])

  const { offline } = await callAI('/api/ai/health')

  return success(res, { total, analyzed, failed, pending, online: !offline })
}

// ── DELETE /ai/predictions/:productId — clear cache ───────────────────────────
exports.clearPrediction = async (req, res) => {
  await Prediction.deleteOne({ product: req.params.productId })
  return success(res, {}, 'Prediction cache cleared')
}

// ── local dashboard computation from Mongoose docs ───────────────────────────
function buildLocalDashboard(predictions) {
  const n        = predictions.length
  const reorder  = predictions.filter(p => (p.suggestedPurchase || 0) > 0)
  const atRisk   = predictions.filter(p => p.inventoryRisk === 'high')
  const healthy  = predictions.filter(p => p.inventoryRisk === 'low')
  const avgConf  = Math.round(predictions.reduce((s, p) => s + (p.confidenceScore || 0), 0) / n)
  const riskSc   = { low: 100, medium: 55, high: 0 }
  const health   = Math.round(predictions.reduce((s, p) => s + (riskSc[p.inventoryRisk] ?? 55), 0) / n)

  return {
    summary:          { total: n, needs_reorder: reorder.length, at_risk: atRisk.length, healthy: healthy.length },
    top_reorder:      [...reorder].sort((a, b) => (a.daysOfStock || 999) - (b.daysOfStock || 999)).slice(0, 10)
                        .map(p => ({ product_id: p.product?.toString(), product_name: p.productName || p.product?.name,
                          sku: p.sku, current_stock: p.currentStock, reorder_point: p.reorderPoint,
                          suggested_purchase: p.suggestedPurchase, days_of_stock: p.daysOfStock,
                          inventory_risk: p.inventoryRisk })),
    at_risk_products: atRisk.sort((a, b) => (b.stockoutProbability || 0) - (a.stockoutProbability || 0)).slice(0, 10)
                        .map(p => ({ product_id: p.product?.toString(), product_name: p.productName || p.product?.name,
                          sku: p.sku, stockout_probability: p.stockoutProbability,
                          days_of_stock: p.daysOfStock, inventory_risk: p.inventoryRisk })),
    demand_spikes:    predictions.filter(p => p.demandTrend === 'rising')
                        .sort((a, b) => (b.forecastDemand || 0) - (a.forecastDemand || 0)).slice(0, 5)
                        .map(p => ({ product_name: p.productName, forecast_demand: p.forecastDemand,
                          demand_trend: p.demandTrend, confidence_score: p.confidenceScore })),
    avg_confidence:   avgConf,
    health_score:     health,
    has_data:         true,
  }
}
