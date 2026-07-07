const axios       = require('axios')
const ChatHistory = require('../models/ChatHistory')
const { success, error } = require('../utils/response')

const AI_BASE    = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const AI_TIMEOUT = 90_000   // 90 s — LLM calls can be slow

// ── helpers ───────────────────────────────────────────────────────────────────

async function callAI(path, method = 'GET', data = null, role = 'staff') {
  try {
    const res = await axios({
      method,
      url:     `${AI_BASE}${path}`,
      data,
      timeout: AI_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role':  role,
      },
    })
    return { data: res.data, offline: false }
  } catch (err) {
    return { data: null, offline: true, detail: err.response?.data?.detail || err.message }
  }
}

// ── POST /ai/chat ─────────────────────────────────────────────────────────────
exports.chat = async (req, res) => {
  const { message, session_id } = req.body
  if (!message?.trim()) return error(res, 'Message is required', 400)

  const userId   = req.user._id
  const userRole = req.user.role || 'staff'

  // Save user turn to MongoDB history
  await ChatHistory.findOneAndUpdate(
    { user: userId },
    {
      $push: {
        messages: {
          $each:  [{ role: 'user', content: message.trim() }],
          $slice: -200,
        },
      },
    },
    { upsert: true }
  )

  // Forward to FastAPI — include session_id for conversation memory
  const { data: aiData, offline, detail } = await callAI(
    '/api/ai/chat',
    'POST',
    {
      message:    message.trim(),
      user_role:  userRole,
      session_id: session_id || null,
    },
    userRole
  )

  if (offline) {
    // Return a helpful offline message rather than a bare 503
    return success(res, {
      response: (
        "## ⚠️ AI Service Temporarily Unavailable\n\n" +
        "The AI assistant cannot be reached right now. This is usually temporary.\n\n" +
        "**In the meantime:**\n" +
        "- Check the **Dashboard** for stock status\n" +
        "- Go to **Inventory** to see low-stock alerts\n" +
        "- Visit the **Reports** page for sales analytics\n\n" +
        `*Technical detail: ${detail || 'Connection refused'}*`
      ),
      insights:        [],
      recommendations: [],
      intent:          'general',
      source:          'offline',
      session_id:      session_id || null,
      offline:         true,
    })
  }

  const aiResult        = aiData?.data || aiData
  const responseText    = aiResult?.response        || 'No response received from AI.'
  const insights        = aiResult?.insights        || []
  const recommendations = aiResult?.recommendations || []
  const intent          = aiResult?.intent          || 'general'
  const source          = aiResult?.source          || 'local'
  const returnedSession = aiResult?.session_id      || session_id || null

  // Save assistant turn
  await ChatHistory.findOneAndUpdate(
    { user: userId },
    {
      $push: {
        messages: {
          $each: [{
            role:            'assistant',
            content:         responseText,
            insights,
            recommendations,
          }],
          $slice: -200,
        },
      },
    }
  )

  return success(res, {
    response:        responseText,
    insights,
    recommendations,
    intent,
    source,
    session_id:      returnedSession,
    offline:         false,
  })
}

// ── POST /ai/session ──────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
  const { data, offline } = await callAI('/api/ai/chat/session', 'POST', {})
  if (offline) {
    // crypto.randomUUID() is built into Node.js 14.17+ — no extra dependency needed
    return success(res, { session_id: require('crypto').randomUUID(), offline: true })
  }
  return success(res, { session_id: data?.session_id || null })
}

// ── GET /ai/suggestions ───────────────────────────────────────────────────────
exports.getSuggestions = async (req, res) => {
  const role = req.user.role || 'staff'
  const { data, offline } = await callAI('/api/ai/chat/suggestions', 'GET', null, role)

  if (offline) {
    return success(res, {
      suggestions: [
        'Which products are low in stock?',
        'What should I purchase today?',
        'Show inventory health summary.',
        'Which products sold the most this month?',
        'Are there any active alerts?',
      ],
      offline: true,
    })
  }

  return success(res, { suggestions: data?.data || [], offline: false })
}

// ── GET /ai/insights ──────────────────────────────────────────────────────────
exports.getInsights = async (req, res) => {
  const { data, offline } = await callAI('/api/ai/chat/insights', 'GET', null, req.user.role)

  if (offline) {
    return success(res, { insights: [], offline: true })
  }

  return success(res, { insights: data?.data || [], offline: false })
}

// ── GET /ai/history ───────────────────────────────────────────────────────────
exports.getHistory = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)

  const doc = await ChatHistory.findOne({ user: req.user._id }).lean()
  if (!doc) return success(res, { messages: [], total: 0 })

  const messages = (doc.messages || []).slice(-limit)
  return success(res, { messages, total: doc.messages?.length || 0 })
}

// ── DELETE /ai/history ────────────────────────────────────────────────────────
exports.clearHistory = async (req, res) => {
  await ChatHistory.findOneAndUpdate(
    { user: req.user._id },
    { $set: { messages: [] } }
  )
  return success(res, {}, 'Chat history cleared')
}
