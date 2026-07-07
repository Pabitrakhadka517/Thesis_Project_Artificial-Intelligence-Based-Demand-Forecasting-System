const router = require('express').Router()
const ctrl = require('../controllers/alerts.controller')
const { protect } = require('../middleware/auth')
const { managerOrAdmin } = require('../middleware/authorize')

router.use(protect)

router.get('/',            ctrl.getAlerts)
router.get('/unread-count', ctrl.getUnreadCount)
router.post('/generate',   managerOrAdmin, ctrl.generateStockAlerts)
router.patch('/mark-all-read', managerOrAdmin, ctrl.markAllRead)
router.patch('/:id/read',  ctrl.markRead)
router.patch('/:id/acknowledge', ctrl.acknowledge)
router.delete('/:id',      managerOrAdmin, ctrl.deleteAlert)

module.exports = router
