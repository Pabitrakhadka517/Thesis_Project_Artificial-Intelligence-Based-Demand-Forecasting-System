/**
 * Upload Middleware
 *
 * Two multer strategies are exported:
 *
 * 1. `upload`  — Memory-storage multer (backward-compatible with all existing routes).
 *    Files land in req.file.buffer. Controllers manually call cloudinary.service.uploadImage().
 *    Used by: products, categories (and any future route that needs compensating-action control).
 *
 * 2. `createCloudUpload(folder, transformation?)`  — multer-storage-cloudinary factory.
 *    Files are streamed directly from the request into Cloudinary during middleware execution.
 *    req.file.path     → Cloudinary secure_url
 *    req.file.filename → Cloudinary public_id
 *    Used by: settings (company logo) and any future route that doesn't need pre-upload validation.
 *
 * Both strategies enforce:
 *   - Allowed MIME types: JPEG, JPG, PNG, WebP
 *   - Maximum file size: 5 MB
 *   - Meaningful error messages returned via the global error handler
 */

const multer                = require('multer')
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const cloudinaryV2          = require('../../config/cloudinary')

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const ALLOWED_EXT  = ['jpg', 'jpeg', 'png', 'webp']
const MAX_SIZE     = 5 * 1024 * 1024   // 5 MB

// ── Shared file filter ────────────────────────────────────────────────────────

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    return cb(null, true)
  }
  const err = new Error(
    `Invalid file type "${file.mimetype}". Only JPEG, PNG, and WebP images are accepted.`
  )
  err.status = 400
  cb(err, false)
}

// ── Strategy 1: Memory storage (existing routes, full control) ────────────────

const upload = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: MAX_SIZE },
  fileFilter,
})

// ── Strategy 2: CloudinaryStorage (direct-stream to Cloudinary) ──────────────

/**
 * Create a multer instance that streams uploads directly to Cloudinary.
 *
 * After the middleware runs:
 *   req.file.path     = Cloudinary secure_url
 *   req.file.filename = Cloudinary public_id
 *
 * @param {string}  folder           Cloudinary destination folder (e.g. 'stockwise/company')
 * @param {Array}   [transformation] Cloudinary transformation chain (defaults to auto-quality 1000px limit)
 * @returns {multer.Multer}
 */
function createCloudUpload(
  folder,
  transformation = [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
) {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinaryV2,
    params: {
      folder,
      resource_type:   'image',
      allowed_formats: ALLOWED_EXT,
      transformation,
    },
  })

  return multer({
    storage,
    limits:     { fileSize: MAX_SIZE },
    fileFilter,
  })
}

module.exports = { upload, createCloudUpload }
