import express from 'express'
import { getRoles, createRole, updateRole, deleteRole } from '../../controllers/tenant/roleManagement.controller.js'
import { verifyJWT } from '../../middleware/authTypeMiddleware.js'

const router = express.Router()
router.use(verifyJWT)

router.get('/',        getRoles)
router.post('/',       createRole)
router.put('/:id',     updateRole)
router.delete('/:id',  deleteRole)

export default router
