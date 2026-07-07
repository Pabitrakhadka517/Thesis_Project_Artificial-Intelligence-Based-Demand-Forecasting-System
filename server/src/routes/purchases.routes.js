const router = require('express').Router()
const ctrl = require('../controllers/purchases.controller')
const { protect } = require('../middleware/auth')
const { managerOrAdmin, adminOnly } = require('../middleware/authorize')

router.use(protect)

router.get('/',           ctrl.getPurchases)
router.get('/stats',      ctrl.getPurchaseStats)
router.get('/:id',        ctrl.getPurchase)
router.post('/',          managerOrAdmin, ctrl.createPurchase)
router.patch('/:id/receive', managerOrAdmin, ctrl.receivePurchase)
router.patch('/:id/payment', managerOrAdmin, ctrl.updatePaymentStatus)
router.delete('/:id',     adminOnly,      ctrl.deletePurchase)

module.exports = router
