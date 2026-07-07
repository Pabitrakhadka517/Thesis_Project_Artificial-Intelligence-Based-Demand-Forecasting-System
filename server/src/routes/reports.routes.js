const router = require('express').Router()
const ctrl = require('../controllers/reports.controller')
const { protect } = require('../middleware/auth')
const { managerOrAdmin } = require('../middleware/authorize')

router.use(protect)
router.use(managerOrAdmin)

router.get('/executive',       ctrl.getExecutiveReport)
router.get('/sales',           ctrl.getSalesReport)
router.get('/purchases',       ctrl.getPurchaseReport)
router.get('/inventory',       ctrl.getInventoryReport)
router.get('/suppliers',       ctrl.getSupplierReport)
router.get('/profit',          ctrl.getProfitReport)
router.get('/forecast',        ctrl.getForecastReport)
router.get('/low-stock',       ctrl.getLowStockReport)
router.get('/inventory-aging', ctrl.getInventoryAgingReport)

module.exports = router
