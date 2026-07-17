const router = require('express').Router()
const { body } = require('express-validator')
const ctrl = require('../controllers/purchases.controller')
const { protect } = require('../middleware/auth')
const { managerOrAdmin, adminOnly } = require('../middleware/authorize')

router.use(protect)

const createPurchaseRules = [
  body('supplier').notEmpty().withMessage('Supplier is required').isMongoId().withMessage('Invalid supplier ID'),
  body('items').isArray({ min: 1 }).withMessage('Purchase must have at least one item'),
  body('items.*.product').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.buyingPrice').optional().isFloat({ min: 0 }).withMessage('Buying price cannot be negative'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount cannot be negative'),
  body('paymentMethod').optional({ values: 'falsy' }).isIn(['cash', 'bank_transfer', 'cheque', 'credit']).withMessage('Invalid payment method'),
  body('paymentStatus').optional({ values: 'falsy' }).isIn(['paid', 'partial', 'pending']).withMessage('Invalid payment status'),
  body('deliveryDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid delivery date'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }).withMessage('Notes too long'),
]

router.get('/',           ctrl.getPurchases)
router.get('/stats',      ctrl.getPurchaseStats)
router.get('/:id',        ctrl.getPurchase)
router.post('/',          managerOrAdmin, createPurchaseRules, ctrl.createPurchase)
router.patch('/:id/receive', managerOrAdmin, ctrl.receivePurchase)
router.patch('/:id/payment', managerOrAdmin, ctrl.updatePaymentStatus)
router.delete('/:id',     adminOnly,      ctrl.deletePurchase)

module.exports = router
