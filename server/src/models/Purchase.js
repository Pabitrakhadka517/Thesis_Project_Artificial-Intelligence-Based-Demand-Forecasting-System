const mongoose = require('mongoose')

const purchaseItemSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, maxlength: [300, 'Product name too long'] },
  sku:         { type: String, maxlength: [100, 'SKU too long'] },
  quantity:    { type: Number, required: true, min: [1,  'Quantity must be at least 1'] },
  buyingPrice: { type: Number, required: true, min: [0,  'Buying price cannot be negative'] },
  total:       { type: Number, required: true, min: [0,  'Line total cannot be negative'] },
})

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, unique: true },
    supplier:       { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items:          { type: [purchaseItemSchema], validate: [v => v.length > 0, 'Purchase must have at least one item'] },

    subtotal:      { type: Number, required: true, min: [0, 'Subtotal cannot be negative'] },
    discount:      { type: Number, default: 0,     min: [0, 'Discount cannot be negative'] },
    grandTotal:    { type: Number, required: true, min: [0, 'Grand total cannot be negative'] },

    paymentStatus:  { type: String, enum: ['paid', 'partial', 'pending'], default: 'pending' },
    paymentMethod:  { type: String, enum: ['cash', 'bank_transfer', 'cheque', 'credit'], default: 'cash' },
    purchaseDate:   { type: Date, default: Date.now },
    deliveryDate:   { type: Date, default: null },
    status:         { type: String, enum: ['ordered', 'received', 'cancelled', 'partial'], default: 'ordered' },
    notes:          { type: String, maxlength: [1000, 'Notes too long'] },
    recordedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

// Same atomic counter pattern as Sale.invoiceNumber — see that model for rationale.
purchaseSchema.pre('save', async function (next) {
  if (!this.purchaseNumber) {
    const Counter = require('./Counter')
    const seq = await Counter.next('purchase')
    this.purchaseNumber = `PO-${String(seq).padStart(5, '0')}`
  }
  next()
})

// ── Indexes ────────────────────────────────────────────────────────────────────

// Primary time-series queries
purchaseSchema.index({ purchaseDate: -1 })
purchaseSchema.index({ status: 1, purchaseDate: -1 })

// "Supplier order history" — most common supplier-scoped query includes date sort
purchaseSchema.index({ supplier: 1, purchaseDate: -1 })

// Outstanding payments dashboard — filters by paymentStatus, sorted by date
purchaseSchema.index({ paymentStatus: 1, purchaseDate: -1 })

// Supplier + status (open orders per supplier)
purchaseSchema.index({ supplier: 1, status: 1 })

// Expected delivery monitoring (sparse: not all orders have a deliveryDate)
purchaseSchema.index({ deliveryDate: 1 }, { sparse: true })

// Product-level purchase lookup
purchaseSchema.index({ 'items.product': 1 })

module.exports = mongoose.model('Purchase', purchaseSchema)
