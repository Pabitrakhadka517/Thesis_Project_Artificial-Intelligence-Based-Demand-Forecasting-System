'use strict'

/**
 * updateProductImages.js
 *
 * One-time migration: assigns a local image path to every product
 * that currently has no `image` field set.
 *
 * Usage:
 *   node server/scripts/updateProductImages.js
 *
 * Safe to re-run — products that already have `image` set are skipped.
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const mongoose       = require('mongoose')
const getProductImage = require('../utils/productImageMapper')

async function run() {
  const start = Date.now()

  await mongoose.connect(process.env.MONGO_URI)
  console.log('Connected to MongoDB\n')

  // Lazy-load model after connect
  const Product = require('../src/models/Product')

  // Fetch every active product (including those already with image — we only update empties)
  const products = await Product.find({ isActive: { $ne: false } }).lean()

  let updated  = 0
  let skipped  = 0
  let failed   = 0

  for (const p of products) {
    // Skip if already assigned
    if (p.image) {
      skipped++
      continue
    }

    const image = getProductImage(p.name)

    try {
      await Product.findByIdAndUpdate(p._id, { image })
      console.log(`Updated  ${p.name}  →  ${image}`)
      updated++
    } catch (err) {
      console.error(`Failed   ${p.name}  —  ${err.message}`)
      failed++
    }
  }

  await mongoose.disconnect()

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log('\n' + '='.repeat(52))
  console.log(`  Total products   : ${products.length}`)
  console.log(`  Updated          : ${updated}`)
  console.log(`  Skipped (had img): ${skipped}`)
  console.log(`  Failed           : ${failed}`)
  console.log(`  Time             : ${elapsed}s`)
  console.log('='.repeat(52))
  console.log(`\n  ${updated} products updated successfully.`)
}

run().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
