require('dotenv').config()

// ── Startup environment validation ────────────────────────────────────────────
// Hard-fail on missing auth/DB secrets — nothing works without these.
const REQUIRED_ENV = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']
const missingEnv   = REQUIRED_ENV.filter((k) => !process.env[k])
if (missingEnv.length) {
  console.error(`[Startup] Missing required environment variables: ${missingEnv.join(', ')}`)
  console.error('[Startup] Create a .env file based on .env.example and restart.')
  process.exit(1)
}

// Warn (not fail) about missing email vars — dev Ethereal fallback handles it gracefully.
const EMAIL_ENV    = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM']
const missingEmail = EMAIL_ENV.filter((k) => !process.env[k])
if (missingEmail.length && process.env.NODE_ENV === 'production') {
  console.warn(`[Startup] Email vars not set: ${missingEmail.join(', ')} — email sending will be disabled.`)
}

const connectDB              = require('./config/db')
const app                    = require('./app')
const { verifyEmailService } = require('./services/email.service')

const PORT = process.env.PORT || 5000

const start = async () => {
  await connectDB()

  // Non-blocking SMTP health check (logs warnings; never blocks startup)
  verifyEmailService().catch(() => {})

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║   StockWise API Server                       ║
║   http://localhost:${PORT}                       ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(28)}║
╚══════════════════════════════════════════════╝
    `)
  })
}

start().catch((err) => {
  console.error('[Startup] Failed to start server:', err)
  process.exit(1)
})
