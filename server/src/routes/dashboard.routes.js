const router = require('express').Router()
const ctrl = require('../controllers/dashboard.controller')
const { protect } = require('../middleware/auth')
const { managerOrAdmin } = require('../middleware/authorize')

router.use(protect)

router.get('/summary',               ctrl.getSummary)
router.get('/sales-trend',           ctrl.getSalesTrend)
router.get('/category-distribution', ctrl.getCategoryDistribution)
router.get('/recent-transactions',   ctrl.getRecentTransactions)

// Fix #13: recommendations expose AI predictions, purchase budgets and supplier
// contact details — information staff don't need and shouldn't see.
router.get('/recommendations', managerOrAdmin, ctrl.getRecommendations)

module.exports = router
