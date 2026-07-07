'use strict'
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })
const mongoose = require('mongoose')
const Product  = require('../src/models/Product')

async function run() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('Connected')

  const result = await Product.updateMany(
    { image: { $regex: '\\.jpg$' } },
    [{ $set: { image: { $replaceOne: { input: '$image', find: '.jpg', replacement: '.png' } } } }]
  )
  console.log(`Updated ${result.modifiedCount} products (.jpg → .png)`)
  await mongoose.disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
