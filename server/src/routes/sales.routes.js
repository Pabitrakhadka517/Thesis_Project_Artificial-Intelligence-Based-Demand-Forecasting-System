const router = require('express').Router()
const ctrl = require('../controllers/sales.controller')
const { protect } = require('../middleware/auth')
const { allRoles, adminOnly } = require('../middleware/authorize')

router.use(protect)

router.get('/',         ctrl.getSales)
router.get('/stats',    ctrl.getSalesStats)
router.get('/trend',    ctrl.getSalesTrend)
router.get('/:id',      ctrl.getSale)
router.post('/',        allRoles,  ctrl.createSale)   // staff+ can record sales

// Fix #9: inline void handler moved to ctrl.voidSale which now:
//   1. restores stock transactionally for every line item
//   2. creates StockMovement reversal records
//   3. writes an audit log entry
router.delete('/:id',   adminOnly, ctrl.voidSale)

module.exports = router
