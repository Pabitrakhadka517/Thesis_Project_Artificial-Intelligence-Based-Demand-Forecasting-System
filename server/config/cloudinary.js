/**
 * Cloudinary v2 — centralised configuration.
 *
 * Imported by:
 *   - middleware/upload.js  (CloudinaryStorage for direct-stream uploads)
 *   - services/cloudinary.service.js (manual upload_stream for memory-buffer uploads)
 *   - services/image.service.js (URL transformation helpers)
 *
 * Never import cloudinary.v2 inline elsewhere — always use this module
 * so credentials are configured exactly once.
 */

const cloudinary = require('cloudinary').v2

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
})

module.exports = cloudinary
