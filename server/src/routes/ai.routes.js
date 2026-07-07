const router = require('express').Router()
const ctrl   = require('../controllers/ai.controller')
const { protect }       = require('../middleware/auth')
const { managerOrAdmin } = require('../middleware/authorize')

router.use(protect)

// Status & health
router.get('/health',  ctrl.getHealth)
router.get('/status',  ctrl.getStatus)

// Bulk operations — MUST be before /:productId
router.get( '/predictions',              ctrl.getAllPredictions)
router.post('/predictions/refresh-all',  managerOrAdmin, ctrl.refreshAll)

// Dashboard
router.get('/dashboard', ctrl.getDashboard)

// Per-product
router.get(   '/predictions/:productId',         ctrl.getProductPrediction)
router.post(  '/predictions/:productId/refresh', managerOrAdmin, ctrl.refreshProductPrediction)
router.delete('/predictions/:productId',         managerOrAdmin, ctrl.clearPrediction)

module.exports = router
