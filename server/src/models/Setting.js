const mongoose = require('mongoose')

const settingSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true, unique: true, maxlength: [200, 'Setting key too long'] },
    value: mongoose.Schema.Types.Mixed,
    group: { type: String, default: 'general', maxlength: [100, 'Group name too long'] },
    label: { type: String, maxlength: [300, 'Label too long'] },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// "Get all settings in the 'notifications' group" — used by settings page sections
settingSchema.index({ group: 1 })

module.exports = mongoose.model('Setting', settingSchema)
