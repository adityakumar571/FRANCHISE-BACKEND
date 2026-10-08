import express from 'express'
import FranchiseSupplierController from '../controllers/FranchiseSupplierController.js'
import { verifyMainJWT, authorizeMainUserType } from '../middleware/authTypeMiddlewareMain.js'

const router = express.Router()

// Use MAIN DB authentication (not tenant DB)
// This allows both Super Admin and regular franchise admins to access global suppliers

// Test endpoint to check auth
router.get('/test-auth', verifyMainJWT, (req, res) => {
  res.json({
    success: true,
    message: 'Auth working!',
    user: {
      id: req.user._id,
      role: req.user.role || req.user.accountType,
      name: req.user.name
    }
  })
})

// Apply MAIN auth middleware - franchise admins or super admin
router.use(verifyMainJWT)
// Allow both Super Admin and regular Admin roles
router.use(authorizeMainUserType('Super Admin', 'SuperAdmin', 'Admin'))

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