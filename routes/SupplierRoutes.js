import express from 'express'
import { body } from 'express-validator'
import SupplierController from '../controllers/SupplierController.js'
import { verifyMainJWT, authorizeMainUserType } from '../middleware/authTypeMiddlewareMain.js'

const router = express.Router()

// Validation rules
const supplierValidationRules = [
  body('companyName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
  
  body('contactPerson')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Contact person name must be between 2 and 50 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('phone')
    .isMobilePhone('en-IN')
    .withMessage('Please provide a valid Indian phone number'),
  
  body('alternatePhone')
    .optional()
    .isMobilePhone('en-IN')
    .withMessage('Please provide a valid alternate phone number'),
  
  body('address.street')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Street address must be between 5 and 200 characters'),
  
  body('address.city')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be between 2 and 50 characters'),
  
  body('address.state')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('State must be between 2 and 50 characters'),
  
  body('address.pincode')
    .isPostalCode('IN')
    .withMessage('Please provide a valid Indian pincode'),
  
  body('businessType')
    .isIn(['Manufacturer', 'Distributor', 'Retailer', 'Wholesaler', 'Service Provider'])
    .withMessage('Please select a valid business type'),
  
  body('gstNumber')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid GST number'),
  
  body('panNumber')
    .optional()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage('Please provide a valid PAN number'),
  
  body('creditLimit')
    .optional()
    .isNumeric()
    .withMessage('Credit limit must be a number'),
  
  body('paymentTerms')
    .optional()
    .isIn(['Cash', 'Net 30', 'Net 60', 'Net 90', 'Custom'])
    .withMessage('Please select a valid payment term'),
  
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5')
]

const productValidationRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  
  body('category')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category must be between 2 and 50 characters'),
  
  body('price')
    .isNumeric()
    .withMessage('Price must be a number'),
  
  body('unit')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Unit must be between 1 and 20 characters')
]

// Apply auth middleware to all routes
router.use(verifyMainJWT)

// Routes accessible by Super Admin and Admin
// Get all suppliers with pagination and filters
router.get('/', authorizeMainUserType('Super Admin', 'Admin'), SupplierController.getAllSuppliers)

// Get supplier statistics
router.get('/stats', authorizeMainUserType('Super Admin', 'Admin'), SupplierController.getSupplierStats)

// Get suppliers for dropdown
router.get('/dropdown', authorizeMainUserType('Super Admin', 'Admin', 'Manager'), SupplierController.getSuppliersDropdown)

// Get supplier by ID
router.get('/:id', authorizeMainUserType('Super Admin', 'Admin'), SupplierController.getSupplierById)

// Create new supplier
router.post('/', authorizeMainUserType('Super Admin', 'Admin'), supplierValidationRules, SupplierController.createSupplier)

// Update supplier
router.put('/:id', authorizeMainUserType('Super Admin', 'Admin'), supplierValidationRules, SupplierController.updateSupplier)

// Update supplier status
router.patch('/:id/status', authorizeMainUserType('Super Admin', 'Admin'), SupplierController.updateSupplierStatus)

// Delete supplier (soft delete)
router.delete('/:id', authorizeMainUserType('Super Admin', 'Admin'), SupplierController.deleteSupplier)

// Permanently delete supplier (Super Admin only)
router.delete('/:id/permanent', authorizeMainUserType('Super Admin'), SupplierController.permanentDeleteSupplier)

// Add product to supplier
router.post('/:id/products', authorizeMainUserType('Super Admin', 'Admin'), productValidationRules, SupplierController.addProduct)

// Remove product from supplier
router.delete('/:id/products/:productId', authorizeMainUserType('Super Admin', 'Admin'), SupplierController.removeProduct)

export default router