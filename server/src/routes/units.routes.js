const router = require('express').Router()
const Unit = require('../models/Unit')
const { protect } = require('../middleware/auth')
const { managerOrAdmin, adminOnly } = require('../middleware/authorize')
const { success, created, error, paginated } = require('../utils/response')

router.use(protect)

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, search, unitType, isActive } = req.query
  const skip  = (parseInt(page) - 1) * parseInt(limit)
  const query = {}
  if (search)   query.name     = { $regex: search, $options: 'i' }
  if (unitType) query.unitType = unitType
  if (isActive !== undefined) query.isActive = isActive === 'true'

  const [units, total] = await Promise.all([
    Unit.find(query).sort({ unitType: 1, name: 1 }).skip(skip).limit(parseInt(limit)),
    Unit.countDocuments(query),
  ])
  return paginated(res, { data: units, total, page: parseInt(page), limit: parseInt(limit) })
})

router.get('/stats', async (req, res) => {
  const [total, active, byType] = await Promise.all([
    Unit.countDocuments(),
    Unit.countDocuments({ isActive: true }),
    Unit.aggregate([
      { $group: { _id: '$unitType', count: { $sum: 1 } } },
      { $project: { _id: 0, type: '$_id', count: 1 } },
    ]),
  ])
  return success(res, { total, active, inactive: total - active, byType })
})

router.get('/symbols', async (req, res) => {
  const units = await Unit.find({ isActive: true }, 'name symbol unitType').sort({ unitType: 1, name: 1 })
  return success(res, { units })
})

router.get('/by-type', async (req, res) => {
  const groups = await Unit.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$unitType', units: { $push: { _id: '$_id', name: '$name', symbol: '$symbol' } } } },
    { $project: { _id: 0, type: '$_id', units: 1 } },
  ])
  return success(res, { groups })
})

router.get('/:id', async (req, res) => {
  const unit = await Unit.findById(req.params.id)
  if (!unit) return error(res, 'Unit not found', 404)
  return success(res, { unit })
})

router.post('/', managerOrAdmin, async (req, res) => {
  const unit = await Unit.create(req.body)
  return created(res, { unit }, 'Unit created')
})

router.patch('/:id', managerOrAdmin, async (req, res) => {
  const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true })
  if (!unit) return error(res, 'Unit not found', 404)
  return success(res, { unit })
})

router.delete('/:id', adminOnly, async (req, res) => {
  const unit = await Unit.findById(req.params.id)
  if (!unit) return error(res, 'Unit not found', 404)
  if (unit.isSystem) return error(res, 'System units cannot be deleted', 400)
  await unit.deleteOne()
  return success(res, {}, 'Unit deleted')
})

module.exports = router
