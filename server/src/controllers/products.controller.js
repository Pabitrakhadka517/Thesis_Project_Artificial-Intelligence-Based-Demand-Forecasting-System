const mongoose = require('mongoose')
const path     = require('path')
const fs       = require('fs')
const Product = require('../models/Product')
const Sale = require('../models/Sale')
const Purchase = require('../models/Purchase')
const StockMovement = require('../models/StockMovement')
const Alert = require('../models/Alert')
const AuditLog = require('../models/AuditLog')
require('../models/User') // register User schema so StockMovement.populate('recordedBy') resolves
const { success, created, error, paginated } = require('../utils/response')
const getProductImage = require('../../utils/productImageMapper')
const { OVERSTOCK_RATIO } = require('../utils/stockAlerts')

const IMAGES_DIR = path.join(__dirname, '../../assets/product-images')

// Allowlist of sortable fields — never pass req.query.sortBy straight into a
// Mongo $sort key (that would let a client sort/probe arbitrary field names).
const SORTABLE_FIELDS = {
  name: 'name', currentStock: 'currentStock', buyingPrice: 'buyingPrice',
  sellingPrice: 'sellingPrice', stockValue: 'stockValue', createdAt: 'createdAt',
}

exports.getProducts = async (req, res) => {
  const { search, category, supplier, status, stockStatus, sortBy, sortDir } = req.query
  const sortField = SORTABLE_FIELDS[sortBy] || 'createdAt'
  const sortOrder = sortDir === 'asc' ? 1 : -1
  // Fix #20: clamp page/limit to prevent NaN skip
  const page  = Math.max(1, parseInt(req.query.page)  || 1)
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100)
  const skip  = (page - 1) * limit

  const match = {}
  if (search)   match.$text = { $search: search }
  // Fix #4: Mongoose aggregation does NOT auto-cast string → ObjectId the way
  // find() does.  Passing a plain string to $match on an ObjectId field causes
  // a type mismatch — no documents are returned.  Cast explicitly.
  if (category && mongoose.Types.ObjectId.isValid(category))
    match.category = new mongoose.Types.ObjectId(category)
  if (supplier && mongoose.Types.ObjectId.isValid(supplier))
    match.supplier = new mongoose.Types.ObjectId(supplier)
  // Root-cause fix: soft-deleted products (isActive=false) were leaking back
  // into the default list because no isActive filter was applied when ?status
  // was absent.  Now the list defaults to active-only.  Pass ?status=inactive
  // to see soft-deleted records, or ?status=all to see everything (admin only).
  if      (status === 'inactive') match.isActive = false
  else if (status === 'all')      { /* no filter — intentionally show everything */ }
  else                             match.isActive = true

  const pipeline = [
    { $match: match },
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
    { $lookup: { from: 'suppliers',  localField: 'supplier',  foreignField: '_id', as: 'supplier' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$supplier',  preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        stockStatus: {
          $switch: {
            branches: [
              { case: { $lte: ['$currentStock', 0] },                         then: 'out_of_stock' },
              { case: { $lte: ['$currentStock', '$minStock'] },               then: 'critical' },
              { case: { $lte: ['$currentStock', '$reorderLevel'] },           then: 'low' },
              { case: { $gte: ['$currentStock', { $multiply: ['$maxStock', 0.9] }] }, then: 'overstock' },
            ],
            default: 'healthy',
          },
        },
        stockValue: { $multiply: ['$currentStock', '$buyingPrice'] },
      },
    },
  ]

  if (stockStatus) pipeline.push({ $match: { stockStatus } })

  const [countPipeline] = [[ ...pipeline, { $count: 'total' } ]]
  const dataPipeline = [
    ...pipeline,
    { $sort: { [sortField]: sortOrder } },
    { $skip: skip },
    { $limit: limit },
  ]

  const [dataRes, countRes] = await Promise.all([
    Product.aggregate(dataPipeline),
    Product.aggregate(countPipeline),
  ])

  const total = countRes[0]?.total || 0
  return paginated(res, { data: dataRes, total, page: parseInt(page), limit: parseInt(limit) })
}

exports.getProduct = async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category supplier')
  if (!product) return error(res, 'Product not found', 404)
  return success(res, { product })
}

exports.createProduct = async (req, res) => {
  const { validationResult } = require('express-validator')
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const {
    name, description, category, supplier, brand, unit,
    buyingPrice, sellingPrice, minStock, maxStock, reorderLevel,
    currentStock, storageLocation, expiryDate, isPerishable, leadTimeDays,
  } = req.body

  // Normalize barcode: empty/whitespace/missing all become undefined so the field
  // is omitted from the document entirely. The sparse unique index only ignores
  // *missing* fields — null is still indexed — so we must never store null.
  const normalizedBarcode = req.body.barcode?.trim() || undefined

  const normalizedSku = req.body.sku?.toUpperCase()
  const existing = await Product.findOne({ sku: normalizedSku })

  if (existing) {
    if (existing.isActive) {
      return error(res, 'A product with this SKU already exists', 409)
    }

    // Reactivate the soft-deleted document in-place.
    // Always explicitly set barcode (to normalizedBarcode, which may be null) so
    // that any stale "" value stored on the inactive product is cleared — otherwise
    // the save() would still hold the unique index slot with an empty string.
    const updates = Object.fromEntries(
      Object.entries({
        name, description, category, supplier, brand, unit,
        buyingPrice, sellingPrice, minStock, maxStock, reorderLevel,
        currentStock, storageLocation, expiryDate, isPerishable, leadTimeDays,
        barcode: normalizedBarcode,   // null passes this filter; always applied
        image: getProductImage(name || existing.name),
        isActive: true,
      }).filter(([, v]) => v !== undefined)
    )
    Object.assign(existing, updates)
    const restored = await existing.save()

    AuditLog.create({
      user: req.user._id, userEmail: req.user.email,
      action: 'PRODUCT_CREATED', resource: 'Product', resourceId: restored._id.toString(),
      details: { sku: restored.sku, name: restored.name, restored: true },
      status: 'success',
    }).catch(() => {})

    return created(res, { product: restored }, 'Product restored successfully')
  }

  // Free any barcode slot held by a previously soft-deleted product.
  // Also catches products created before the "" → null normalization was in place.
  if (normalizedBarcode) {
    await Product.updateOne({ barcode: normalizedBarcode, isActive: false }, { $set: { barcode: null } })
  }

  // Only whitelist safe fields — never let the client set isActive, imagePublicId, etc.
  const product = await Product.create({
    name, description, category, supplier, brand, unit,
    buyingPrice, sellingPrice, minStock, maxStock, reorderLevel,
    currentStock, storageLocation, expiryDate, isPerishable, leadTimeDays,
    barcode: normalizedBarcode,
    sku: normalizedSku,
    image: getProductImage(name),
  })

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'PRODUCT_CREATED', resource: 'Product', resourceId: product._id.toString(),
    details: { sku: product.sku, name: product.name },
    status: 'success',
  }).catch(() => {})

  return created(res, { product }, 'Product created')
}

exports.updateProduct = async (req, res) => {
  const { validationResult } = require('express-validator')
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const {
    name, description, category, supplier, buyingPrice, sellingPrice,
    currentStock, minStock, maxStock, reorderLevel, storageLocation, expiryDate,
    isPerishable, leadTimeDays, unit, isActive,
  } = req.body
  const updates = Object.fromEntries(
    Object.entries({ name, description, category, supplier, buyingPrice, sellingPrice, currentStock, minStock, maxStock, reorderLevel, storageLocation, expiryDate, isPerishable, leadTimeDays, unit, isActive })
      .filter(([, v]) => v !== undefined)
  )
  // Do NOT auto-reset image on name change — let manual uploads take precedence

  const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate('category supplier')
  if (!product) return error(res, 'Product not found', 404)

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'PRODUCT_UPDATED', resource: 'Product', resourceId: product._id.toString(),
    details: { changed: Object.keys(updates), sku: product.sku },
    status: 'success',
  }).catch(() => {})

  return success(res, { product }, 'Product updated')
}

exports.uploadProductImage = async (req, res) => {
  if (!req.file) return error(res, 'No image file provided', 400)

  const product = await Product.findById(req.params.id)
  if (!product) return error(res, 'Product not found', 404)

  // Determine extension from MIME type
  const mimeToExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }
  const ext = mimeToExt[req.file.mimetype] || '.jpg'

  // Delete old custom-uploaded file if it was previously uploaded (not a shared preset image)
  if (product.image && product.image.startsWith('/product-images/product-')) {
    const oldPath = path.join(IMAGES_DIR, path.basename(product.image))
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }

  const filename = `product-${product._id}${ext}`
  fs.writeFileSync(path.join(IMAGES_DIR, filename), req.file.buffer)

  product.image = `/product-images/${filename}`
  await product.save()

  return success(res, { product }, 'Product image updated')
}

exports.deleteProductImage = async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) return error(res, 'Product not found', 404)

  // Delete custom-uploaded file from disk
  if (product.image && product.image.startsWith('/product-images/product-')) {
    const oldPath = path.join(IMAGES_DIR, path.basename(product.image))
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }

  // Fall back to auto-mapped image
  product.image = getProductImage(product.name)
  await product.save()

  return success(res, { product }, 'Product image reset to default')
}

exports.deleteProduct = async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) return error(res, 'Product not found', 404)

  // Delete any custom-uploaded image file
  if (product.image && product.image.startsWith('/product-images/product-')) {
    const oldPath = path.join(IMAGES_DIR, path.basename(product.image))
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }

  product.isActive = false
  // Null out barcode so the sparse unique index slot is freed. Soft-deleted
  // products otherwise permanently block re-use of the same barcode on new products.
  product.barcode = null
  await product.save()

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'PRODUCT_DELETED', resource: 'Product', resourceId: product._id.toString(),
    details: { sku: product.sku, name: product.name },
    status: 'success',
  }).catch(() => {})

  return success(res, {}, 'Product deleted')
}

exports.getProductDetail = async (req, res) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) return error(res, 'Invalid product ID', 400)
  const productId = new mongoose.Types.ObjectId(id)

  const product = await Product.findById(id)
    .populate('category', 'name description')
    .populate('supplier', 'name phone email address leadTimeDays status')
    .lean()
  if (!product) return error(res, 'Product not found', 404)

  const now    = new Date()
  const days30 = new Date(now - 30 * 24 * 60 * 60 * 1000)
  const days90 = new Date(now - 90 * 24 * 60 * 60 * 1000)

  let Prediction = null
  try { Prediction = require('../models/Prediction') } catch {}

  const [
    prediction,
    stockMovements,
    salesHistory,
    salesSummary,
    salesTrend,
    purchaseHistory,
    purchaseSummary,
    productAlerts,
    pendingPO,
  ] = await Promise.all([

    Prediction ? Prediction.findOne({ product: productId }).lean() : Promise.resolve(null),

    StockMovement.find({ product: productId })
      .sort({ date: -1 }).limit(30)
      .populate('recordedBy', 'fullName')
      .lean(),

    Sale.aggregate([
      { $match: { 'items.product': productId, status: { $ne: 'void' } } },
      { $unwind: '$items' },
      { $match: { 'items.product': productId } },
      { $project: {
        invoiceNumber: 1, saleDate: 1, customerName: 1, status: 1,
        quantity:  '$items.quantity',
        unitPrice: '$items.unitPrice',
        lineTotal: '$items.total',
      }},
      { $sort: { saleDate: -1 } },
      { $limit: 20 },
    ]),

    Sale.aggregate([
      { $match: { 'items.product': productId, status: 'completed', saleDate: { $gte: days30 } } },
      { $unwind: '$items' },
      { $match: { 'items.product': productId } },
      { $group: {
        _id:          null,
        totalQty:     { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.total' },
        lastSaleDate: { $max: '$saleDate' },
      }},
    ]),

    Sale.aggregate([
      { $match: { 'items.product': productId, status: 'completed', saleDate: { $gte: days90 } } },
      { $unwind: '$items' },
      { $match: { 'items.product': productId } },
      { $group: {
        _id:      { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        quantity: { $sum: '$items.quantity' },
        revenue:  { $sum: '$items.total' },
      }},
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', quantity: 1, revenue: 1 } },
    ]),

    Purchase.aggregate([
      { $match: { 'items.product': productId } },
      { $unwind: '$items' },
      { $match: { 'items.product': productId } },
      { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: 'sup' } },
      { $unwind: { path: '$sup', preserveNullAndEmptyArrays: true } },
      { $project: {
        purchaseNumber: 1, purchaseDate: 1, status: 1,
        paymentStatus:  1, deliveryDate:  1,
        quantity:     '$items.quantity',
        buyingPrice:  '$items.buyingPrice',
        lineTotal:    '$items.total',
        supplierName: '$sup.name',
      }},
      { $sort: { purchaseDate: -1 } },
      { $limit: 20 },
    ]),

    Purchase.aggregate([
      { $match: { 'items.product': productId, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $match: { 'items.product': productId } },
      { $group: {
        _id:               null,
        totalQtyPurchased: { $sum: '$items.quantity' },
        totalCost:         { $sum: '$items.total' },
        lastPurchaseDate:  { $max: '$purchaseDate' },
        avgBuyingPrice:    { $avg: '$items.buyingPrice' },
      }},
    ]),

    Alert.find({ product: productId }).sort({ createdAt: -1 }).limit(10).lean(),

    Purchase.findOne({
      'items.product': productId,
      status: { $in: ['ordered', 'partial'] },
    })
    .sort({ purchaseDate: -1 })
    .select('deliveryDate purchaseDate purchaseNumber status')
    .lean(),
  ])

  const sold30d        = salesSummary[0]?.totalQty     || 0
  const revenue30d     = salesSummary[0]?.totalRevenue || 0
  const lastSaleDate   = salesSummary[0]?.lastSaleDate || null
  const purch          = purchaseSummary[0] || {}
  const leadTime       = product.leadTimeDays || product.supplier?.leadTimeDays || 7
  const profitMargin   = product.sellingPrice > 0
    ? ((product.sellingPrice - product.buyingPrice) / product.sellingPrice) * 100 : 0
  const inventoryTurnover = product.currentStock > 0
    ? +((sold30d * 12) / product.currentStock).toFixed(1) : sold30d > 0 ? null : 0
  const expectedDelivery = pendingPO?.deliveryDate ||
    new Date(now.getTime() + leadTime * 24 * 60 * 60 * 1000)

  const cs = product.currentStock
  const stockStatus = cs <= 0                      ? 'out_of_stock'
    : cs <= product.minStock                       ? 'critical'
    : cs <= product.reorderLevel                   ? 'low'
    : cs >= product.maxStock * 0.9                 ? 'overstock'
    : 'healthy'

  return success(res, {
    product: { ...product, stockStatus },
    prediction,
    stockMovements,
    salesHistory,
    purchaseHistory,
    salesTrend,
    alerts: productAlerts,
    metrics: {
      profitMargin:      +profitMargin.toFixed(2),
      stockValue:        product.currentStock * product.buyingPrice,
      totalQtySold30d:   sold30d,
      totalRevenue30d:   revenue30d,
      totalQtyPurchased: purch.totalQtyPurchased || 0,
      totalPurchaseCost: purch.totalCost         || 0,
      avgBuyingPrice:    purch.avgBuyingPrice    || product.buyingPrice,
      inventoryTurnover,
      lastSaleDate,
      lastPurchaseDate:  purch.lastPurchaseDate  || null,
      expectedDelivery,
      leadTimeDays:      leadTime,
      pendingPO:         pendingPO
        ? { number: pendingPO.purchaseNumber, status: pendingPO.status }
        : null,
    },
  })
}

exports.getProductStats = async (req, res) => {
  const [total, lowStock, outOfStock, overstock, totalValue] = await Promise.all([
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({
      isActive: true,
      $expr: { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderLevel'] }] },
    }),
    Product.countDocuments({ isActive: true, currentStock: { $lte: 0 } }),
    Product.countDocuments({
      isActive: true,
      // maxStock === 0 means "unlimited / not configured" (see isOverstocked in
      // utils/stockAlerts.js) — must never count as overstocked, otherwise every
      // unlimited-max product is flagged since currentStock >= 0 is always true.
      $expr: {
        $and: [
          { $gt: ['$maxStock', 0] },
          { $gte: ['$currentStock', { $multiply: ['$maxStock', OVERSTOCK_RATIO] }] },
        ],
      },
    }),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$currentStock', '$buyingPrice'] } } } },
    ]),
  ])

  return success(res, {
    total,
    lowStock,
    outOfStock,
    overstock,
    totalInventoryValue: totalValue[0]?.total || 0,
  })
}
