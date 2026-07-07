'use strict'

/**
 * migrateProductImages.js
 *
 * One-time migration script that assigns representative Cloudinary images
 * to all existing products that currently have no imageUrl.
 *
 * Usage:
 *   node server/scripts/migrateProductImages.js
 *
 * Resolution order for each product:
 *   1. Local file   → server/assets/product-images/<image>
 *   2. Remote URL   → uploaded to Cloudinary directly from the web
 *
 * The script NEVER terminates early on error — it logs failures and moves on.
 */

const path = require('path')
const fs   = require('fs')

// ── Load .env before any other require that needs env vars ──────────────────
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const mongoose  = require('mongoose')
const cloudinary = require('../config/cloudinary')
const { resolveImageEntry } = require('../config/productImageMap')

// ── Config ──────────────────────────────────────────────────────────────────
const IMAGES_DIR = path.resolve(__dirname, '../assets/product-images')
const FOLDER     = process.env.CLOUDINARY_PRODUCTS_FOLDER || 'stockwise/products'
const TRANSFORM  = [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]

// ── Helpers ─────────────────────────────────────────────────────────────────

function pad(n, width = 3) {
  return String(n).padStart(width, ' ')
}

function hr(char = '─', len = 62) {
  return char.repeat(len)
}

async function uploadToCloudinary(source) {
  return cloudinary.uploader.upload(source, {
    folder:        FOLDER,
    resource_type: 'image',
    transformation: TRANSFORM,
  })
}

// ── Main migration ───────────────────────────────────────────────────────────

async function migrate() {
  const startTime = Date.now()

  console.log(hr('═'))
  console.log('  StockWise — Product Image Migration')
  console.log(hr('═'))
  console.log(`  Cloudinary folder : ${FOLDER}`)
  console.log(`  Local assets dir  : ${IMAGES_DIR}`)
  console.log(hr('─'))

  // ── Connect to MongoDB ────────────────────────────────────────────────────
  await mongoose.connect(process.env.MONGO_URI)
  console.log('  ✓ Connected to MongoDB\n')

  // Lazy-load the model AFTER mongoose connects
  const Product = require('../src/models/Product')

  // ── Count totals ──────────────────────────────────────────────────────────
  const grandTotal = await Product.countDocuments({ isActive: { $ne: false } })
  const alreadyHas = await Product.countDocuments({
    isActive:  { $ne: false },
    imageUrl:  { $exists: true, $ne: null, $ne: '' },
  })

  // Products that need images
  const products = await Product.find({
    isActive: { $ne: false },
    $or: [
      { imageUrl: { $exists: false } },
      { imageUrl: null },
      { imageUrl: '' },
    ],
  }).lean()

  const stats = {
    total:    products.length,
    uploaded: 0,
    skipped:  alreadyHas,
    failed:   0,
    missing:  0,
  }

  console.log(`  Products in database   : ${grandTotal}`)
  console.log(`  Already have image     : ${alreadyHas}`)
  console.log(`  Need image (to process): ${products.length}`)
  console.log(hr('─'))
  console.log()

  // ── Process each product ──────────────────────────────────────────────────
  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const num     = `[${pad(i + 1)}/${pad(products.length)}]`

    // Resolve representative image
    const entry = resolveImageEntry(product.name)

    if (!entry) {
      console.log(`${num} ⚠  SKIP   "${product.name}"`)
      console.log(`         No keyword match in productImageMap.js`)
      stats.missing++
      continue
    }

    // Prefer local file, fall back to remote URL
    const localPath    = path.join(IMAGES_DIR, entry.image)
    const hasLocalFile = fs.existsSync(localPath)
    const source       = hasLocalFile ? localPath : entry.remoteUrl
    const sourceLabel  = hasLocalFile ? `local › ${entry.image}` : `remote › ${entry.image}`

    console.log(`${num} ⬆  "${product.name}"`)
    console.log(`         → ${sourceLabel}`)

    try {
      const result = await uploadToCloudinary(source)

      await Product.findByIdAndUpdate(product._id, {
        imageUrl:      result.secure_url,
        imagePublicId: result.public_id,
        imageAssetId:  result.asset_id,
        imageWidth:    result.width,
        imageHeight:   result.height,
        imageFormat:   result.format,
      })

      console.log(`         ✓ Uploaded  (${result.public_id})`)
      stats.uploaded++
    } catch (err) {
      console.log(`         ✗ FAILED    ${err.message}`)
      stats.failed++
    }

    console.log()
  }

  // ── Close connection ──────────────────────────────────────────────────────
  await mongoose.disconnect()

  // ── Final report ──────────────────────────────────────────────────────────
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log()
  console.log(hr('═'))
  console.log('  MIGRATION COMPLETED')
  console.log(hr('═'))
  console.log(`  Total in scope        : ${stats.total}`)
  console.log(`  Uploaded              : ${stats.uploaded}`)
  console.log(`  Skipped (had image)   : ${stats.skipped}`)
  console.log(`  Missing image mapping : ${stats.missing}`)
  console.log(`  Failed                : ${stats.failed}`)
  console.log(`  Execution time        : ${elapsedSec}s`)
  console.log(hr('═'))

  if (stats.missing > 0) {
    console.log(`\n  ⚠  ${stats.missing} product(s) had no keyword match.`)
    console.log('     Add their keywords to server/config/productImageMap.js and re-run.')
  }
  if (stats.failed > 0) {
    console.log(`\n  ✗  ${stats.failed} upload(s) failed.`)
    console.log('     Check your Cloudinary credentials in server/.env and re-run.')
    console.log('     Already-uploaded products will be skipped on re-run.\n')
  }
}

migrate().catch(err => {
  console.error('\nFatal error:', err.message)
  process.exit(1)
})
