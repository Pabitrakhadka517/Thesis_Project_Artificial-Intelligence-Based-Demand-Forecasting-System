const { error } = require('../utils/response')

// Role hierarchy: admin > inventory_manager > staff
const ROLE_LEVELS = { admin: 3, inventory_manager: 2, staff: 1 }

/**
 * authorize('admin')             — only admin
 * authorize('inventory_manager') — admin + inventory_manager
 * authorize('staff')             — all authenticated users
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return error(res, 'Not authenticated.', 401)

  const userLevel = ROLE_LEVELS[req.user.role] || 0
  const requiredLevel = Math.min(...roles.map((r) => ROLE_LEVELS[r] || 99))

  if (userLevel >= requiredLevel) return next()

  return error(res, 'Access denied. Insufficient permissions.', 403)
}

// Convenience shortcuts
const adminOnly      = authorize('admin')
const managerOrAdmin = authorize('inventory_manager')
const allRoles       = authorize('staff')

// Exact role check — inventory_manager only (admin excluded)
const managerOnly = (req, res, next) => {
  if (!req.user) return error(res, 'Not authenticated.', 401)
  if (req.user.role !== 'inventory_manager')
    return error(res, 'Access denied. Insufficient permissions.', 403)
  return next()
}

module.exports = { authorize, adminOnly, managerOrAdmin, managerOnly, allRoles, ROLE_LEVELS }
