const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
  {
    sku:     { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: [100, 'SKU too long'] },
    barcode: {
      type: String, trim: true, maxlength: [100, 'Barcode too long'],
      // No default — documents without a barcode must NOT have the field at all.
      // Sparse unique index excludes missing fields; null is still indexed, so
      // storing null would cause a duplicate-key collision across barcodes-less products.
      set: v => (typeof v === 'string' ? v.trim() || undefined : undefined),
    },
    name:    { type: String, required: true, trim: true, maxlength: [300, 'Product name too long'] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    brand:    { type: String, trim: true, maxlength: [150, 'Brand name too long'] },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    unit:     { type: String, trim: true, default: 'kg', maxlength: [50, 'Unit name too long'] },

    buyingPrice:  { type: Number, required: true, min: [0, 'Buying price cannot be negative'] },
    sellingPrice: { type: Number, required: true, min: [0, 'Selling price cannot be negative'] },

    minStock:     { type: Number, default: 0,  min: [0, 'Min stock cannot be negative'] },
    // 0 = unlimited / not configured — avoids the misleading 9999 magic default
    maxStock:     { type: Number, default: 0,  min: [0, 'Max stock cannot be negative'] },
    reorderLevel: { type: Number, default: 10, min: [0, 'Reorder level cannot be negative'] },
    currentStock: { type: Number, default: 0,  min: [0, 'Stock cannot be negative'] },

    storageLocation: { type: String, trim: true, maxlength: [200, 'Storage location too long'] },
    expiryDate:      Date,
    description:     { type: String, maxlength: [2000, 'Description cannot exceed 2000 characters'] },
    leadTimeDays:    { type: Number, default: 7, min: [0, 'Lead time cannot be negative'] },

    // ── Local image path (primary) ────────────────────────────────────────────
    image:         { type: String, default: '' },
    // ── Cloudinary image metadata ─────────────────────────────────────────────
    imageUrl:      String,
    imagePublicId: String,
    imageAssetId:  String,
    imageFormat:   String,
    imageWidth:    { type: Number, min: 0 },
    imageHeight:   { type: Number, min: 0 },

    isPerishable: { type: Boolean, default: false },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

// ── Virtuals ──────────────────────────────────────────────────────────────────

productSchema.virtual('stockStatus').get(function () {
  if (this.currentStock <= 0)                    return 'out_of_stock'
  if (this.currentStock <= this.minStock)         return 'critical'
  if (this.currentStock <= this.reorderLevel)     return 'low'
  // maxStock 0 means "not configured", skip overstock check in that case
  if (this.maxStock > 0 && this.currentStock >= this.maxStock * 0.9) return 'overstock'
  return 'healthy'
})

productSchema.virtual('stockValue').get(function () {
  return this.currentStock * this.buyingPrice
})

// ── Indexes ────────────────────────────────────────────────────────────────────

// Full-text search across name, SKU, brand, description
productSchema.index({ name: 'text', sku: 'text', brand: 'text', description: 'text' })

// Barcode lookup (sparse: null barcodes don't consume the unique index)
productSchema.index({ barcode: 1 }, { unique: true, sparse: true })

// Single-field filters
productSchema.index({ category: 1 })
productSchema.index({ supplier: 1 })
productSchema.index({ currentStock: 1 })
productSchema.index({ isActive: 1 })
productSchema.index({ expiryDate: 1 }, { sparse: true })

// Combined filters used in product list query (isActive almost always included)
productSchema.index({ isActive: 1, category: 1 })
productSchema.index({ isActive: 1, supplier: 1 })
productSchema.index({ isActive: 1, currentStock: 1 })

// Expiry monitoring — perishables near expiry that are still active
productSchema.index({ isActive: 1, isPerishable: 1, expiryDate: 1 }, { sparse: true })

module.exports = mongoose.model('Product', productSchema)
