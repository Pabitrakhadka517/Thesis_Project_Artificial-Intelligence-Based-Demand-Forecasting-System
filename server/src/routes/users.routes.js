const router = require('express').Router()
const { body } = require('express-validator')
const ctrl = require('../controllers/users.controller')
const { protect } = require('../middleware/auth')
const { adminOnly } = require('../middleware/authorize')

const passwordStrength = (field) =>
  body(field)
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[^a-zA-Z0-9]/).withMessage('Password must contain at least one special character')

const createRules = [
  body('fullName').trim().notEmpty().withMessage('Full name required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  passwordStrength('password'),
  body('role').isIn(['admin', 'inventory_manager', 'staff']).withMessage('Invalid role'),
]
const updateRules = [
  body('email').optional().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('role').optional().isIn(['admin', 'inventory_manager', 'staff']).withMessage('Invalid role'),
]

router.use(protect, adminOnly)

router.get('/',           ctrl.getUsers)
router.get('/stats',      ctrl.getDashboardStats)
router.get('/audit-logs', ctrl.getAuditLogs)
router.get('/:id',        ctrl.getUser)
router.post('/', createRules, ctrl.createUser)
router.patch('/:id', updateRules, ctrl.updateUser)
router.patch('/:id/toggle-active', ctrl.toggleActive)
router.delete('/:id',     ctrl.deleteUser)

module.exports = router
