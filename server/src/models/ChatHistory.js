const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    role:    { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 8000 },
    // Shapes come from the Python AI service and vary — kept as untyped arrays
    // to avoid validation failures when the AI response schema evolves.
    insights:        { type: Array, default: [] },
    recommendations: { type: Array, default: [] },
  },
  { _id: false, timestamps: { createdAt: 'timestamp', updatedAt: false } }
)

const chatHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Kept to ≤ 200 messages via $push $slice: -200 in the chat controller.
    // Each message is ≤ 8 KB (content maxlength 8000), so 200 messages ≈ 1.6 MB —
    // well within MongoDB's 16 MB document limit.
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// One document per user — unique enforces the single-document-per-user invariant
chatHistorySchema.index({ user: 1 }, { unique: true })

module.exports = mongoose.model('ChatHistory', chatHistorySchema)
