'use strict'

const router   = require('express').Router()
const { protect }   = require('../middleware/auth')
const { adminOnly } = require('../middleware/authorize')
const ctrl = require('../controllers/synthetic.controller')

// Extend socket timeout for the long-running generate operation
function extendTimeout(req, res, next) {
  req.socket?.setTimeout(300_000)
  next()
}

router.get('/status',    protect, ctrl.getStatus)
router.post('/generate', protect, adminOnly, extendTimeout, ctrl.generate)
router.delete('/clear',  protect, adminOnly, ctrl.clearSyntheticData)

module.exports = router
