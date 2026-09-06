import express from 'express'
import {
  getUsers, createUser, updateUser, toggleUserStatus, deleteUser,
  getUserAccess, saveUserAccess,
  getMenuAccess, saveMenuAccess,
  resetUserPassword, getUserCredentials,
} from '../../controllers/tenant/userManagement.controller.js'
import { verifyJWT } from '../../middleware/authTypeMiddleware.js'

const router = express.Router()

// All routes require a valid tenant JWT
router.use(verifyJWT)

/* ── Per-role menu access (static routes FIRST — before /:id patterns) ── */
router.get('/menu-access/:role',  getMenuAccess)
router.put('/menu-access/:role',  saveMenuAccess)

/* ── Users CRUD ── */
router.get('/',              getUsers)
router.post('/',             createUser)
router.put('/:id',           updateUser)
router.patch('/:id/toggle',  toggleUserStatus)
router.delete('/:id',        deleteUser)

/* ── Password management (admin) ── */
router.patch('/:id/reset-password',  resetUserPassword)
router.get('/:id/credentials',       getUserCredentials)

/* ── Per-user module access ── */
router.get('/:id/access',    getUserAccess)
router.put('/:id/access',    saveUserAccess)

export default router
