const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const AuditLog = require('../models/AuditLog')
const Setting = require('../models/Setting')
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt')
const { success, created, error } = require('../utils/response')
const { validationResult } = require('express-validator')
const cloudinary = require('../services/cloudinary.service')
const { sendPasswordResetEmail } = require('../services/email.service')

const USERS_FOLDER = process.env.CLOUDINARY_USERS_FOLDER || 'stockwise/users'

// Pre-computed at startup for timing-safe rejection (prevents email enumeration via response timing)
const _dummyHash = bcrypt.hashSync('__timing_dummy__', 12)

// Maximum concurrent sessions (refresh tokens) stored per user
const MAX_REFRESH_TOKENS = 5

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getClientInfo = (req) => ({
  ip:        req.ip || req.connection?.remoteAddress,
  userAgent: req.headers['user-agent'],
})

const audit = (data) => AuditLog.create(data).catch(() => {})

const userPayload = (user) => ({
  id:                 user._id,
  fullName:           user.fullName,
  email:              user.email,
  role:               user.role,
  roleLabel:          user.roleLabel,
  phone:              user.phone,
  avatar:             user.avatar,
  isActive:           user.isActive,
  mustChangePassword: user.mustChangePassword,
  lastLogin:          user.lastLogin,
  createdAt:          user.createdAt,
})

const issueTokens = async (user) => {
  const payload      = { id: user._id, role: user.role }
  const accessToken  = signAccessToken(payload)
  const refreshToken = signRefreshToken(payload)
  const hashed       = crypto.createHash('sha256').update(refreshToken).digest('hex')

  // Push new token and prune to MAX_REFRESH_TOKENS most recent (sliding window cap)
  await User.findByIdAndUpdate(user._id, {
    $push:     { refreshTokens: { $each: [hashed], $slice: -MAX_REFRESH_TOKENS } },
    lastLogin: new Date(),
  })

  return { accessToken, refreshToken }
}

// ─── Setup Status ─────────────────────────────────────────────────────────────

exports.setupStatus = async (req, res) => {
  const adminCount = await User.countDocuments({ role: 'admin' })
  return success(res, { setupRequired: adminCount === 0 })
}

// ─── First-Time Setup ─────────────────────────────────────────────────────────

exports.setup = async (req, res) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const adminCount = await User.countDocuments({ role: 'admin' })
  if (adminCount > 0) return error(res, 'Setup already completed. Please log in.', 403)

  const { companyName, industry, fullName, email, password } = req.body

  const existing = await User.findOne({ email })
  if (existing) return error(res, 'Email already registered', 409)

  await Setting.findOneAndUpdate(
    { key: 'company_name' },
    { key: 'company_name', value: companyName, group: 'general', label: 'Company Name' },
    { upsert: true }
  )
  if (industry) {
    await Setting.findOneAndUpdate(
      { key: 'company_industry' },
      { key: 'company_industry', value: industry, group: 'general', label: 'Industry' },
      { upsert: true }
    )
  }
  await Setting.findOneAndUpdate(
    { key: 'setup_completed' },
    { key: 'setup_completed', value: true, group: 'general', label: 'Setup Completed' },
    { upsert: true }
  )

  const user = await User.create({ fullName, email, password, role: 'admin' })
  const { accessToken, refreshToken } = await issueTokens(user)

  audit({
    user: user._id, userEmail: email,
    action: 'SYSTEM_SETUP', resource: 'System', resourceId: user._id.toString(),
    status: 'success', details: `Company "${companyName}" initialised`, ...getClientInfo(req),
  })

  return created(res, { user: userPayload(user), accessToken, refreshToken, companyName }, 'Setup completed successfully')
}

// ─── Login ────────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const { email, password } = req.body
  const clientInfo = getClientInfo(req)

  const user = await User.findOne({ email })
    .select('+password +refreshTokens +loginAttempts +lockUntil')

  // Always run bcrypt to prevent timing-based email enumeration
  if (!user) {
    await bcrypt.compare(password, _dummyHash)
    audit({ userEmail: email, action: 'USER_LOGIN', status: 'failure', details: 'User not found', ...clientInfo })
    return error(res, 'Invalid email or password', 401)
  }

  if (!user.isActive) {
    return error(res, 'Your account has been deactivated. Contact an administrator.', 403)
  }

  // Brute-force lockout check
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000)
    audit({ user: user._id, userEmail: email, action: 'USER_LOGIN', status: 'failure', details: 'Account locked', ...clientInfo })
    return error(res, `Account temporarily locked. Try again in ${minutesLeft} minute(s).`, 423)
  }

  const isMatch = await user.matchPassword(password)
  if (!isMatch) {
    await user.incLoginAttempts()
    audit({ user: user._id, userEmail: email, action: 'USER_LOGIN', status: 'failure', details: 'Wrong password', ...clientInfo })
    return error(res, 'Invalid email or password', 401)
  }

  // Successful login — reset lockout state
  if (user.loginAttempts > 0 || user.lockUntil) {
    await user.resetLoginAttempts()
  }

  const { accessToken, refreshToken } = await issueTokens(user)
  audit({ user: user._id, userEmail: email, action: 'USER_LOGIN', status: 'success', ...clientInfo })

  return success(res, { user: userPayload(user), accessToken, refreshToken }, 'Login successful')
}

// ─── Get Current User ─────────────────────────────────────────────────────────

exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id)
  return success(res, { user: userPayload(user) })
}

// ─── Update Profile ───────────────────────────────────────────────────────────

exports.updateProfile = async (req, res) => {
  const { fullName, phone } = req.body

  const updates = {}
  if (fullName !== undefined) updates.fullName = fullName
  if (phone    !== undefined) updates.phone    = phone

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updates,
    { new: true, runValidators: true }
  )

  audit({ user: user._id, userEmail: user.email, action: 'PROFILE_UPDATE', status: 'success', ...getClientInfo(req) })

  return success(res, { user: userPayload(user) }, 'Profile updated')
}

// ─── Upload / Replace Avatar ──────────────────────────────────────────────────

exports.uploadAvatar = async (req, res) => {
  if (!req.file) return error(res, 'No image file provided', 400)

  const user = await User.findById(req.user._id)
  if (!user) return error(res, 'User not found', 404)

  let meta
  try {
    meta = await cloudinary.replaceImage(req.file, USERS_FOLDER, user.avatarPublicId)
  } catch (uploadErr) {
    return error(res, uploadErr.message, uploadErr.status || 502)
  }

  user.avatar        = meta.url
  user.avatarPublicId = meta.publicId
  user.avatarAssetId  = meta.assetId
  user.avatarFormat   = meta.format
  await user.save()

  audit({ user: user._id, userEmail: user.email, action: 'AVATAR_UPLOAD', status: 'success', ...getClientInfo(req) })

  return success(res, { user: userPayload(user) }, 'Profile picture updated')
}

// ─── Delete Avatar ────────────────────────────────────────────────────────────

exports.deleteAvatar = async (req, res) => {
  const user = await User.findById(req.user._id)
  if (!user) return error(res, 'User not found', 404)

  if (user.avatarPublicId) await cloudinary.deleteImage(user.avatarPublicId)

  user.avatar         = null
  user.avatarPublicId = null
  user.avatarAssetId  = null
  user.avatarFormat   = null
  await user.save()

  audit({ user: user._id, userEmail: user.email, action: 'AVATAR_DELETE', status: 'success', ...getClientInfo(req) })

  return success(res, { user: userPayload(user) }, 'Profile picture removed')
}

// ─── Change Password ──────────────────────────────────────────────────────────

exports.changePassword = async (req, res) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const { currentPassword, newPassword } = req.body

  const user = await User.findById(req.user._id).select('+password')
  const isMatch = await user.matchPassword(currentPassword)
  if (!isMatch) return error(res, 'Current password is incorrect', 400)

  user.password           = newPassword
  user.mustChangePassword = false
  await user.save()

  // Invalidate all other sessions — re-login required on other devices
  await User.findByIdAndUpdate(req.user._id, { $set: { refreshTokens: [] } })

  audit({ user: user._id, userEmail: user.email, action: 'PASSWORD_CHANGE', status: 'success', ...getClientInfo(req) })

  return success(res, {}, 'Password changed successfully. Please log in again on other devices.')
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return error(res, 'Refresh token required', 400)

  let decoded
  try {
    decoded = verifyRefreshToken(refreshToken)
  } catch {
    return error(res, 'Invalid or expired refresh token', 401)
  }

  const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex')
  const user   = await User.findById(decoded.id).select('+refreshTokens')

  // Token reuse detected: valid JWT signature but token not in DB — possible theft.
  // Invalidate all sessions for this user as a precaution.
  if (!user || !user.refreshTokens.includes(hashed)) {
    if (user) {
      await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } })
      audit({ user: user._id, userEmail: user.email, action: 'SUSPICIOUS_TOKEN_REUSE', status: 'failure', ...getClientInfo(req) })
    }
    return error(res, 'Invalid refresh token', 401)
  }

  if (!user.isActive) {
    await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } })
    return error(res, 'Account deactivated.', 403)
  }

  // Rotate: remove used token, issue fresh pair
  await User.findByIdAndUpdate(user._id, { $pull: { refreshTokens: hashed } })
  const tokens = await issueTokens(user)

  return success(res, tokens, 'Token refreshed')
}

// ─── Logout ───────────────────────────────────────────────────────────────────

exports.logout = async (req, res) => {
  const { refreshToken } = req.body
  if (refreshToken) {
    const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex')
    await User.findByIdAndUpdate(req.user._id, { $pull: { refreshTokens: hashed } })
  }

  audit({ user: req.user._id, userEmail: req.user.email, action: 'USER_LOGOUT', status: 'success', ...getClientInfo(req) })

  return success(res, {}, 'Logged out successfully')
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
// Security: always return the same response regardless of whether the email
// exists — prevents attackers from enumerating registered accounts.
const FORGOT_PASSWORD_RESPONSE = 'If an account with that email exists, a password reset link has been sent.'

exports.forgotPassword = async (req, res) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const { email } = req.body
  const clientInfo = getClientInfo(req)

  // ── User lookup ───────────────────────────────────────────────────────────
  let user
  try {
    user = await User.findOne({ email })
  } catch (dbErr) {
    console.error('[Auth] DB error during forgot-password lookup:', dbErr.message)
    return error(res, 'Service temporarily unavailable. Please try again.', 503)
  }

  if (!user) {
    console.info(`[Auth] Forgot-password: no account for email (not disclosed to client), IP: ${clientInfo.ip}`)
    audit({ userEmail: email, action: 'PASSWORD_RESET_REQUEST', status: 'failure', details: 'No account', ...clientInfo })
    return success(res, {}, FORGOT_PASSWORD_RESPONSE)
  }

  // ── Token generation & persistence ───────────────────────────────────────
  let token
  try {
    token = user.getResetPasswordToken()
    await user.save({ validateBeforeSave: false })
  } catch (dbErr) {
    console.error('[Auth] Failed to save reset token:', dbErr.message)
    return error(res, 'Failed to initiate password reset. Please try again.', 500)
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173'
  const resetUrl    = `${frontendUrl}/reset-password/${token}`

  // ── Email dispatch ────────────────────────────────────────────────────────
  try {
    await sendPasswordResetEmail({ email: user.email, fullName: user.fullName, resetUrl })
  } catch (emailErr) {
    console.error(`[Auth] Email delivery failed for user ${user._id}: [${emailErr.code}] ${emailErr.message}`)

    // Clean up token so the user can retry cleanly
    try {
      user.resetPasswordToken  = undefined
      user.resetPasswordExpire = undefined
      await user.save({ validateBeforeSave: false })
    } catch (cleanupErr) {
      console.warn('[Auth] Token cleanup failed (token will self-expire):', cleanupErr.message)
    }

    if (emailErr.code === 'SMTP_AUTH_FAILED') {
      return error(res, 'Email service is misconfigured. Please contact support.', 503)
    }
    if (emailErr.code === 'SMTP_CONN_ERROR') {
      return error(res, 'Email service is temporarily unavailable. Please try again later.', 503)
    }
    if (emailErr.code === 'EMAIL_NOT_CONFIGURED') {
      return error(res, 'Email service is not configured on this server. Contact your administrator.', 503)
    }
    return error(res, 'Failed to send the reset email. Please try again.', 500)
  }

  audit({
    user: user._id, userEmail: email,
    action: 'PASSWORD_RESET_REQUEST', resource: 'User', resourceId: user._id.toString(),
    status: 'success', ...clientInfo,
  })

  return success(res, {}, FORGOT_PASSWORD_RESPONSE)
}

// ─── Reset Password ───────────────────────────────────────────────────────────

exports.resetPassword = async (req, res) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex')

  // Two-step lookup: first find by token hash (without expiry constraint) so we
  // can distinguish "invalid token" (400) from "valid but expired" (410).
  const user = await User.findOne({ resetPasswordToken: hashedToken })
    .select('+resetPasswordToken +resetPasswordExpire')

  if (!user) {
    return error(res, 'Invalid reset link. Please request a new one.', 400)
  }

  if (user.resetPasswordExpire < Date.now()) {
    // Clean up the stale token, then tell the client it's expired
    try {
      user.resetPasswordToken  = undefined
      user.resetPasswordExpire = undefined
      await user.save({ validateBeforeSave: false })
    } catch { /* non-fatal */ }
    return error(res, 'This reset link has expired. Please request a new password reset.', 410)
  }

  user.password            = req.body.password
  user.resetPasswordToken  = undefined
  user.resetPasswordExpire = undefined
  user.refreshTokens       = []   // Invalidate all existing sessions
  user.mustChangePassword  = false
  await user.save()

  audit({
    user: user._id, userEmail: user.email,
    action: 'PASSWORD_RESET', resource: 'User', resourceId: user._id.toString(),
    status: 'success', ...getClientInfo(req),
  })

  console.log(`[Auth] Password reset successfully for user ${user._id}`)
  return success(res, {}, 'Password reset successfully. Please log in with your new password.')
}
