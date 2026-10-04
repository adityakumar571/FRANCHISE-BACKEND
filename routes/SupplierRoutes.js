import express from 'express'
import { body } from 'express-validator'
import SupplierAuthController from '../controllers/SupplierAuthController.js'
import SupplierMedicineController from '../controllers/SupplierMedicineController.js'
import SupplierController from '../controllers/SupplierController.js'
import { verifySupplierJWT, checkSupplierStatus } from '../middleware/supplierAuth.middleware.js'
import { verifyMainJWT, authorizeMainUserType } from '../middleware/authTypeMiddlewareMain.js'

const router = express.Router()

// Validation rules for supplier creation (Super Admin)
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
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('phone')
    .isMobilePhone('en-IN')
    .withMessage('Please provide a valid Indian phone number'),
  
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
    .withMessage('Please select a valid business type')
]

// Validation rules for registration
const registrationValidationRules = [
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
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('phone')
    .isMobilePhone('en-IN')
    .withMessage('Please provide a valid Indian phone number'),
  
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
    .withMessage('Please select a valid business type')
]

// Login validation
const loginValidationRules = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
]

// Medicine validation
const medicineValidationRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Medicine name must be between 2 and 100 characters'),
  
  body('category')
    .isIn(['Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Cream', 'Ointment', 'Other'])
    .withMessage('Please select a valid category'),
  
  body('mrp')
    .isNumeric()
    .withMessage('MRP must be a number')
    .isFloat({ min: 0 })
    .withMessage('MRP must be positive'),
  
  body('supplierPrice')
    .isNumeric()
    .withMessage('Supplier price must be a number')
    .isFloat({ min: 0 })
    .withMessage('Supplier price must be positive'),
  
  body('stock')
    .isInt({ min: 0 })
    .withMessage('Stock must be a positive integer')
]

// ===== PUBLIC ROUTES (No Authentication) =====
// Supplier self-registration and login

// Supplier Registration (Public)
router.post('/auth/register', registrationValidationRules, SupplierAuthController.register)

// Supplier Login (Public)
router.post('/auth/login', loginValidationRules, SupplierAuthController.login)

// Forgot Password (Public)
router.post('/auth/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], SupplierAuthController.forgotPassword)

// Reset Password (Public)
router.post('/auth/reset-password/:token', [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], SupplierAuthController.resetPassword)

// ===== PROTECTED ROUTES (Supplier Authentication Required) =====
router.use('/auth', verifySupplierJWT)
router.use('/medicines', verifySupplierJWT, checkSupplierStatus('Active'))
router.use('/dashboard', verifySupplierJWT, checkSupplierStatus('Active'))

// Auth routes (protected)
router.get('/auth/profile', SupplierAuthController.getProfile)
router.put('/auth/profile', SupplierAuthController.updateProfile)
router.post('/auth/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], SupplierAuthController.changePassword)
router.post('/auth/logout', SupplierAuthController.logout)

// Dashboard routes
router.get('/dashboard/stats', SupplierAuthController.getDashboardStats)

// Medicine management routes
router.get('/medicines', SupplierMedicineController.getMedicines)
router.get('/medicines/categories', SupplierMedicineController.getCategories)
router.get('/medicines/export', SupplierMedicineController.exportMedicines)
router.get('/medicines/:medicineId', SupplierMedicineController.getMedicineById)
router.post('/medicines', medicineValidationRules, SupplierMedicineController.addMedicine)
router.put('/medicines/:medicineId', medicineValidationRules, SupplierMedicineController.updateMedicine)
router.patch('/medicines/:medicineId/stock', [
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a positive integer')
], SupplierMedicineController.updateStock)
router.patch('/medicines/:medicineId/toggle', SupplierMedicineController.toggleAvailability)
router.delete('/medicines/:medicineId', SupplierMedicineController.deleteMedicine)
router.put('/medicines/bulk-update', SupplierMedicineController.bulkUpdate)

// ===== SUPER ADMIN ROUTES ONLY (Supplier Management) =====
router.use('/admin', verifyMainJWT, authorizeMainUserType('Super Admin'))

// Get all suppliers for super admin ONLY
router.get('/admin/list', SupplierController.getAllSuppliers)
router.get('/admin/stats', SupplierController.getSupplierStats)
router.get('/admin/:id', SupplierController.getSupplierById)

// Create new supplier (Super Admin only)
router.post('/admin/create', supplierValidationRules, SupplierController.createSupplier)

// Update supplier status
router.patch('/admin/:id/status', SupplierController.updateSupplierStatus)
router.delete('/admin/:id', SupplierController.deleteSupplier)

export default router