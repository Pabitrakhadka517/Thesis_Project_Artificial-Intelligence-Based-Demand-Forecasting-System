'use strict'

const fs         = require('fs')
const path       = require('path')
const nodemailer = require('nodemailer')

const IS_DEV = process.env.NODE_ENV !== 'production'

// Cache Ethereal test-account credentials between restarts (dev only)
// __dirname = server/src/services  →  ../../  = server/
const ETHEREAL_CACHE = path.join(__dirname, '../../.ethereal.json')

// ── Config ────────────────────────────────────────────────────────────────────

const PLACEHOLDER_VALUES = [
  'your_email', 'your_', 'change_me', 'placeholder', 'example.com', 'enter_',
]

function isPlaceholder(v) {
  if (!v) return true
  const l = v.toLowerCase()
  return PLACEHOLDER_VALUES.some((p) => l.includes(p))
}

function getEmailConfig() {
  const {
    EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE,
    EMAIL_USER, EMAIL_PASS, EMAIL_FROM,
    FRONTEND_URL, CLIENT_URL,
  } = process.env

  const missing = []
  if (!EMAIL_HOST) missing.push('EMAIL_HOST')
  if (!EMAIL_USER) missing.push('EMAIL_USER')
  if (!EMAIL_PASS) missing.push('EMAIL_PASS')
  if (!EMAIL_FROM) missing.push('EMAIL_FROM')

  const hasPlaceholders = isPlaceholder(EMAIL_USER) || isPlaceholder(EMAIL_PASS)
  const configured      = missing.length === 0 && !hasPlaceholders
  const port            = parseInt(EMAIL_PORT || '587')
  const secure          = EMAIL_SECURE === 'true' || port === 465

  return {
    host:        EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure,
    user:        EMAIL_USER,
    pass:        EMAIL_PASS,
    from:        EMAIL_FROM || 'StockWise <noreply@stockwise.com>',
    frontendUrl: FRONTEND_URL || CLIENT_URL || 'http://localhost:5173',
    missing,
    hasPlaceholders,
    configured,
  }
}

// ── Singleton SMTP transporter ────────────────────────────────────────────────

let _transporter = null

function buildTransporter(cfg) {
  return nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: !IS_DEV },
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     15_000,
  })
}

function getTransporter() {
  if (_transporter) return _transporter
  const cfg = getEmailConfig()
  if (!cfg.configured) return null
  _transporter = buildTransporter(cfg)
  return _transporter
}

function resetTransporter() { _transporter = null }

// ── Ethereal dev transport ────────────────────────────────────────────────────
// Nodemailer's built-in Ethereal service gives a real SMTP sandbox with a
// web preview — no sign-up or real credentials required.

let _etherealTransporter = null

async function getEtherealTransporter() {
  if (_etherealTransporter) return _etherealTransporter

  let account
  try {
    account = JSON.parse(fs.readFileSync(ETHEREAL_CACHE, 'utf8'))
    console.log(`[Email] Ethereal: using cached account (${account.user})`)
  } catch {
    try {
      account = await nodemailer.createTestAccount()
      fs.writeFileSync(ETHEREAL_CACHE, JSON.stringify(account, null, 2))
      console.log(`[Email] Ethereal: created test account (${account.user})`)
      console.log('[Email] View sent mail at https://ethereal.email')
    } catch (err) {
      console.warn(`[Email] Ethereal setup failed: ${err.message}`)
      return null
    }
  }

  _etherealTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: account.user, pass: account.pass },
  })
  return _etherealTransporter
}

// ── Error classification ──────────────────────────────────────────────────────

function classifySmtpError(smtpErr) {
  const msg  = (smtpErr.message || '').toLowerCase()
  const code = smtpErr.responseCode || smtpErr.code || ''

  if (
    code === 535 ||
    msg.includes('username and password not accepted') ||
    msg.includes('invalid login') ||
    msg.includes('authentication') ||
    msg.includes('credentials')
  ) {
    const err  = new Error('SMTP authentication failed. Check EMAIL_USER and EMAIL_PASS in your .env file.')
    err.code   = 'SMTP_AUTH_FAILED'
    err.status = 503
    return err
  }

  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) {
    const err  = new Error('Email service is unreachable. Check EMAIL_HOST and EMAIL_PORT.')
    err.code   = 'SMTP_CONN_ERROR'
    err.status = 503
    return err
  }

  const err  = new Error(`Failed to send email: ${smtpErr.message}`)
  err.code   = 'SMTP_SEND_FAILED'
  err.status = 500
  return err
}

function logDevResetLink(to, resetUrl) {
  const line = '─'.repeat(64)
  console.log(`\n${line}`)
  console.log('  DEV MODE — no email service available, reset link below')
  console.log(`  To   : ${to}`)
  console.log(`  Link : ${resetUrl}`)
  console.log(`${line}\n`)
}

// ── Email templates ───────────────────────────────────────────────────────────

function buildPasswordResetEmail({ fullName, resetUrl, expiryMinutes }) {
  const year = new Date().getFullYear()

  const text = [
    `Hi ${fullName},`,
    '',
    'We received a request to reset your StockWise password.',
    `Use the link below — it expires in ${expiryMinutes} minutes:`,
    '',
    resetUrl,
    '',
    "If you didn't request a password reset, please ignore this email.",
    'Your password will remain unchanged.',
    '',
    'For your security, never share this link with anyone.',
    'StockWise support will never ask for your reset link.',
    '',
    `© ${year} StockWise – AI-Based Inventory Optimization System`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Reset Your Password – StockWise</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#0f1827;-webkit-text-size-adjust:100%}
  .shell{max-width:600px;margin:32px auto;background:#111827;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6)}
  .hdr{background:linear-gradient(135deg,#1a56db 0%,#0ea5e9 100%);padding:36px 40px;text-align:center}
  .logo-row{display:inline-flex;align-items:center;gap:10px;margin-bottom:6px}
  .logo-icon{width:42px;height:42px;background:rgba(255,255,255,.15);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:22px;line-height:1;vertical-align:middle}
  .logo-name{color:#fff;font-size:21px;font-weight:700;letter-spacing:-.3px;vertical-align:middle}
  .tagline{color:rgba(255,255,255,.7);font-size:11px;letter-spacing:.8px;text-transform:uppercase;margin-top:2px}
  .bd{padding:40px}
  .greeting{font-size:15px;color:#64748b;margin-bottom:6px}
  .headline{font-size:28px;font-weight:700;color:#f1f5f9;line-height:1.2;margin-bottom:18px}
  .copy{font-size:15px;color:#94a3b8;line-height:1.8;margin-bottom:28px}
  .btn-wrap{text-align:center;margin:0 0 28px}
  .btn{display:inline-block;padding:16px 44px;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff !important;text-decoration:none;border-radius:10px;font-size:16px;font-weight:600;letter-spacing:.2px;box-shadow:0 4px 24px rgba(14,165,233,.4)}
  .badge{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin:0 0 24px;display:flex;align-items:flex-start;gap:14px}
  .badge-icon{font-size:22px;flex-shrink:0;margin-top:1px}
  .badge-body{font-size:14px;color:#94a3b8;line-height:1.6}
  .badge-body strong{color:#f59e0b}
  .fallback-box{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;margin:0 0 28px}
  .fallback-box p{font-size:12px;color:#475569;margin-bottom:6px}
  .fallback-box a{font-size:12px;color:#38bdf8;word-break:break-all;text-decoration:none}
  .divider{border:none;border-top:1px solid #1e293b;margin:0 0 24px}
  .security{font-size:13px;color:#64748b;line-height:1.7;margin-bottom:8px}
  .security strong{color:#94a3b8}
  .ft{background:#0a0f1a;padding:28px 40px;text-align:center}
  .ft p{font-size:12px;color:#475569;line-height:1.7;margin-bottom:3px}
  .ft a{color:#38bdf8;text-decoration:none}
  .ft .brand{font-weight:600;color:#64748b;margin-bottom:6px}
</style>
</head>
<body>
<div class="shell">

  <div class="hdr">
    <div class="logo-row">
      <span class="logo-icon">⚡</span>
      <span class="logo-name">StockWise</span>
    </div>
    <p class="tagline">AI-Based Inventory Optimization System</p>
  </div>

  <div class="bd">
    <p class="greeting">Hello, <strong style="color:#cbd5e1">${fullName}</strong></p>
    <h1 class="headline">Reset Your Password</h1>

    <p class="copy">
      We received a request to reset the password for your StockWise account.
      Click the button below to set a new password.
    </p>

    <div class="btn-wrap">
      <a href="${resetUrl}" class="btn">Reset My Password</a>
    </div>

    <div class="badge">
      <span class="badge-icon">⏱</span>
      <div class="badge-body">
        This link expires in <strong>${expiryMinutes} minutes</strong>.
        After that you'll need to request a new reset link.
      </div>
    </div>

    <div class="fallback-box">
      <p>Button not working? Paste this link directly into your browser:</p>
      <a href="${resetUrl}">${resetUrl}</a>
    </div>

    <hr class="divider">

    <p class="security">
      🔒 <strong>Security notice:</strong> If you did not request a password reset,
      please ignore this email — your account is safe and your password has not changed.
    </p>
    <p class="security">
      Never share this link with anyone. StockWise support will never ask you for it.
    </p>
  </div>

  <div class="ft">
    <p class="brand">StockWise — AI-Based Inventory Optimization System</p>
    <p>Himalayan Wholesale Suppliers, Kathmandu Valley, Nepal</p>
    <p style="margin-top:10px">
      Questions? <a href="mailto:support@stockwise.com">Contact Support</a>
    </p>
    <p style="margin-top:14px">&copy; ${year} StockWise. All rights reserved.</p>
    <p style="margin-top:8px;font-size:11px;color:#334155">
      You received this because a password reset was requested for your StockWise account.
    </p>
  </div>

</div>
</body>
</html>`

  return { text, html }
}

// ── sendPasswordResetEmail ────────────────────────────────────────────────────

const sendPasswordResetEmail = async ({ email, fullName, resetUrl }) => {
  console.log(`[Email] Password reset requested for: ${email}`)

  const cfg            = getEmailConfig()
  const expiryMinutes  = parseInt(process.env.RESET_TOKEN_EXPIRE_MINUTES || '30')
  const { text, html } = buildPasswordResetEmail({ fullName, resetUrl, expiryMinutes })

  // ── Dev path: Ethereal test inbox ─────────────────────────────────────────
  if (!cfg.configured) {
    if (IS_DEV) {
      const ethereal = await getEtherealTransporter()
      if (ethereal) {
        try {
          const info = await ethereal.sendMail({
            from:    '"StockWise Dev" <noreply@stockwise.dev>',
            to:      email,
            subject: 'Reset Your Password – StockWise',
            text,
            html,
          })
          const previewUrl = nodemailer.getTestMessageUrl(info)
          const line = '─'.repeat(64)
          console.log(`\n${line}`)
          console.log('  DEV EMAIL SENT — open the preview link in your browser')
          console.log(`  To      : ${email}`)
          console.log(`  Preview : ${previewUrl}`)
          console.log(`${line}\n`)
          return
        } catch (etherealErr) {
          console.warn(`[Email] Ethereal send failed: ${etherealErr.message}`)
          // Fall through to plain console-log fallback
        }
      }
      logDevResetLink(email, resetUrl)
      return
    }

    // Production with no email config is a hard failure
    const detail = cfg.missing.length
      ? `Missing environment variables: ${cfg.missing.join(', ')}`
      : 'EMAIL_USER or EMAIL_PASS contain placeholder values — update your .env file'
    const err    = new Error(`Email service is not configured. ${detail}`)
    err.code     = 'EMAIL_NOT_CONFIGURED'
    err.status   = 503
    throw err
  }

  // ── Real SMTP ─────────────────────────────────────────────────────────────
  try {
    await getTransporter().sendMail({
      from:    cfg.from,
      to:      email,
      subject: 'Reset Your Password – StockWise',
      text,
      html,
    })
    console.log(`[Email] Password reset email delivered to: ${email}`)
  } catch (smtpErr) {
    resetTransporter()
    console.error(`[Email] SMTP send failed for ${email}: ${smtpErr.message}`)
    throw classifySmtpError(smtpErr)
  }
}

// ── verifyEmailService ────────────────────────────────────────────────────────
// Called on server startup. Returns true if SMTP is ready, false otherwise.
// Never throws — failures are warnings only.

const verifyEmailService = async () => {
  const cfg = getEmailConfig()

  if (!cfg.configured) {
    if (cfg.missing.length) {
      console.warn(`[Email] Service not configured. Missing env vars: ${cfg.missing.join(', ')}`)
    } else {
      console.warn('[Email] EMAIL_USER or EMAIL_PASS contain placeholder values.')
    }
    if (IS_DEV) {
      console.info('[Email] DEV mode — reset emails will be sent via Ethereal test inbox.')
    } else {
      console.error('[Email] PRODUCTION: email sending DISABLED. Set EMAIL_* env vars.')
    }
    return false
  }

  try {
    await getTransporter().verify()
    console.log('[Email] ✓ SMTP connection verified.')
    return true
  } catch (err) {
    resetTransporter()
    console.error(`[Email] ✗ SMTP verification failed: ${err.message}`)
    if (IS_DEV) {
      console.info('[Email] DEV fallback — reset emails will be sent via Ethereal test inbox.')
    }
    return false
  }
}

module.exports = { sendPasswordResetEmail, verifyEmailService }
