const express = require('express')
const axios   = require('axios')
const { protect } = require('../middleware/auth')
const { managerOrAdmin } = require('../middleware/authorize')

const AI_BASE = process.env.AI_SERVICE_URL || 'http://localhost:8000'

const AI_PREFIXES = ['prophet', 'rf', 'lstm', 'recommendations', 'optimization', 'forecasting', 'models', 'skus']

// ── Generic proxy (existing prefixes) ────────────────────────────────────────
// req.path is the portion after the mount point, e.g. /predict/SYN-PF-001
// Reads (GET) stay open to any authenticated role — staff legitimately reads
// /skus and /recommendations. Writes (train/retrain/generate/delete — the
// expensive, mutating operations) require manager/admin.
const router = express.Router()
router.use(protect)
router.use((req, res, next) => (req.method === 'GET' ? next() : managerOrAdmin(req, res, next)))

router.all('*', async (req, res) => {
  const target = `${AI_BASE}${req.path}`
  try {
    const response = await axios({
      method:  req.method,
      url:     target,
      params:  req.query,
      data:    req.body,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id':    req.user?._id?.toString() || '',
        'X-User-Role':  req.user?.role || '',
      },
      timeout: 30000,
    })
    return res.status(response.status).json(response.data)
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data)
    return res.status(503).json({ success: false, message: 'AI service is unavailable.' })
  }
})

// ── ML proxy (/api/v1/ml/* → http://AI_BASE/api/ai/ml/*) ─────────────────────
// Training (LSTM) can take several minutes — use a 10-minute timeout.
// Only used by the admin/manager Forecasting & Models pages (staff has no
// route to them) — restricted to manager/admin so a staff account can't
// trigger repeated multi-minute retrains.
const mlRouter = express.Router()
mlRouter.use(protect, managerOrAdmin)

mlRouter.all('*', async (req, res) => {
  const target = `${AI_BASE}/api/ai/ml${req.path}`
  try {
    const response = await axios({
      method:  req.method,
      url:     target,
      params:  req.query,
      data:    req.body,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id':    req.user?._id?.toString() || '',
        'X-User-Role':  req.user?.role || '',
      },
      timeout: 600000,   // 10 min — LSTM training can be slow
    })
    return res.status(response.status).json(response.data)
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data)
    return res.status(503).json({ success: false, message: 'AI service is unavailable.' })
  }
})

module.exports = { router, mlRouter, AI_PREFIXES }
