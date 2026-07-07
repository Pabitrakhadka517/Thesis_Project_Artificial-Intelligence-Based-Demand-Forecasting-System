const mongoose = require('mongoose')

const saleItemSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, maxlength: [300, 'Product name too long'] },
  sku:         { type: String, maxlength: [100, 'SKU too long'] },
  quantity:    { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
  unitPrice:   { type: Number, required: true, min: [0, 'Unit price cannot be negative'] },
  // Cost price snapshotted at the time of sale — ensures COGS / profit calculations
  // remain accurate even if the product's buyingPrice changes later.
  buyingPrice: { type: Number, min: [0, 'Buying price cannot be negative'], default: 0 },
  total:       { type: Number, required: true, min: [0, 'Line total cannot be negative'] },
})

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true },
    items:         { type: [saleItemSchema], validate: [v => v.length > 0, 'Sale must have at least one item'] },

    subtotal:   { type: Number, required: true, min: [0, 'Subtotal cannot be negative'] },
    discount:   { type: Number, default: 0, min: [0, 'Discount cannot be negative'] },
    tax:        { type: Number, default: 0, min: [0, 'Tax cannot be negative'] },
    grandTotal: { type: Number, required: true, min: [0, 'Grand total cannot be negative'] },

    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'qr', 'credit'],
      default: 'cash',
    },
    customerName:  { type: String, maxlength: [200, 'Customer name too long'] },
    customerPhone: { type: String, maxlength: [30,  'Customer phone too long'] },
    notes:         { type: String, maxlength: [1000, 'Notes too long'] },
    saleDate:      { type: Date, default: Date.now },
    recordedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status:        { type: String, enum: ['completed', 'refunded', 'void'], default: 'completed' },
  },
  { timestamps: true }
)

// Auto-generate invoice number via atomic counter.
// countDocuments() was non-atomic: two concurrent creates could both receive
// the same N, producing duplicate numbers.  Counter.next() uses a server-side
// $inc — guaranteed unique with no possibility of collision.
saleSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const Counter = require('./Counter')
    const seq = await Counter.next('invoice')
    this.invoiceNumber = `INV-${String(seq).padStart(5, '0')}`
  }
  next()
})

// ── Indexes ────────────────────────────────────────────────────────────────────

// Primary time-series queries
saleSchema.index({ saleDate: -1 })
saleSchema.index({ status: 1, saleDate: -1 })

// "Sales by cashier" report — date sort included to avoid in-memory sort
saleSchema.index({ recordedBy: 1, saleDate: -1 })

// Product-level sales lookup (e.g. "how many times was product X sold?")
saleSchema.index({ 'items.product': 1 })

// Payment method breakdown in reports
saleSchema.index({ paymentMethod: 1 })

// Customer history by phone (sparse: not all sales have a customerPhone)
saleSchema.index({ customerPhone: 1 }, { sparse: true })

module.exports = mongoose.model('Sale', saleSchema)
