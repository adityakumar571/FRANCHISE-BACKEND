import express from 'express'
import {
  getUsers, createUser, updateUser, toggleUserStatus, deleteUser,
  getUserAccess, saveUserAccess,
  getMenuAccess, saveMenuAccess,
} from '../../controllers/tenant/userManagement.controller.js'
import { verifyJWT } from '../../middleware/authTypeMiddleware.js'

const router = express.Router()

// All routes require a valid tenant JWT
router.use(verifyJWT)

/* ── Users CRUD ── */
router.get('/',              getUsers)
router.post('/',             createUser)
router.put('/:id',           updateUser)
router.patch('/:id/toggle',  toggleUserStatus)
router.delete('/:id',        deleteUser)

/* ── Per-user module access ── */
router.get('/:id/access',    getUserAccess)
router.put('/:id/access',    saveUserAccess)

/* ── Per-role menu access ── */
router.get('/menu-access/:role',  getMenuAccess)
router.put('/menu-access/:role',  saveMenuAccess)

export default router
