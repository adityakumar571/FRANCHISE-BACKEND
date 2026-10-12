import express from 'express'
import FranchiseSupplierController from '../controllers/FranchiseSupplierController.js'
import { verifyMainJWT, authorizeMainUserType } from '../middleware/authTypeMiddlewareMain.js'

const router = express.Router()

// Public routes (no auth required for viewing supplier comparisons)
// These allow franchises to compare rates without strict authentication
router.get('/medicines/compare/:medicineName', FranchiseSupplierController.getMedicineComparison)
router.get('/medicines/search', FranchiseSupplierController.searchMedicines)
router.get('/suppliers', FranchiseSupplierController.getActiveSuppliers)
router.get('/medicines', FranchiseSupplierController.getAllMedicines)

// Test endpoint to check auth (requires auth)
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

// Protected routes - require authentication
// Apply MAIN auth middleware - franchise admins or super admin
router.use(verifyMainJWT)
// Allow both Super Admin and regular Admin roles
router.use(authorizeMainUserType('Super Admin', 'SuperAdmin', 'Admin'))

// Get medicines by specific supplier
router.get('/suppliers/:supplierId/medicines', FranchiseSupplierController.getMedicinesBySupplier)

// Get medicine categories
router.get('/medicines/categories', FranchiseSupplierController.getMedicineCategories)

// Get top suppliers by medicine count
router.get('/suppliers/top', FranchiseSupplierController.getTopSuppliers)

export default router