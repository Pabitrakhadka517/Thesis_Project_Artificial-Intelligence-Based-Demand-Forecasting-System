const mongoose = require('mongoose')

const unitSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Unit name is required'],
      unique:    true,
      trim:      true,
      maxlength: [100, 'Unit name too long'],
    },
    symbol: {
      type:      String,
      required:  [true, 'Unit symbol is required'],
      unique:    true,
      trim:      true,
      maxlength: [20, 'Unit symbol too long'],
    },
    unitType: {
      type:     String,
      enum:     ['weight', 'volume', 'count'],
      required: [true, 'Unit type is required'],
    },
    description:      { type: String, maxlength: [500, 'Description too long'] },
    baseUnit:         { type: String, maxlength: [100, 'Base unit name too long'] },
    conversionFactor: { type: Number, default: 1, min: [0, 'Conversion factor must be positive'] },
    isActive:         { type: Boolean, default: true },
    isSystem:         { type: Boolean, default: false },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// "List all weight units that are active" — the typical unit picker query
unitSchema.index({ unitType: 1, isActive: 1 })

module.exports = mongoose.model('Unit', unitSchema)
