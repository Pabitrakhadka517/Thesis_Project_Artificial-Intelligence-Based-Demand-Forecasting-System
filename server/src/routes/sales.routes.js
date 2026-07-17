const router = require('express').Router()
const { body } = require('express-validator')
const ctrl = require('../controllers/sales.controller')
const { protect } = require('../middleware/auth')
const { allRoles, adminOnly } = require('../middleware/authorize')

router.use(protect)

const createSaleRules = [
  body('items').isArray({ min: 1 }).withMessage('Sale must have at least one item'),
  body('items.*.product').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }).withMessage('Unit price cannot be negative'),
  body('customerName').optional({ values: 'falsy' }).trim().isLength({ max: 200 }).withMessage('Customer name too long'),
  body('customerPhone').optional({ values: 'falsy' }).trim().isLength({ max: 30 }).withMessage('Customer phone too long'),
  body('paymentMethod').optional({ values: 'falsy' }).isIn(['cash', 'card', 'qr', 'credit']).withMessage('Invalid payment method'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount cannot be negative'),
  body('tax').optional().isFloat({ min: 0 }).withMessage('Tax cannot be negative'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }).withMessage('Notes too long'),
]

router.get('/',         ctrl.getSales)
router.get('/stats',    ctrl.getSalesStats)
router.get('/trend',    ctrl.getSalesTrend)
router.get('/:id',      ctrl.getSale)
router.post('/',        allRoles, createSaleRules, ctrl.createSale)   // staff+ can record sales

// Fix #9: inline void handler moved to ctrl.voidSale which now:
//   1. restores stock transactionally for every line item
//   2. creates StockMovement reversal records
//   3. writes an audit log entry
router.delete('/:id',   adminOnly, ctrl.voidSale)

module.exports = router
