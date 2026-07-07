const router    = require('express').Router()
const { body }  = require('express-validator')
const rateLimit = require('express-rate-limit')
const ctrl      = require('../controllers/auth.controller')
const { protect } = require('../middleware/auth')

// ── Stricter rate limiter for password-reset endpoints (5 per hour per IP) ───
const sensitiveAuthLimiter = rateLimit({
  windowMs:       60 * 60 * 1000,
  max:            5,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { success: false, message: 'Too many attempts. Please try again in an hour.' },
})

// ── Validators ────────────────────────────────────────────────────────────────

// Reusable strong-password chain
const passwordStrength = (field) =>
  body(field)
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[^a-zA-Z0-9]/)
    .withMessage('Password must contain at least one special character')

const setupRules = [
  body('companyName').trim().notEmpty().withMessage('Company name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Company name must be 2–100 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2–100 characters'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  passwordStrength('password'),
]

const loginRules = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
]

const forgotRules = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
]

const resetRules = [
  passwordStrength('password'),
]

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordStrength('newPassword'),
]

// Fix #14: PATCH /me previously had no validation — any string of any length
// could be stored as fullName or phone.
const updateProfileRules = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be 2–100 characters'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number cannot exceed 20 characters'),
]

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/setup-status',                                ctrl.setupStatus)
router.post('/setup',                    setupRules,       ctrl.setup)
router.post('/login',                    loginRules,       ctrl.login)
router.post('/refresh-token',                              ctrl.refreshToken)
router.post('/forgot-password',          sensitiveAuthLimiter, forgotRules, ctrl.forgotPassword)
router.post('/reset-password/:token',    sensitiveAuthLimiter, resetRules,  ctrl.resetPassword)

// ── Protected routes ──────────────────────────────────────────────────────────
router.get('/me',              protect,                         ctrl.getMe)
router.patch('/me',            protect, updateProfileRules,      ctrl.updateProfile)
router.post('/logout',         protect,                         ctrl.logout)
router.post('/change-password', protect, changePasswordRules,   ctrl.changePassword)

// ── Avatar ────────────────────────────────────────────────────────────────────
const { upload } = require('../middleware/upload')
router.post('/me/avatar',   protect, upload.single('avatar'), ctrl.uploadAvatar)
router.delete('/me/avatar', protect,                          ctrl.deleteAvatar)

module.exports = router
