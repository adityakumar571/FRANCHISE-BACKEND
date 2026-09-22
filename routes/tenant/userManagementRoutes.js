import express from 'express'
import {
  getUsers, createUser, updateUser, toggleUserStatus, deleteUser,
  getUserAccess, saveUserAccess,
  getMenuAccess, saveMenuAccess,
  resetUserPassword, getUserCredentials,
  saveUserMenuAccess,
} from '../../controllers/tenant/userManagement.controller.js'
import { verifyJWT } from '../../middleware/authTypeMiddleware.js'

const router = express.Router()

router.use(verifyJWT)

/* ── Per-role menu access (static routes FIRST) ── */
router.get('/menu-access/:role',      getMenuAccess)
router.put('/menu-access/:role',      saveMenuAccess)

/* ── Users CRUD ── */
router.get('/',              getUsers)
router.post('/',             createUser)
router.put('/:id',           updateUser)
router.patch('/:id/toggle',  toggleUserStatus)
router.delete('/:id',        deleteUser)

/* ── Password management ── */
router.patch('/:id/reset-password',  resetUserPassword)
router.get('/:id/credentials',       getUserCredentials)

/* ── Per-user module + menu access ── */
router.get('/:id/access',        getUserAccess)
router.put('/:id/access',        saveUserAccess)
router.put('/:id/menu-access',   saveUserMenuAccess)    // ← NEW: per-user menu access

export default router
