const mongoose = require('mongoose')
const Product = require('../models/Product')
const Sale = require('../models/Sale')
const Purchase = require('../models/Purchase')
const Alert = require('../models/Alert')
const Supplier = require('../models/Supplier')
const StockMovement = require('../models/StockMovement')
require('../models/User') // register User schema so StockMovement.populate('recordedBy') resolves
const { success } = require('../utils/response')

exports.getSummary = async (req, res) => {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [
    totalProducts,
    lowStock,
    outOfStock,
    overstock,
    todaySales,
    monthlySales,
    inventoryValue,
    unreadAlerts,
    pendingPurchases,
    totalSuppliers,
    suggestedPurchase,
  ] = await Promise.all([
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ $expr: { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderLevel'] }] } }),
    Product.countDocuments({ currentStock: { $lte: 0 } }),
    // Guard maxStock > 0: with the default maxStock=0, the expression
    // 0*0.9=0 would flag every product as overstock.
    Product.countDocuments({ maxStock: { $gt: 0 }, $expr: { $gte: ['$currentStock', { $multiply: ['$maxStock', 0.9] }] } }),
    Sale.aggregate([
      { $match: { saleDate: { $gte: today }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: monthStart }, status: 'completed' } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, value: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } } } },
    ]),
    Alert.countDocuments({ isRead: false }),
    Purchase.countDocuments({ status: 'ordered' }),
    Supplier.countDocuments({ status: 'active' }),
    // Estimated cost to restock all items below reorder level
    Product.aggregate([
      { $match: { isActive: true, $expr: { $lt: ['$currentStock', '$reorderLevel'] } } },
      { $group: {
        _id: null,
        value: { $sum: { $multiply: [{ $subtract: ['$reorderLevel', '$currentStock'] }, '$buyingPrice'] } },
        count: { $sum: 1 },
      }},
    ]),
  ])

  return success(res, {
    totalProducts,
    lowStock,
    outOfStock,
    overstock,
    todayRevenue:           todaySales[0]?.revenue        || 0,
    todaySalesCount:        todaySales[0]?.count          || 0,
    monthlyRevenue:         monthlySales[0]?.revenue      || 0,
    monthlySalesCount:      monthlySales[0]?.count        || 0,
    inventoryValue:         inventoryValue[0]?.value      || 0,
    unreadAlerts,
    pendingPurchases,
    totalSuppliers,
    suggestedPurchaseValue: suggestedPurchase[0]?.value   || 0,
    suggestedItemsCount:    suggestedPurchase[0]?.count   || 0,
  })
}

exports.getSalesTrend = async (req, res) => {
  const { days = 7 } = req.query
  const from = new Date(); from.setDate(from.getDate() - parseInt(days))

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

exports.getCategoryDistribution = async (req, res) => {
  const data = await Product.aggregate([
    { $match: { isActive: true } },
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'cat' } },
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $group: {
      _id:   '$cat.name',
      count: { $sum: 1 },
      value: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } },
    }},
    { $sort: { count: -1 } },
    { $project: { _id: 0, category: '$_id', count: 1, value: 1 } },
  ])
  return success(res, { distribution: data })
}

exports.getRecentTransactions = async (req, res) => {
  const { limit = 10 } = req.query
  const [sales, purchases] = await Promise.all([
    Sale.find({ status: 'completed' })
      .sort({ saleDate: -1 }).limit(parseInt(limit))
      .populate('recordedBy', 'fullName'),
    Purchase.find({})
      .sort({ purchaseDate: -1 }).limit(parseInt(limit))
      .populate('supplier', 'name'),
  ])

  const transactions = [
    ...sales.map(s => ({
      type: 'sale', id: s._id, number: s.invoiceNumber,
      amount: s.grandTotal, date: s.saleDate,
      party: s.customerName || 'Walk-in', by: s.recordedBy?.fullName,
    })),
    ...purchases.map(p => ({
      type: 'purchase', id: p._id, number: p.purchaseNumber,
      amount: p.grandTotal, date: p.purchaseDate,
      party: p.supplier?.name, by: null,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, parseInt(limit))

  return success(res, { transactions })
}

// ── Executive Recommendations ─────────────────────────────────────────────────
const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 }

function _aiReason(pred, daysLeft, leadTime) {
  const parts = []
  if (daysLeft < leadTime)
    parts.push(`Only ${daysLeft}d of stock vs ${leadTime}d lead time — will stock out before next delivery`)
  else if (pred.stockoutProbability > 70)
    parts.push(`${pred.stockoutProbability}% stockout probability over forecast window`)
  // Fix #8: Prediction.demandTrend enum is ['rising','stable','falling'].
  // 'increasing' was never in the enum — this condition never fired.
  if (pred.demandTrend === 'rising')
    parts.push('demand is trending upward')
  if (pred.forecastDemand > pred.currentStock * 2)
    parts.push(`forecasted demand (${Math.round(pred.forecastDemand)} units) far exceeds current stock`)
  if (pred.suggestedPurchase > 0 && parts.length === 0)
    parts.push(`stock below reorder point (${pred.reorderPoint} units)`)
  return parts.length ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts[1] ? '; ' + parts[1] : '') + '.' : 'Reorder recommended based on forecast.'
}

function _ruleReason(product, priority) {
  if (priority === 'critical') return `Out of stock — immediate reorder required.`
  if (product.currentStock < product.reorderLevel * 0.5)
    return `Stock (${product.currentStock}) is less than 50% of reorder level (${product.reorderLevel}).`
  return `Stock (${product.currentStock}) has fallen to or below reorder level (${product.reorderLevel}).`
}

function _aiPriority(pred, daysLeft, leadTime) {
  if ((pred.inventoryRisk === 'high' && daysLeft <= leadTime) || pred.stockoutProbability > 80) return 'critical'
  if (pred.inventoryRisk === 'high' || pred.stockoutProbability > 60) return 'high'
  if (pred.inventoryRisk === 'medium' || pred.stockoutProbability > 35) return 'medium'
  return 'low'
}

exports.getRecommendations = async (req, res) => {
  let Prediction
  try { Prediction = require('../models/Prediction') } catch { Prediction = null }

  const buyNow = []
  const stockoutRisk = []
  const overstockRisk = []
  const supplierMap = {}
  let hasAiData = false
  const analyzedIds = new Set()

  // ── AI-powered recommendations ────────────────────────────────────────────
  if (Prediction) {
    const aiPreds = await Prediction.find({ status: 'ready' })
      .populate({
        path: 'product',
        select: 'name sku currentStock reorderLevel buyingPrice leadTimeDays maxStock',
        populate: { path: 'supplier', select: 'name phone email' },
      })
      .lean()

    hasAiData = aiPreds.length > 0

    for (const pred of aiPreds) {
      const product = pred.product
      if (!product) continue
      analyzedIds.add(product._id.toString())

      const leadTime  = pred.leadTimeDays || product.leadTimeDays || 7
      const daysLeft  = pred.daysOfStock ?? 999
      const priority  = _aiPriority(pred, daysLeft, leadTime)
      const supplier  = product.supplier
        ? { id: product.supplier._id.toString(), name: product.supplier.name, phone: product.supplier.phone }
        : null
      const estimatedCost = (pred.suggestedPurchase || 0) * (product.buyingPrice || 0)

      const card = {
        productId:            product._id.toString(),
        productName:          pred.productName || product.name,
        sku:                  pred.sku         || product.sku,
        currentStock:         pred.currentStock ?? product.currentStock,
        forecastDemand:       pred.forecastDemand,
        dailyDemand:          pred.dailyDemand,
        safetyStock:          pred.safetyStock,
        reorderPoint:         pred.reorderPoint,
        eoq:                  pred.eoq,
        suggestedPurchase:    pred.suggestedPurchase || 0,
        confidenceScore:      pred.confidenceScore,
        demandTrend:          pred.demandTrend,
        daysOfStock:          daysLeft,
        stockoutProbability:  pred.stockoutProbability || 0,
        overstockProbability: pred.overstockProbability || 0,
        inventoryRisk:        pred.inventoryRisk,
        explanation:          pred.explanation,
        reason:               _aiReason(pred, daysLeft, leadTime),
        priority,
        supplier,
        estimatedCost,
        buyingPrice:          product.buyingPrice,
        leadTimeDays:         leadTime,
        forecastData:         (pred.forecastData || []).slice(0, 14),
        analyzedAt:           pred.analyzedAt,
        hasHistoricalData:    pred.hasHistoricalData,
        isRuleBased:          false,
      }

      if (card.suggestedPurchase > 0) {
        buyNow.push(card)
        if (supplier?.id) {
          if (!supplierMap[supplier.id])
            supplierMap[supplier.id] = { id: supplier.id, name: supplier.name, phone: supplier.phone, totalCost: 0, products: [] }
          supplierMap[supplier.id].totalCost += estimatedCost
          supplierMap[supplier.id].products.push({ name: card.productName, qty: card.suggestedPurchase, cost: estimatedCost })
        }
      }
      if (card.stockoutProbability  > 40) stockoutRisk.push(card)
      if (card.overstockProbability > 50) overstockRisk.push(card)
    }
  }

  // ── Rule-based fallback for unanalyzed products ───────────────────────────
  const excluded = [...analyzedIds].map(id => new mongoose.Types.ObjectId(id))
  const ruleFilter = { isActive: true, $expr: { $lte: ['$currentStock', '$reorderLevel'] } }
  if (excluded.length) ruleFilter._id = { $nin: excluded }

  const ruleProducts = await Product.find(ruleFilter)
    .populate('supplier', 'name phone')
    .select('name sku currentStock reorderLevel buyingPrice leadTimeDays maxStock supplier')
    .limit(20)
    .lean()

  for (const p of ruleProducts) {
    const shortage = Math.max(0, (p.reorderLevel || 0) - (p.currentStock || 0))
    const suggested = Math.max(1, Math.round(shortage * 1.5))
    const priority = p.currentStock <= 0
      ? 'critical'
      : p.currentStock < (p.reorderLevel || 0) * 0.5 ? 'high' : 'medium'
    const supplier = p.supplier
      ? { id: p.supplier._id.toString(), name: p.supplier.name, phone: p.supplier.phone }
      : null
    const estimatedCost = suggested * (p.buyingPrice || 0)

    const card = {
      productId:            p._id.toString(),
      productName:          p.name,
      sku:                  p.sku,
      currentStock:         p.currentStock,
      forecastDemand:       null,
      dailyDemand:          null,
      safetyStock:          null,
      reorderPoint:         p.reorderLevel,
      eoq:                  null,
      suggestedPurchase:    suggested,
      confidenceScore:      null,
      demandTrend:          'unknown',
      daysOfStock:          null,
      stockoutProbability:  priority === 'critical' ? 95 : priority === 'high' ? 70 : 45,
      overstockProbability: 0,
      inventoryRisk:        priority === 'low' ? 'medium' : priority,
      explanation:          null,
      reason:               _ruleReason(p, priority),
      priority,
      supplier,
      estimatedCost,
      buyingPrice:          p.buyingPrice,
      leadTimeDays:         p.leadTimeDays || 7,
      forecastData:         [],
      analyzedAt:           null,
      hasHistoricalData:    false,
      isRuleBased:          true,
    }

    buyNow.push(card)
    stockoutRisk.push(card)
    if (supplier?.id) {
      if (!supplierMap[supplier.id])
        supplierMap[supplier.id] = { id: supplier.id, name: supplier.name, phone: supplier.phone, totalCost: 0, products: [] }
      supplierMap[supplier.id].totalCost += estimatedCost
      supplierMap[supplier.id].products.push({ name: card.productName, qty: card.suggestedPurchase, cost: estimatedCost })
    }
  }

  buyNow.sort((a, b) => (PRIORITY[a.priority] ?? 3) - (PRIORITY[b.priority] ?? 3))
  stockoutRisk.sort((a, b) => (b.stockoutProbability || 0) - (a.stockoutProbability || 0))
  overstockRisk.sort((a, b) => (b.overstockProbability || 0) - (a.overstockProbability || 0))

  const suppliers = Object.values(supplierMap).sort((a, b) => b.totalCost - a.totalCost)
  const totalBudget = buyNow.reduce((s, c) => s + (c.estimatedCost || 0), 0)

  return success(res, {
    buyNow:       buyNow.slice(0, 24),
    stockoutRisk: stockoutRisk.slice(0, 15),
    overstockRisk:overstockRisk.slice(0, 15),
    summary: {
      totalBudget,
      productsToBuy:     buyNow.length,
      stockoutCount:     stockoutRisk.length,
      overstockCount:    overstockRisk.length,
      criticalCount:     buyNow.filter(p => p.priority === 'critical').length,
      highCount:         buyNow.filter(p => p.priority === 'high').length,
      suppliersInvolved: suppliers.length,
    },
    suppliers,
    hasAiData,
    generatedAt: new Date().toISOString(),
  })
}
