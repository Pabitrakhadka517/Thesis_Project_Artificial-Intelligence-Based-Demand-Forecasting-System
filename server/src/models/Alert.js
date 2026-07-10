const mongoose = require('mongoose')

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['low_stock', 'out_of_stock', 'overstock', 'expiry', 'reorder', 'forecast_change', 'supplier_delay'],
      required: true,
    },
    priority:    { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    title:       { type: String, required: true, maxlength: [300, 'Alert title too long'] },
    message:     { type: String, required: true, maxlength: [1000, 'Alert message too long'] },
    product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, maxlength: [300, 'Product name too long'] },

    isRead:          { type: Boolean, default: false },
    isAcknowledged:  { type: Boolean, default: false },
    acknowledgedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt:  Date,

    isResolved:      { type: Boolean, default: false },
    resolvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt:      Date,

    metadata:  mongoose.Schema.Types.Mixed,
    expiresAt: Date,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
)

// Derived lifecycle status for the UI — active → acknowledged → resolved.
alertSchema.virtual('status').get(function () {
  if (this.isResolved)      return 'resolved'
  if (this.isAcknowledged)  return 'acknowledged'
  return 'active'
})

// ── Indexes ────────────────────────────────────────────────────────────────────

// Primary alert inbox: unread alerts, most urgent first, then newest
alertSchema.index({ isRead: 1, priority: 1, createdAt: -1 })

// Simple unread list (no priority filter) — kept because inbox often omits priority
alertSchema.index({ isRead: 1, createdAt: -1 })

// "All alerts for this product" panel, plus a hard constraint: at most one
// OPEN (unacknowledged) alert per product+type. Without this, two concurrent
// paths (e.g. a manual scan and a purchase receipt both flagging the same
// product as overstocked) can race and create duplicate alerts — this index
// makes that impossible at the database level instead of relying on
// check-then-insert application code.
alertSchema.index(
  { product: 1, type: 1 },
  { unique: true, partialFilterExpression: { isAcknowledged: false, product: { $exists: true } } }
)

// Unacknowledged alerts by type (bulk-acknowledge workflow)
alertSchema.index({ isAcknowledged: 1, type: 1 })

// Additional single-field indexes for standalone filter queries
alertSchema.index({ priority: 1 })
alertSchema.index({ type: 1 })

// TTL — document is auto-deleted when expiresAt is reached (expiresAt: 0 means "at that moment")
alertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true })

module.exports = mongoose.model('Alert', alertSchema)
