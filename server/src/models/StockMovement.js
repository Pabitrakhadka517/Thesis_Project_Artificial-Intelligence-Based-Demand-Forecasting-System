const mongoose = require('mongoose')

const stockMovementSchema = new mongoose.Schema(
  {
    product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, maxlength: [300, 'Product name too long'] },
    type: {
      type:     String,
      enum:     ['purchase', 'sale', 'adjustment', 'return', 'waste', 'transfer'],
      required: true,
    },
    // positive = stock in, negative = stock out
    quantity:    { type: Number, required: true },
    stockBefore: { type: Number, min: [0, 'Stock before cannot be negative'] },
    stockAfter:  { type: Number, min: [0, 'Stock after cannot be negative'] },

    // Polymorphic reference: Sale._id, Purchase._id, or null for manual adjustments.
    // Always set referenceType alongside referenceId so populate() can resolve it.
    referenceType: { type: String, enum: ['Sale', 'Purchase'], default: null },
    referenceId:   { type: mongoose.Schema.Types.ObjectId, refPath: 'referenceType', default: null },
    reference:     { type: String, maxlength: [100, 'Reference string too long'] }, // human-readable INV/PO number

    notes:      { type: String, maxlength: [500, 'Notes too long'] },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date:       { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// Primary per-product history query — always sorted by date descending
stockMovementSchema.index({ product: 1, date: -1 })

// Per-product filtered by type (e.g. "all sales of product X")
stockMovementSchema.index({ product: 1, type: 1, date: -1 })

// Global movement type report (e.g. all waste events in last 30 days)
stockMovementSchema.index({ type: 1, date: -1 })

// Audit: "all adjustments made by this user"
stockMovementSchema.index({ recordedBy: 1, date: -1 })

// Lookup by originating sale or purchase document
stockMovementSchema.index({ referenceId: 1 }, { sparse: true })

module.exports = mongoose.model('StockMovement', stockMovementSchema)
