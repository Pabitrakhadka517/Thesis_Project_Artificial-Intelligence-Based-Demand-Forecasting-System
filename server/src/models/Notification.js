const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:   { type: String, required: true, maxlength: [300, 'Notification title too long'] },
    message: { type: String, maxlength: [1000, 'Notification message too long'] },
    type:    { type: String, enum: ['info', 'warning', 'error', 'success'], default: 'info' },
    isRead:  { type: Boolean, default: false },
    link:    { type: String, maxlength: [2000, 'Link URL too long'] },

    // Optional TTL — set to `new Date(Date.now() + N_days_ms)` on creation for
    // auto-cleanup.  Leave null to keep indefinitely (e.g. for important alerts).
    // Recommended default: 30 days for routine notifications.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// Primary notification bell query: user's unread notifications, newest first
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 })

// TTL auto-delete (sparse: null expiresAt means keep indefinitely)
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true })

module.exports = mongoose.model('Notification', notificationSchema)
