import express from 'express'
import MasterMedicineController from '../controllers/MasterMedicineController.js'
import { verifyMainJWT } from '../middleware/authTypeMiddlewareMain.js'

const router = express.Router()

// Public routes (no auth needed for autocomplete)
router.get('/search', MasterMedicineController.searchMasterMedicines)
router.get('/categories', MasterMedicineController.getCategories)
router.get('/category/:category', MasterMedicineController.getMedicinesByCategory)

// Protected route
router.get('/', verifyMainJWT, MasterMedicineController.getAllMasterMedicines)

export default router
