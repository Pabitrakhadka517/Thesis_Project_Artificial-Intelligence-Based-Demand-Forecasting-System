const router = require('express').Router()
const axios  = require('axios')
const mongoose = require('mongoose')
const Product = require('../models/Product')
const StockMovement = require('../models/StockMovement')
const Alert = require('../models/Alert')
const { protect } = require('../middleware/auth')
const { managerOrAdmin } = require('../middleware/authorize')
const { success, error, paginated } = require('../utils/response')

const AI_BASE = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || ''

router.use(protect)

// ── Proxy FastAPI enriched inventory (AI-powered view) ────────────────────────
router.get('/enriched', async (req, res) => {
  try {
    // Whitelist allowed proxy params to prevent parameter injection into the AI service
    const { page, limit, search, category, supplier, status } = req.query
    const params = {}
    if (page)     params.page     = page
    if (limit)    params.limit    = limit
    if (search)   params.search   = search
    if (category) params.category = category
    if (supplier) params.supplier = supplier
    if (status)   params.status   = status

    const response = await axios.get(`${AI_BASE}/inventory/enriched`, { params, timeout: 15000,
      headers: { 'X-Internal-Api-Key': AI_SERVICE_API_KEY } })
    return res.status(response.status).json(response.data)
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data)
    return res.status(503).json({ success: false, message: 'AI service is unavailable.' })
  }
})

// ── Stock movement history ────────────────────────────────────────────────────
router.get('/movements', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1)
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 30), 100) // Fix #21 cap
  const skip  = (page - 1) * limit
  const { product, type, search } = req.query
  const query = {}
  if (product) query.product = product
  if (type)    query.type    = type

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const matchingProducts = await Product.find({ name: regex }).select('_id')
    query.$or = [
      { product: { $in: matchingProducts.map(p => p._id) } },
      { notes: regex },
      { reference: regex },
    ]
  }

  const [moves, total] = await Promise.all([
    StockMovement.find(query)
      .populate('product', 'name sku unit')
      .populate('recordedBy', 'fullName')
      .sort({ date: -1 }).skip(skip).limit(limit),
    StockMovement.countDocuments(query),
  ])
  return paginated(res, { data: moves, total, page, limit })
})

// ── Manual stock adjustment per product ──────────────────────────────────────
//   POST /inventory/:productId/adjust
//   body: { type: 'addition'|'deduction'|'adjustment', quantity, reason, notes }
//
// Fix #5: previous implementation used findById → product.currentStock = X → save().
// That is a read-modify-write with no atomicity guarantee.  Two concurrent
// requests can both read the same stock value and then both write, silently
// losing one update.  We now use findOneAndUpdate with $inc / $set so the
// entire read-check-write is a single atomic server-side operation.
router.post('/:productId/adjust', managerOrAdmin, async (req, res) => {
  const { productId } = req.params
  const { type = 'adjustment', reason, notes } = req.body

  // Fix #21 (type-safety): coerce to number up front so `quantity + stock`
  // never degrades to string concatenation.
  const quantity = Number(req.body.quantity)

  if (!mongoose.Types.ObjectId.isValid(productId))
    return error(res, 'Invalid product ID', 400)
  if (!quantity || quantity <= 0 || !Number.isFinite(quantity))
    return error(res, 'Quantity must be a positive finite number', 400)
  if (!reason)
    return error(res, 'Reason is required', 400)

  let old   // document BEFORE the update (new: false)
  let delta // signed change applied to stock

  if (type === 'addition') {
    delta = quantity
    old = await Product.findByIdAndUpdate(
      productId,
      { $inc: { currentStock: delta } },
      { new: false }
    )
    if (!old) return error(res, 'Product not found', 404)

  } else if (type === 'deduction') {
    delta = -quantity
    // CAS: only succeed if currentStock >= quantity, preventing under-zero stock
    old = await Product.findOneAndUpdate(
      { _id: productId, currentStock: { $gte: quantity } },
      { $inc: { currentStock: delta } },
      { new: false }
    )
    if (!old) {
      // Distinguish 404 from insufficient stock
      const exists = await Product.exists({ _id: productId })
      return exists
        ? error(res, `Cannot deduct ${quantity} — insufficient stock`, 400)
        : error(res, 'Product not found', 404)
    }

  } else {
    // 'adjustment' — set exact quantity
    const target = Math.max(0, quantity)
    // findByIdAndUpdate({ new: false }) returns the BEFORE state, so delta
    // is computed correctly after the fact without a separate findById round trip.
    old = await Product.findByIdAndUpdate(
      productId,
      { $set: { currentStock: target } },
      { new: false }
    )
    if (!old) return error(res, 'Product not found', 404)
    delta = target - old.currentStock
  }

  const stockBefore = old.currentStock
  const stockAfter  = stockBefore + delta

  await StockMovement.create({
    product:     old._id,
    productName: old.name,
    type:        'adjustment',
    quantity:    delta,
    stockBefore,
    stockAfter,
    notes:       reason + (notes ? ` — ${notes}` : ''),
    recordedBy:  req.user._id,
    date:        new Date(),
  })

  // When stock increases (addition or upward adjustment), resolve stale
  // low_stock / out_of_stock alerts.  generateStockAlerts will recreate
  // them if the product is still under its reorder level.
  if (delta > 0) {
    Alert.updateMany(
      { product: old._id, type: { $in: ['low_stock', 'out_of_stock'] }, isAcknowledged: false },
      { $set: { isAcknowledged: true, acknowledgedAt: new Date() } }
    ).catch(() => {})
  }

  return success(res, { delta, stockBefore, stockAfter }, 'Stock adjusted')
})

// ── Legacy flat adjust (backward compat) ────────────────────────────────────
//   POST /inventory/adjust
//   body: { productId, quantity (signed), notes }
router.post('/adjust', managerOrAdmin, async (req, res) => {
  const { productId, notes } = req.body

  // Fix #21: no type coercion existed — sending quantity:"5" produced string
  // concatenation in product.currentStock + quantity.
  const quantity = Number(req.body.quantity)

  if (!productId)              return error(res, 'productId is required', 400)
  if (isNaN(quantity) || quantity === 0 || !Number.isFinite(quantity))
    return error(res, 'quantity must be a non-zero finite number', 400)

  let old

  if (quantity > 0) {
    // Positive delta — always safe, no under-zero risk
    old = await Product.findByIdAndUpdate(
      productId,
      { $inc: { currentStock: quantity } },
      { new: false }
    )
  } else {
    // Negative delta — use CAS to prevent stock going below zero
    old = await Product.findOneAndUpdate(
      { _id: productId, currentStock: { $gte: -quantity } },
      { $inc: { currentStock: quantity } },
      { new: false }
    )
    if (!old) {
      const exists = await Product.exists({ _id: productId })
      return exists
        ? error(res, `Cannot adjust by ${quantity} — insufficient stock`, 400)
        : error(res, 'Product not found', 404)
    }
  }

  if (!old) return error(res, 'Product not found', 404)

  const stockBefore = old.currentStock
  const stockAfter  = stockBefore + quantity

  await StockMovement.create({
    product: old._id, productName: old.name,
    type: 'adjustment', quantity,
    stockBefore, stockAfter,
    notes: notes || `Manual adjustment by ${req.user.fullName}`,
    recordedBy: req.user._id,
  })

  if (quantity > 0) {
    Alert.updateMany(
      { product: old._id, type: { $in: ['low_stock', 'out_of_stock'] }, isAcknowledged: false },
      { $set: { isAcknowledged: true, acknowledgedAt: new Date() } }
    ).catch(() => {})
  }

  return success(res, { stockBefore, stockAfter }, 'Stock adjusted')
})

module.exports = router
