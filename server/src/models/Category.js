const mongoose = require('mongoose')

const categorySchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Category name is required'],
      unique:    true,
      trim:      true,
      maxlength: [150, 'Category name cannot exceed 150 characters'],
    },
    description:   { type: String, maxlength: [500, 'Description cannot exceed 500 characters'] },
    imageUrl:      String,
    imagePublicId: String,
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// Category list queries always filter by isActive; name sort is common
categorySchema.index({ isActive: 1, name: 1 })

module.exports = mongoose.model('Category', categorySchema)
