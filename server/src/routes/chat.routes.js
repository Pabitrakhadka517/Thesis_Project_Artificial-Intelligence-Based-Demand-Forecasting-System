const router = require('express').Router()
const ctrl   = require('../controllers/chat.controller')
const { protect } = require('../middleware/auth')

router.use(protect)

router.post(  '/chat',        ctrl.chat)
router.post(  '/session',     ctrl.createSession)
router.get(   '/suggestions', ctrl.getSuggestions)
router.get(   '/insights',    ctrl.getInsights)
router.get(   '/history',     ctrl.getHistory)
router.delete('/history',     ctrl.clearHistory)

module.exports = router
