require('express-async-errors')
const path      = require('path')
const express   = require('express')
const cors      = require('cors')
const helmet    = require('helmet')
const morgan    = require('morgan')
const rateLimit = require('express-rate-limit')
const errorHandler = require('./middleware/errorHandler')

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes       = require('./routes/auth.routes')
const usersRoutes      = require('./routes/users.routes')
const productsRoutes   = require('./routes/products.routes')
const suppliersRoutes  = require('./routes/suppliers.routes')
const categoriesRoutes = require('./routes/categories.routes')
const salesRoutes      = require('./routes/sales.routes')
const purchasesRoutes  = require('./routes/purchases.routes')
const alertsRoutes     = require('./routes/alerts.routes')
const dashboardRoutes  = require('./routes/dashboard.routes')
const reportsRoutes    = require('./routes/reports.routes')
const inventoryRoutes  = require('./routes/inventory.routes')
const settingsRoutes   = require('./routes/settings.routes')
const unitsRoutes      = require('./routes/units.routes')
const aiRoutes         = require('./routes/ai.routes')
const chatRoutes       = require('./routes/chat.routes')
const syntheticRoutes  = require('./routes/synthetic.routes')
const analyticsRoutes  = require('./routes/analytics.routes')
const { router: aiProxy, mlRouter, AI_PREFIXES } = require('./routes/ai.proxy')

const app = express()

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Not needed for JSON API
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'none'"] },
  },
}))

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser requests (Postman, server-to-server) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Global: 300 requests per 15 minutes per IP across all API routes
const globalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, message: 'Too many requests. Please try again later.' },
})

// Auth routes: 15 requests per 15 minutes per IP (login, refresh, etc.)
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             15,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, message: 'Too many auth requests. Please try again in 15 minutes.' },
})

// ── Static: product images (cross-origin so React dev server can load them) ───
app.use(
  '/product-images',
  (_req, res, next) => { res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next() },
  express.static(path.join(__dirname, '../assets/product-images'))
)

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// ── NoSQL injection protection ────────────────────────────────────────────────
// Strip MongoDB operator keys ($gt, $where, etc.) from all user-supplied input
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) {
      delete obj[key]
    } else {
      sanitizeObject(obj[key])
    }
  }
}

app.use((req, _res, next) => {
  sanitizeObject(req.body)
  sanitizeObject(req.query)
  next()
})

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({
    success:   true,
    message:   'StockWise API is running',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
  })
})

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/',           globalLimiter)
app.use('/api/v1/auth',       authLimiter,  authRoutes)
app.use('/api/v1/users',      usersRoutes)
app.use('/api/v1/products',   productsRoutes)
app.use('/api/v1/suppliers',  suppliersRoutes)
app.use('/api/v1/categories', categoriesRoutes)
app.use('/api/v1/sales',      salesRoutes)
app.use('/api/v1/purchases',  purchasesRoutes)
app.use('/api/v1/alerts',     alertsRoutes)
app.use('/api/v1/dashboard',  dashboardRoutes)
app.use('/api/v1/reports',    reportsRoutes)
app.use('/api/v1/inventory',  inventoryRoutes)
app.use('/api/v1/settings',   settingsRoutes)
app.use('/api/v1/units',      unitsRoutes)
app.use('/api/v1/ai',         aiRoutes)
app.use('/api/v1/ai',         chatRoutes)
app.use('/api/v1/synthetic',  syntheticRoutes)
app.use('/api/v1/analytics',  analyticsRoutes)

// ── AI Service Proxy ──────────────────────────────────────────────────────────
AI_PREFIXES.forEach(prefix => {
  app.use(`/api/v1/${prefix}`, aiProxy)
})

// ML forecasting proxy: /api/v1/ml/* → FastAPI /api/ai/ml/*
app.use('/api/v1/ml', mlRouter)

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler)

module.exports = app
