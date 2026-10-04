import express from 'express'
import FranchiseSupplierController from '../controllers/FranchiseSupplierController.js'
import { verifyJWT, authorizeUserType } from '../middleware/authTypeMiddleware.js'

const router = express.Router()

// Apply auth middleware - only authenticated franchise users (NOT Super Admin)
router.use(verifyJWT)
router.use(authorizeUserType('Admin', 'Manager', 'Staff'))

// Get all active suppliers (for franchise admins to view)
router.get('/suppliers', FranchiseSupplierController.getActiveSuppliers)

// Get all medicines from all suppliers (for comparison)
router.get('/medicines', FranchiseSupplierController.getAllMedicines)

// Compare medicine prices across suppliers
router.get('/medicines/compare/:medicineName', FranchiseSupplierController.compareMedicines)

// Get medicines by specific supplier
router.get('/suppliers/:supplierId/medicines', FranchiseSupplierController.getMedicinesBySupplier)

// Get medicine categories
router.get('/medicines/categories', FranchiseSupplierController.getMedicineCategories)

// Search medicines with autocomplete
router.get('/medicines/search', FranchiseSupplierController.searchMedicines)

// Get top suppliers by medicine count
router.get('/suppliers/top', FranchiseSupplierController.getTopSuppliers)

export default router