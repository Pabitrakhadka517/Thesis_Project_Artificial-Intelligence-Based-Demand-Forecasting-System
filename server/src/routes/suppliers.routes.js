const router = require('express').Router()
const { body } = require('express-validator')
const ctrl   = require('../controllers/suppliers.controller')
const { protect }                   = require('../middleware/auth')
const { managerOrAdmin, adminOnly } = require('../middleware/authorize')
const { upload }                    = require('../middleware/upload')

router.use(protect)

// Fix #22: suppliers had no route-level validation on create or update.

const createSupplierRules = [
  body('name').trim().notEmpty().withMessage('Supplier name is required')
    .isLength({ max: 200 }).withMessage('Supplier name cannot exceed 200 characters'),
  body('email').optional().trim().isEmail().withMessage('Invalid email address').normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 30 }).withMessage('Phone cannot exceed 30 characters'),
  body('leadTimeDays').optional().isInt({ min: 0 }).withMessage('Lead time must be a non-negative integer'),
  body('rating').optional().isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('paymentTerms').optional()
    .isIn(['cash', 'credit_15', 'credit_30', 'credit_60'])
    .withMessage('Invalid payment terms'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive'),
]

const updateSupplierRules = [
  body('name').optional().trim().notEmpty().withMessage('Supplier name cannot be blank')
    .isLength({ max: 200 }).withMessage('Supplier name cannot exceed 200 characters'),
  body('email').optional().trim().isEmail().withMessage('Invalid email address').normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 30 }).withMessage('Phone cannot exceed 30 characters'),
  body('leadTimeDays').optional().isInt({ min: 0 }).withMessage('Lead time must be a non-negative integer'),
  body('rating').optional().isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('paymentTerms').optional()
    .isIn(['cash', 'credit_15', 'credit_30', 'credit_60'])
    .withMessage('Invalid payment terms'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive'),
]

// ── utilities ──────────────────────────────────────────────────────────────────
router.get('/select',    ctrl.getAllForSelect)

// ── analytics endpoints (before /:id to avoid param collision) ─────────────────
router.get('/dashboard', ctrl.getDashboard)
router.get('/analytics', ctrl.getAnalytics)

// ── CRUD ───────────────────────────────────────────────────────────────────────
router.get('/',      ctrl.getSuppliers)
router.get('/:id',   ctrl.getSupplier)
router.post('/',     managerOrAdmin, createSupplierRules, ctrl.createSupplier)
router.patch('/:id', managerOrAdmin, updateSupplierRules, ctrl.updateSupplier)
router.delete('/:id',adminOnly,                           ctrl.deleteSupplier)

// ── per-supplier performance ───────────────────────────────────────────────────
router.get('/:id/performance', ctrl.getPerformance)

// ── Logo ───────────────────────────────────────────────────────────────────────
router.post('/:id/logo',   managerOrAdmin, upload.single('logo'), ctrl.uploadLogo)
router.delete('/:id/logo', managerOrAdmin,                        ctrl.deleteLogo)

module.exports = router
