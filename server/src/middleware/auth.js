const { verifyAccessToken } = require('../utils/jwt')
const User = require('../models/User')
const { error } = require('../utils/response')

const protect = async (req, res, next) => {
  let token
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1]
  }
  if (!token) return error(res, 'Not authenticated. Please log in.', 401)

  try {
    const decoded = verifyAccessToken(token)
    const user = await User.findById(decoded.id).select('-password -refreshTokens')
    if (!user) return error(res, 'User not found.', 401)
    if (!user.isActive) return error(res, 'Your account has been deactivated.', 403)
    req.user = user
    next()
  } catch (err) {
    return error(res, 'Invalid or expired token.', 401)
  }
}

module.exports = { protect }
