const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    // Snapshot of email at the time of the action — preserved even if user is later
    // soft-deleted or their email changes.  Never update this retroactively.
    userEmail:  { type: String, maxlength: [254, 'Email too long'] },
    action:     { type: String, required: true, maxlength: [100, 'Action string too long'] },
    resource:   { type: String, maxlength: [100, 'Resource name too long'] },
    resourceId: { type: String, maxlength: [100, 'Resource ID too long'] },
    details:    mongoose.Schema.Types.Mixed,
    ip:         { type: String, maxlength: [45,  'IP address too long'] }, // supports IPv6
    userAgent:  { type: String, maxlength: [500, 'User agent too long'] },
    status: {
      type:    String,
      enum:    ['success', 'failure'],
      default: 'success',
    },

    // Optional TTL field — set to `new Date(Date.now() + N_days_ms)` when creating
    // the log entry if you want automatic expiry.  Leave null to retain indefinitely.
    // Recommended: 90–365 days depending on compliance requirements.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// Primary time-series audit view (all logs, newest first)
auditLogSchema.index({ createdAt: -1 })

// Per-user audit trail
auditLogSchema.index({ user: 1, createdAt: -1 })

// Entity-level audit trail: "show all changes to product X"
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 })

// Security review: "show all failed login attempts"
auditLogSchema.index({ action: 1, status: 1 })

// TTL — auto-delete when expiresAt is reached (sparse: null means keep forever)
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true })

module.exports = mongoose.model('AuditLog', auditLogSchema)
