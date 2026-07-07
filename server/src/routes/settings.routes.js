const router   = require('express').Router()
const Setting  = require('../models/Setting')
const { protect }   = require('../middleware/auth')
const { adminOnly } = require('../middleware/authorize')
const { success, error } = require('../utils/response')
const { createCloudUpload } = require('../middleware/upload')
const cloudinary = require('../services/cloudinary.service')

const COMPANY_FOLDER = process.env.CLOUDINARY_COMPANY_FOLDER || 'stockwise/company'

// ── Company logo upload uses multer-storage-cloudinary (direct stream) ────────
const logoUpload = createCloudUpload(COMPANY_FOLDER, [
  { width: 400, height: 400, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
])

router.use(protect)

// ── GET all settings ──────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const settings = await Setting.find()
  const obj = {}
  settings.forEach(s => { obj[s.key] = s.value })
  return success(res, { settings: obj })
})

// ── PATCH bulk settings ───────────────────────────────────────────────────────

router.patch('/', adminOnly, async (req, res) => {
  const updates = req.body
  // Fix #18: sequential await-in-loop sent one round trip per setting key.
  // Run all upserts concurrently — settings are independent of each other.
  await Promise.all(
    Object.entries(updates).map(([key, value]) =>
      Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true })
    )
  )
  return success(res, {}, 'Settings updated')
})

// ── POST company logo — streamed directly to Cloudinary via CloudinaryStorage ──

router.post('/logo', adminOnly, logoUpload.single('logo'), async (req, res) => {
  if (!req.file) return error(res, 'No logo file provided', 400)

  // req.file.path     = Cloudinary secure_url  (multer-storage-cloudinary convention)
  // req.file.filename = Cloudinary public_id
  const { path: url, filename: publicId } = req.file

  // Delete previous logo from Cloudinary (non-fatal if it fails)
  const existingIdDoc = await Setting.findOne({ key: 'company_logo_public_id' })
  if (existingIdDoc?.value) {
    await cloudinary.deleteImage(existingIdDoc.value)
  }

  // Persist URL and public_id as separate settings keys
  await Setting.findOneAndUpdate(
    { key: 'company_logo' },
    { key: 'company_logo', value: url, group: 'general', label: 'Company Logo' },
    { upsert: true }
  )
  await Setting.findOneAndUpdate(
    { key: 'company_logo_public_id' },
    { key: 'company_logo_public_id', value: publicId, group: 'general', label: 'Company Logo Public ID' },
    { upsert: true }
  )

  return success(res, { url, publicId }, 'Company logo uploaded')
})

// ── DELETE company logo ───────────────────────────────────────────────────────

router.delete('/logo', adminOnly, async (req, res) => {
  const existingIdDoc = await Setting.findOne({ key: 'company_logo_public_id' })
  if (existingIdDoc?.value) {
    await cloudinary.deleteImage(existingIdDoc.value)
  }

  await Setting.deleteMany({ key: { $in: ['company_logo', 'company_logo_public_id'] } })

  return success(res, {}, 'Company logo removed')
})

module.exports = router
