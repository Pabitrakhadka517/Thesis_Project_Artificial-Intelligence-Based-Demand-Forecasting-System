/**
 * Cloudinary Service — low-level upload / delete helpers.
 *
 * All uploads use memory-buffer → upload_stream so the controller
 * retains full error-handling control (compensating deletes, etc.).
 *
 * Returns a unified ImageMeta object:
 *   { url, publicId, assetId, format, width, height }
 */

const { Readable } = require('stream')
const cloudinary   = require('../../config/cloudinary')

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_BYTES     = 5 * 1024 * 1024   // 5 MB

// ── Validation ────────────────────────────────────────────────────────────────

function validateImage(file) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    const e = new Error('Invalid file type. Allowed formats: JPEG, PNG, WebP.')
    e.status = 400
    throw e
  }
  if (file.size > MAX_BYTES) {
    const e = new Error('File too large. Maximum allowed size is 5 MB.')
    e.status = 400
    throw e
  }
}

// ── Core upload ───────────────────────────────────────────────────────────────

/**
 * Upload a multer memory-buffer file to Cloudinary.
 *
 * @param {Express.Multer.File} file   Multer file object (memoryStorage)
 * @param {string}              folder Cloudinary destination folder
 * @returns {Promise<ImageMeta>}       { url, publicId, assetId, format, width, height }
 */
async function uploadImage(file, folder) {
  validateImage(file)

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 1000, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (err, result) => {
        if (err) {
          const e = new Error('Image upload to Cloudinary failed.')
          e.status  = 502
          e.details = err.message
          return reject(e)
        }
        resolve({
          url:      result.secure_url,
          publicId: result.public_id,
          assetId:  result.asset_id,
          format:   result.format,
          width:    result.width,
          height:   result.height,
        })
      }
    )

    const readable = new Readable()
    readable.push(file.buffer)
    readable.push(null)
    readable.pipe(stream)
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Delete an image from Cloudinary by its public_id.
 * Non-fatal: a deletion failure logs a warning but never crashes the request.
 *
 * @param  {string}  publicId  Cloudinary public_id
 * @returns {Promise<boolean>}
 */
async function deleteImage(publicId) {
  if (!publicId) return true
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
    if (result.result !== 'ok' && result.result !== 'not found') {
      console.warn(`[Cloudinary] Delete returned unexpected result for "${publicId}":`, result.result)
    }
    return true
  } catch (err) {
    console.warn(`[Cloudinary] Delete failed for "${publicId}":`, err.message)
    return false
  }
}

// ── Replace ───────────────────────────────────────────────────────────────────

/**
 * Upload a new image and then delete the old one.
 * The new image is always uploaded first — old-image deletion failure is non-fatal.
 *
 * @param {Express.Multer.File} file        New image (memoryStorage)
 * @param {string}              folder      Cloudinary folder
 * @param {string|null}         oldPublicId Previous image's public_id (may be null)
 * @returns {Promise<ImageMeta>}
 */
async function replaceImage(file, folder, oldPublicId = null) {
  const meta = await uploadImage(file, folder)
  if (oldPublicId) await deleteImage(oldPublicId)
  return meta
}

module.exports = { uploadImage, deleteImage, replaceImage, validateImage }
