const mongoose = require('mongoose')

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Supplier name is required'],
      trim:      true,
      maxlength: [200, 'Supplier name cannot exceed 200 characters'],
    },
    contactPerson: { type: String, trim: true, maxlength: [150, 'Contact person name too long'] },
    phone:         { type: String, trim: true, maxlength: [30,  'Phone number too long'] },
    email: {
      type:      String,
      trim:      true,
      lowercase: true,
      maxlength: [254, 'Email too long'],
      match:     [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    address:      { type: String, trim: true, maxlength: [500, 'Address too long'] },
    district:     { type: String, trim: true, maxlength: [100, 'District name too long'], default: 'Kathmandu' },
    leadTimeDays: { type: Number, default: 7, min: [0, 'Lead time cannot be negative'] },
    paymentTerms: {
      type:    String,
      enum:    ['cash', 'credit_15', 'credit_30', 'credit_60'],
      default: 'cash',
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // null = no rating yet; populated once real purchase history exists
    rating: { type: Number, min: 1, max: 5, default: null },
    notes:  { type: String, maxlength: [1000, 'Notes too long'] },

    // Denormalized running total — updated atomically with $inc on purchase receive.
    // If drift is ever detected, recalculate via: Purchase.aggregate summing grandTotal
    // for this supplier where status !== 'cancelled'.
    totalPurchases: { type: Number, default: 0, min: 0 },
    lastOrderDate:  { type: Date, default: null },

    // ── Cloudinary logo ────────────────────────────────────────────────────────
    logo:         { type: String, default: null },
    logoPublicId: { type: String, default: null },
    logoAssetId:  { type: String, default: null },
    logoFormat:   { type: String, default: null },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// Full-text search on name
supplierSchema.index({ name: 'text' })

// Supplier name must be unique — prevents duplicate entries for the same vendor.
// If migrating an existing collection, first run: db.suppliers.aggregate([...]) to
// find and merge duplicates, then create this index.
supplierSchema.index({ name: 1 }, { unique: true })

// Primary list query: filter by status, sort by name
supplierSchema.index({ status: 1, name: 1 })

// Filter by geographic region
supplierSchema.index({ district: 1 })

// Sort suppliers by most recently ordered (dashboard ranking)
supplierSchema.index({ lastOrderDate: -1 }, { sparse: true })

module.exports = mongoose.model('Supplier', supplierSchema)
