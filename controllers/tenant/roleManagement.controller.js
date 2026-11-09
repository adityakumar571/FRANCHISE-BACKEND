import { asyncHandler } from '../../utils/asyncHandler.js'
import { apiResponse }  from '../../utils/apiResponse.js'
import { getRoleModel } from '../../models/tenant/Role.model.js'
import { getUserModel } from '../../models/tenant/user.model.js'

const MAX_CUSTOM_ROLES = 10  // max custom roles per tenant

/* ─────────────────────────────────────────────
   GET /api/roles — List all roles
───────────────────────────────────────────── */
export const getRoles = asyncHandler(async (req, res) => {
  const Role = getRoleModel(req.db)

  const roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean()
  const customCount  = roles.filter(r => !r.isSystem).length
  const systemCount  = roles.filter(r => r.isSystem).length

  return res.status(200).json(new apiResponse(200, {
    roles,
    total:          roles.length,
    systemCount,
    customCount,
    maxCustomRoles: MAX_CUSTOM_ROLES,
    canAddMore:     customCount < MAX_CUSTOM_ROLES,
  }, 'Roles fetched ✅'))
})

/* ─────────────────────────────────────────────
   POST /api/roles — Create custom role
───────────────────────────────────────────── */
export const createRole = asyncHandler(async (req, res) => {
  const { name, description, color } = req.body
  if (!name?.trim()) return res.status(400).json(new apiResponse(400, null, 'Role name is required'))

  const Role = getRoleModel(req.db)

  // Limit check
  const customCount = await Role.countDocuments({ isSystem: false })
  if (customCount >= MAX_CUSTOM_ROLES) {
    return res.status(400).json(new apiResponse(400, null, `Custom role limit reached (max ${MAX_CUSTOM_ROLES}). Delete an existing custom role to add a new one.`))
  }

  const exists = await Role.findOne({ name: name.trim() })
  if (exists) return res.status(409).json(new apiResponse(409, null, 'Role already exists'))

  const role = await Role.create({ name: name.trim(), description, color: color || '#6b7280', isSystem: false })
  return res.status(201).json(new apiResponse(201, { role }, 'Role created ✅'))
})

/* ─────────────────────────────────────────────
   PUT /api/roles/:id — Update role
───────────────────────────────────────────── */
export const updateRole = asyncHandler(async (req, res) => {
  const Role = getRoleModel(req.db)
  const role = await Role.findById(req.params.id)
  if (!role) return res.status(404).json(new apiResponse(404, null, 'Role not found'))
  if (role.isSystem && req.body.name && req.body.name !== role.name) {
    return res.status(400).json(new apiResponse(400, null, 'System role name cannot be changed'))
  }

  const { name, description, color, isActive } = req.body
  if (name)                  role.name        = name.trim()
  if (description !== undefined) role.description = description
  if (color)                 role.color       = color
  if (isActive !== undefined) role.isActive   = isActive
  await role.save()

  return res.status(200).json(new apiResponse(200, { role }, 'Role updated ✅'))
})

/* ─────────────────────────────────────────────
   DELETE /api/roles/:id — Delete custom role
───────────────────────────────────────────── */
export const deleteRole = asyncHandler(async (req, res) => {
  const Role = getRoleModel(req.db)
  const role = await Role.findById(req.params.id)
  if (!role) return res.status(404).json(new apiResponse(404, null, 'Role not found'))
  if (role.isSystem) return res.status(400).json(new apiResponse(400, null, 'System roles cannot be deleted'))

  // Check if any user has this role
  const User = getUserModel(req.db)
  const usersWithRole = await User.countDocuments({ role: role.name })
  if (usersWithRole > 0) {
    return res.status(400).json(new apiResponse(400, null, `Cannot delete — ${usersWithRole} user(s) have this role. Reassign them first.`))
  }

  await role.deleteOne()
  return res.status(200).json(new apiResponse(200, null, 'Role deleted ✅'))
})
