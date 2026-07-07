/**
 * Image Service — high-level image management for StockWise.
 *
 * Wraps cloudinary.service (low-level) and adds:
 *   - Folder constants (single source of truth)
 *   - Metadata extraction helper for multer-storage-cloudinary req.file objects
 *   - Thumbnail URL generation via Cloudinary transformation API
 *   - Orphan-safe delete (handles missing publicId gracefully)
 *
 * Usage in controllers:
 *   const imageService = require('../services/image.service')
 *
 *   // Upload with full metadata
 *   const meta = await imageService.upload(req.file, imageService.FOLDERS.PRODUCTS)
 *   // meta = { url, publicId, assetId, format, width, height }
 *
 *   // Delete safely
 *   await imageService.remove(product.imagePublicId)
 *
 *   // Replace (upload new → delete old)
 *   const meta = await imageService.replace(req.file, imageService.FOLDERS.PRODUCTS, product.imagePublicId)
 *
 *   // Thumbnail for list views
 *   const thumb = imageService.thumbnail(meta.url, { width: 80, height: 80 })
 */

const { uploadImage, deleteImage, replaceImage } = require('./cloudinary.service')
const cloudinary = require('../../config/cloudinary')

// ── Folder constants ──────────────────────────────────────────────────────────

const BASE = process.env.CLOUDINARY_FOLDER || 'stockwise'

const FOLDERS = {
  PRODUCTS:  process.env.CLOUDINARY_PRODUCTS_FOLDER  || `${BASE}/products`,
  USERS:     process.env.CLOUDINARY_USERS_FOLDER     || `${BASE}/users`,
  SUPPLIERS: process.env.CLOUDINARY_SUPPLIERS_FOLDER || `${BASE}/suppliers`,
  COMPANY:   process.env.CLOUDINARY_COMPANY_FOLDER   || `${BASE}/company`,
  REPORTS:   process.env.CLOUDINARY_REPORTS_FOLDER   || `${BASE}/reports`,
  CATEGORIES:process.env.CLOUDINARY_CATEGORIES_FOLDER|| `${BASE}/categories`,
}

// ── Core operations (thin delegates) ─────────────────────────────────────────

const upload  = uploadImage
const remove  = deleteImage
const replace = replaceImage

// ── Metadata extraction for multer-storage-cloudinary req.file ───────────────

/**
 * Extract image metadata from a multer-storage-cloudinary req.file object.
 * With multer-storage-cloudinary:
 *   req.file.path     → Cloudinary secure_url
 *   req.file.filename → Cloudinary public_id
 *
 * @param {object} file  req.file from multer-storage-cloudinary
 * @returns {{ url: string, publicId: string }}
 */
function extractCloudMeta(file) {
  return {
    url:      file.path,
    publicId: file.filename,
  }
}

// ── URL transformations ───────────────────────────────────────────────────────

/**
 * Generate a Cloudinary thumbnail URL from an existing image URL.
 * Falls back to the original URL if it is not a Cloudinary URL.
 *
 * @param {string}  url        Cloudinary secure_url
 * @param {object}  [opts]
 * @param {number}  [opts.width=80]
 * @param {number}  [opts.height=80]
 * @param {string}  [opts.crop='fill']
 * @returns {string}
 */
function thumbnail(url, { width = 80, height = 80, crop = 'fill' } = {}) {
  if (!url || !url.includes('cloudinary.com')) return url

  // Extract the public_id portion after "/upload/"
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/)
  if (!match) return url

  return cloudinary.url(match[1], {
    transformation: [{ width, height, crop, quality: 'auto', fetch_format: 'auto' }],
    secure: true,
  })
}

/**
 * Generate a resized / optimised URL without changing the crop mode.
 *
 * @param {string} url    Cloudinary secure_url
 * @param {number} width  Max width
 * @returns {string}
 */
function resize(url, width = 400) {
  if (!url || !url.includes('cloudinary.com')) return url
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/)
  if (!match) return url
  return cloudinary.url(match[1], {
    transformation: [{ width, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    secure: true,
  })
}

module.exports = { FOLDERS, upload, remove, replace, extractCloudMeta, thumbnail, resize }
