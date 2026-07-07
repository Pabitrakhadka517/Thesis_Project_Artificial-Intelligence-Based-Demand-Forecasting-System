const mongoose = require('mongoose')

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI, {
    dbName: 'stockwise',
  })
  console.log(`MongoDB connected: ${conn.connection.host}`)

  // Migration: remove the barcode field from any product where it is null or "".
  // The sparse unique index only skips *missing* fields — null IS indexed, so
  // products with barcode: null conflict with each other. Unsetting the field
  // removes those docs from the index entirely.
  try {
    const Product = require('../models/Product')
    const result = await Product.updateMany(
      { barcode: { $in: [null, ''] } },
      { $unset: { barcode: 1 } }
    )
    if (result.modifiedCount > 0) {
      console.log(`[DB Migration] Unset stale barcode field on ${result.modifiedCount} product(s)`)
    }
  } catch (e) {
    console.warn('[DB Migration] Barcode cleanup failed (non-fatal):', e.message)
  }
}

module.exports = connectDB
