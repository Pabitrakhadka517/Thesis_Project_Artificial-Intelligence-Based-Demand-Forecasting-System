const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500
  let message    = err.message    || 'Internal Server Error'

  // ── Mongoose: duplicate key ───────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field'
    message    = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
    statusCode = 409
  }

  // ── Mongoose: schema validation failure ───────────────────────────────────
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message)
    message    = errors.join('. ')
    statusCode = 400
  }

  // ── Mongoose: invalid ObjectId / type cast ────────────────────────────────
  // Root-cause fix: CastError was previously unhandled, defaulting to 500.
  // Invalid ObjectId strings from the frontend should return 400 Bad Request.
  if (err.name === 'CastError') {
    message    = `Invalid value for field "${err.path}": "${err.value}"`
    statusCode = 400
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    message    = 'Invalid token'
    statusCode = 401
  }
  if (err.name === 'TokenExpiredError') {
    message    = 'Token expired'
    statusCode = 401
  }

  // ── Multer file upload errors ─────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    message    = 'File too large. Maximum size is 5 MB'
    statusCode = 400
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    message    = 'Unexpected file field'
    statusCode = 400
  }

  // ── MongoDB server errors ─────────────────────────────────────────────────
  // Catch-all for MongoServerError variants not handled elsewhere.
  // The most common unhandled case is a transaction attempted on a standalone
  // MongoDB instance (no replica set): "Transaction numbers are only allowed
  // on a replica set member or mongos".  Controllers now avoid sessions so
  // this is a last-resort safety net.
  if (err.name === 'MongoServerError') {
    if (err.message?.includes('Transaction numbers are only allowed')) {
      message    = 'Database transactions require a MongoDB replica set. Contact your system administrator.'
      statusCode = 503
    } else if (statusCode === 500) {
      // Keep the original message for other MongoServerErrors but don't expose
      // raw driver internals in production.
      message = process.env.NODE_ENV === 'development'
        ? err.message
        : 'A database error occurred. Please try again.'
    }
  }

  // ── Log internally — never expose stack traces in production ──────────────
  console.error(
    `[ErrorHandler] ${err.name || 'Error'} ${statusCode} — ${err.message}`,
    process.env.NODE_ENV === 'development' ? err.stack : ''
  )

  res.status(statusCode).json({ success: false, message })
}

module.exports = errorHandler
