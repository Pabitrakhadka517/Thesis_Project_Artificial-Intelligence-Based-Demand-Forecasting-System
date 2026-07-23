const router   = require('express').Router()
const Category = require('../models/Category')
const Product  = require('../models/Product')
const AuditLog = require('../models/AuditLog')
const { protect }                  = require('../middleware/auth')
const { managerOrAdmin, adminOnly } = require('../middleware/authorize')
const { upload }                   = require('../middleware/upload')
const cloudinary                   = require('../services/cloudinary.service')
const { success, created, error }  = require('../utils/response')

const FOLDER = process.env.CLOUDINARY_CATEGORIES_FOLDER || 'stockwise/categories'

router.use(protect)

// ── List all categories ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const categories = await Category.find().sort({ name: 1 })
  return success(res, { categories })
})

// ── Get single category ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const category = await Category.findById(req.params.id)
  if (!category) return error(res, 'Category not found', 404)
  return success(res, { category })
})

// ── Create category (optional image via multipart) ────────────────────────────
router.post('/', managerOrAdmin, upload.single('image'), async (req, res) => {
  let imageData = {}

  if (req.file) {
    try {
      const { url, publicId } = await cloudinary.uploadImage(req.file, FOLDER)
      imageData = { imageUrl: url, imagePublicId: publicId }
    } catch (uploadErr) {
      return error(res, uploadErr.message, uploadErr.status || 502)
    }
  }

  let category
  try {
    category = await Category.create({ ...req.body, ...imageData })
  } catch (dbErr) {
    // Compensating cleanup: DB write failed after successful upload
    if (imageData.imagePublicId) await cloudinary.deleteImage(imageData.imagePublicId)
    throw dbErr
  }

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'CATEGORY_CREATED', resource: 'Category', resourceId: category._id.toString(),
    details: { name: category.name },
    status: 'success',
  }).catch(() => {})

  return created(res, { category }, 'Category created')
})

// ── Update category metadata (no image — use /image route for that) ───────────
router.patch('/:id', managerOrAdmin, async (req, res) => {
  const { name, description, isActive } = req.body
  const updates = Object.fromEntries(
    Object.entries({ name, description, isActive }).filter(([, v]) => v !== undefined)
  )
  const category = await Category.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
  if (!category) return error(res, 'Category not found', 404)

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'CATEGORY_UPDATED', resource: 'Category', resourceId: category._id.toString(),
    details: { changed: Object.keys(updates), name: category.name },
    status: 'success',
  }).catch(() => {})

  return success(res, { category })
})

// ── Upload / replace category image ──────────────────────────────────────────
router.post('/:id/image', managerOrAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return error(res, 'No image file provided', 400)

  const category = await Category.findById(req.params.id)
  if (!category) return error(res, 'Category not found', 404)

  let url, publicId
  try {
    ;({ url, publicId } = await cloudinary.replaceImage(req.file, FOLDER, category.imagePublicId))
  } catch (uploadErr) {
    return error(res, uploadErr.message, uploadErr.status || 502)
  }

  category.imageUrl      = url
  category.imagePublicId = publicId
  await category.save()

  return success(res, { category }, 'Category image updated')
})

// ── Delete category image only ────────────────────────────────────────────────
router.delete('/:id/image', managerOrAdmin, async (req, res) => {
  const category = await Category.findById(req.params.id)
  if (!category) return error(res, 'Category not found', 404)

  if (category.imagePublicId) await cloudinary.deleteImage(category.imagePublicId)

  category.imageUrl      = undefined
  category.imagePublicId = undefined
  await category.save()

  return success(res, { category }, 'Category image removed')
})

// ── Delete category ───────────────────────────────────────────────────────────
router.delete('/:id', adminOnly, async (req, res) => {
  const category = await Category.findById(req.params.id)
  if (!category) return error(res, 'Category not found', 404)

  // Block deletion if products still reference this category
  const productCount = await Product.countDocuments({ category: req.params.id, isActive: true })
  if (productCount > 0) {
    return error(
      res,
      `Cannot delete — ${productCount} active product(s) still use this category. Reassign them first.`,
      409
    )
  }

  // Clean up Cloudinary asset before deleting record
  if (category.imagePublicId) await cloudinary.deleteImage(category.imagePublicId)

  await category.deleteOne()

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'CATEGORY_DELETED', resource: 'Category', resourceId: req.params.id,
    details: { name: category.name },
    status: 'success',
  }).catch(() => {})

  return success(res, {}, 'Category deleted')
})

module.exports = router
