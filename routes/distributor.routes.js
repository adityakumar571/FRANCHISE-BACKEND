import express from 'express'
import {
  distributorLogin,
  registerDistributor,
  getDistributorProfile,
  getAllDistributors,
  updateDistributor,
  deleteDistributor,
  toggleDistributorStatus,
} from '../controllers/distributor.controller.js'
import { verifyDistributor } from '../middleware/distributorAuth.middleware.js'

const router = express.Router()

// ── Public ──────────────────────────────────────────────────
router.post('/login',    distributorLogin)
router.post('/register', registerDistributor)   // called by Super Admin panel

// ── Protected (distributor JWT required) ────────────────────
router.get('/profile',   verifyDistributor, getDistributorProfile)

// ── Super Admin management ───────────────────────────────────
router.get('/all',           getAllDistributors)
router.put('/:id',           updateDistributor)
router.delete('/:id',        deleteDistributor)
router.patch('/:id/toggle',  toggleDistributorStatus)

export default router
