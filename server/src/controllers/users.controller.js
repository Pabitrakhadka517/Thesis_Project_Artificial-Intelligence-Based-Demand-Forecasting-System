const User = require('../models/User')
const AuditLog = require('../models/AuditLog')
const { success, created, error, paginated } = require('../utils/response')
const { validationResult } = require('express-validator')

// Escape special regex characters to prevent ReDoS via user-supplied search strings
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Fields returned to callers — never leaks password, tokens, or lockout state
const SAFE_USER_SELECT = '-password -refreshTokens -resetPasswordToken -resetPasswordExpire -loginAttempts -lockUntil'

// Consistent safe shape used for create/update responses
function safeUser(user) {
  const obj = user.toObject ? user.toObject({ virtuals: true }) : user
  const { password, refreshTokens, resetPasswordToken, resetPasswordExpire, loginAttempts, lockUntil, ...safe } = obj
  return safe
}

// ── List users ─────────────────────────────────────────────────────────────────

exports.getUsers = async (req, res) => {
  // Fix #20: clamp page and limit to prevent NaN skip (parseInt('abc') = NaN)
  const page  = Math.max(1, parseInt(req.query.page)  || 1)
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 200)
  const skip  = (page - 1) * limit

  const { search, role, isActive } = req.query
  const query = {}

  if (search) {
    const safe = escapeRegex(search)
    query.$or = [
      { fullName: { $regex: safe, $options: 'i' } },
      { email:    { $regex: safe, $options: 'i' } },
    ]
  }
  if (role)              query.role     = role
  if (isActive !== undefined) query.isActive = isActive === 'true'

  const [users, total] = await Promise.all([
    User.find(query).select(SAFE_USER_SELECT).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ])

  return paginated(res, { data: users, total, page, limit })
}

// ── Single user ────────────────────────────────────────────────────────────────

exports.getUser = async (req, res) => {
  const user = await User.findById(req.params.id).select(SAFE_USER_SELECT)
  if (!user) return error(res, 'User not found', 404)
  return success(res, { user })
}

// ── Create user ────────────────────────────────────────────────────────────────

exports.createUser = async (req, res) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  const { fullName, email, password, role, phone } = req.body

  const existing = await User.findOne({ email })
  if (existing) return error(res, 'Email already registered', 409)

  const user = await User.create({ fullName, email, password, role, phone, mustChangePassword: true })

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'USER_CREATED', resource: 'User', resourceId: user._id.toString(),
    details: { targetEmail: email, role },
    status: 'success',
  }).catch(() => {})

  // Fix #11: safeUser() strips loginAttempts, lockUntil, resetPasswordToken,
  // resetPasswordExpire — fields that toObject() returns even with select:false
  // when the document was just created.
  return created(res, { user: safeUser(user) }, 'User created successfully')
}

// ── Update user ────────────────────────────────────────────────────────────────

exports.updateUser = async (req, res) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) return error(res, 'Validation failed', 400, errs.array())

  if (req.params.id === req.user._id.toString() && req.body.role !== undefined) {
    return error(res, 'You cannot change your own role', 400)
  }

  const { fullName, email, role, phone, isActive } = req.body
  const updates = {}
  if (fullName  !== undefined) updates.fullName  = fullName
  if (email     !== undefined) updates.email     = email
  if (role      !== undefined) updates.role      = role
  if (phone     !== undefined) updates.phone     = phone
  if (isActive  !== undefined) updates.isActive  = isActive

  // Role change: invalidate all sessions so the user re-authenticates with the new role
  // Fix #12: also invalidate on email change — the old email holder must not keep access
  const current = await User.findById(req.params.id).select('role email')
  if (!current) return error(res, 'User not found', 404)

  if ((role !== undefined && current.role !== role) ||
      (email !== undefined && current.email !== email)) {
    updates.refreshTokens = []
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .select(SAFE_USER_SELECT)
  if (!user) return error(res, 'User not found', 404)

  const changedFields = Object.keys(updates).filter(k => k !== 'refreshTokens')
  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'USER_UPDATED', resource: 'User', resourceId: user._id.toString(),
    details: { changed: changedFields, targetEmail: user.email },
    status: 'success',
  }).catch(() => {})

  return success(res, { user }, 'User updated')
}

// ── Delete user (soft) ─────────────────────────────────────────────────────────

exports.deleteUser = async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return error(res, 'You cannot delete your own account', 400)
  }

  // Fix #2: Hard delete (findByIdAndDelete) orphaned Sales.recordedBy,
  // Purchases.recordedBy, StockMovement.recordedBy and AuditLog.user references.
  // Soft delete preserves referential integrity and the audit trail while
  // preventing the user from logging in.
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false, refreshTokens: [] },   // revoke all active sessions
    { new: true }
  ).select(SAFE_USER_SELECT)
  if (!user) return error(res, 'User not found', 404)

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: 'USER_DELETED', resource: 'User', resourceId: req.params.id,
    details: { targetEmail: user.email, role: user.role },
    status: 'success',
  }).catch(() => {})

  return success(res, {}, 'User deactivated and access revoked')
}

// ── Toggle active ──────────────────────────────────────────────────────────────

exports.toggleActive = async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) return error(res, 'User not found', 404)
  if (req.params.id === req.user._id.toString()) {
    return error(res, 'Cannot deactivate your own account', 400)
  }

  const becomingInactive = user.isActive
  const update = { isActive: !user.isActive }
  if (becomingInactive) update.refreshTokens = []

  await User.findByIdAndUpdate(req.params.id, update)

  AuditLog.create({
    user: req.user._id, userEmail: req.user.email,
    action: becomingInactive ? 'USER_DEACTIVATED' : 'USER_ACTIVATED',
    resource: 'User', resourceId: user._id.toString(),
    details: { targetEmail: user.email },
    status: 'success',
  }).catch(() => {})

  return success(res, { isActive: !user.isActive }, `User ${!user.isActive ? 'activated' : 'deactivated'}`)
}

// ── Audit logs ─────────────────────────────────────────────────────────────────

exports.getAuditLogs = async (req, res) => {
  // Fix #20: same pagination clamping as getUsers
  const page  = Math.max(1, parseInt(req.query.page)  || 1)
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200)
  const skip  = (page - 1) * limit

  const { userId, action, resource, startDate, endDate } = req.query
  const query = {}
  if (userId)   query.user     = userId
  if (action)   query.action   = { $regex: escapeRegex(action),   $options: 'i' }
  if (resource) query.resource = { $regex: escapeRegex(resource), $options: 'i' }
  if (startDate || endDate) {
    query.createdAt = {}
    if (startDate) query.createdAt.$gte = new Date(startDate)
    if (endDate)   query.createdAt.$lte = new Date(endDate + 'T23:59:59')
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('user', 'fullName email role'),
    AuditLog.countDocuments(query),
  ])

  return paginated(res, { data: logs, total, page, limit })
}

// ── Dashboard stats ────────────────────────────────────────────────────────────

exports.getDashboardStats = async (req, res) => {
  const [total, admins, managers, staff, activeUsers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ role: 'inventory_manager' }),
    User.countDocuments({ role: 'staff' }),
    User.countDocuments({ isActive: true }),
  ])
  return success(res, { total, admins, managers, staff, activeUsers })
}
