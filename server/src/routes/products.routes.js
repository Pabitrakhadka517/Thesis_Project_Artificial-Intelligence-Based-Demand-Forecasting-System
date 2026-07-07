const router = require('express').Router()
const { body } = require('express-validator')
const ctrl   = require('../controllers/products.controller')
const { protect }                   = require('../middleware/auth')
const { managerOrAdmin, managerOnly, adminOnly } = require('../middleware/authorize')
const { upload }                    = require('../middleware/upload')

router.use(protect)

// Fix #15: products had no input validation — any value including negative
// prices and invalid ObjectId references reached the database.

const createProductRules = [
  body('name').trim().notEmpty().withMessage('Product name is required')
    .isLength({ max: 200 }).withMessage('Product name cannot exceed 200 characters'),
  body('sku').trim().notEmpty().withMessage('SKU is required')
    .isLength({ max: 50 }).withMessage('SKU cannot exceed 50 characters'),
  body('category').notEmpty().withMessage('Category is required')
    .isMongoId().withMessage('Invalid category ID'),
  body('buyingPrice').isFloat({ min: 0 }).withMessage('Buying price must be a non-negative number'),
  body('sellingPrice').isFloat({ min: 0 }).withMessage('Selling price must be a non-negative number'),
  body('currentStock').optional().isInt({ min: 0 }).withMessage('Current stock must be a non-negative integer'),
  body('minStock').optional().isInt({ min: 0 }).withMessage('Min stock must be a non-negative integer'),
  body('maxStock').optional().isInt({ min: 0 }).withMessage('Max stock must be a non-negative integer'),
  body('reorderLevel').optional().isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
  body('leadTimeDays').optional().isInt({ min: 0 }).withMessage('Lead time must be a non-negative integer'),
  body('supplier').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid supplier ID'),
]

const updateProductRules = [
  body('name').optional().trim().notEmpty().withMessage('Product name cannot be blank')
    .isLength({ max: 200 }).withMessage('Product name cannot exceed 200 characters'),
  body('category').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid category ID'),
  body('supplier').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid supplier ID'),
  body('buyingPrice').optional().isFloat({ min: 0 }).withMessage('Buying price must be a non-negative number'),
  body('sellingPrice').optional().isFloat({ min: 0 }).withMessage('Selling price must be a non-negative number'),
  body('currentStock').optional().isInt({ min: 0 }).withMessage('Current stock must be a non-negative integer'),
  body('minStock').optional().isInt({ min: 0 }).withMessage('Min stock must be a non-negative integer'),
  body('maxStock').optional().isInt({ min: 0 }).withMessage('Max stock must be a non-negative integer'),
  body('reorderLevel').optional().isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
  body('leadTimeDays').optional().isInt({ min: 0 }).withMessage('Lead time must be a non-negative integer'),
]

router.get('/',           ctrl.getProducts)
router.get('/stats',      ctrl.getProductStats)
router.get('/:id/detail', ctrl.getProductDetail)
router.get('/:id',        ctrl.getProduct)

router.post('/',       managerOrAdmin, upload.single('image'), createProductRules, ctrl.createProduct)
router.patch('/:id',   managerOrAdmin,                         updateProductRules, ctrl.updateProduct)
router.delete('/:id',  adminOnly,                                                  ctrl.deleteProduct)

// Image lifecycle
router.post('/:id/image',   managerOrAdmin, upload.single('image'), ctrl.uploadProductImage)
router.delete('/:id/image', managerOrAdmin,                         ctrl.deleteProductImage)

module.exports = router
