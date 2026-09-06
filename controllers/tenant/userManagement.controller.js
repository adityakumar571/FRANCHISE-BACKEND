import { asyncHandler } from '../../utils/asyncHandler.js'
import { apiResponse } from '../../utils/apiResponse.js'
import { getUserModel } from '../../models/tenant/user.model.js'
import { getUserAccessModel } from '../../models/tenant/UserAccess.model.js'
import { getMenuAccessModel } from '../../models/tenant/MenuAccess.model.js'

// Default module access per role
const DEFAULT_ACCESS = {
  SuperAdmin: ['dashboard','pos','purchase','inventory','medicines','suppliers','b2b','customers','accounts','staff','reports','settings'],
  Admin:      ['dashboard','pos','purchase','inventory','medicines','suppliers','b2b','customers','accounts','reports'],
  Accounts:   ['dashboard','accounts','reports'],
  Staff:      ['dashboard','pos','medicines','inventory'],
  Customer:   ['dashboard'],
  Vendor:     ['dashboard','b2b'],
  Accountant: ['dashboard','accounts','reports'],
  HRManager:  ['dashboard','staff','reports'],
  HRStaff:    ['dashboard','staff'],
  User:       ['dashboard'],
  Student:    ['dashboard'],
  Teacher:    ['dashboard'],
}

/* ─────────────────────────────────────────────
   GET /api/users — list all franchise users
───────────────────────────────────────────── */
export const getUsers = asyncHandler(async (req, res) => {
  const { search, role, status, page = 1, limit = 20 } = req.query
  const User = getUserModel(req.db)

  const filter = {}
  if (role)   filter.role = role
  if (status) filter.isActive = status === 'active'
  if (search) {
    const re = new RegExp(search.trim(), 'i')
    filter.$or = [{ name: re }, { userId: re }, { phone: re }, { email: re }]
  }

  const total = await User.countDocuments(filter)
  const users = await User.find(filter)
    .select('-password -otp -otpExpiration -fcmToken')
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean()

  return res.status(200).json(
    new apiResponse(200, {
      users,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
    }, 'Users fetched ✅')
  )
})

/* ─────────────────────────────────────────────
   POST /api/users — create new franchise user
───────────────────────────────────────────── */
export const createUser = asyncHandler(async (req, res) => {
  const { name, phone, email, role, password, userId: customId } = req.body

  if (!name || !role || !password) {
    return res.status(400).json(new apiResponse(400, null, 'name, role and password are required'))
  }

  const User = getUserModel(req.db)

  // Auto-generate userId if not provided
  const prefix = role.toLowerCase().slice(0, 3).toUpperCase()
  const random = Math.random().toString(36).slice(-6).toUpperCase()
  const generatedId = customId?.trim() || `${prefix}_${random}`

  const exists = await User.findOne({ userId: generatedId })
  if (exists) {
    return res.status(409).json(new apiResponse(409, null, 'User ID already exists. Try again.'))
  }

  const user = await User.create({
    userId: generatedId,
    name, phone, email, role, password,
    isNew: false,
    isActive: true,
  })

  // Set default module access
  const UserAccess = getUserAccessModel(req.db)
  await UserAccess.findOneAndUpdate(
    { userId: user._id },
    { $set: { modules: DEFAULT_ACCESS[role] || ['dashboard'] } },
    { upsert: true, new: true }
  )

  return res.status(201).json(
    new apiResponse(201, {
      user: { _id: user._id, userId: user.userId, name: user.name, role: user.role, phone: user.phone, email: user.email, isActive: user.isActive },
      credentials: { userId: generatedId, password },
    }, 'User created ✅')
  )
})

/* ─────────────────────────────────────────────
   PUT /api/users/:id — update user
───────────────────────────────────────────── */
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  delete req.body.password  // password update via separate endpoint
  delete req.body.userId    // userId is immutable

  const User = getUserModel(req.db)
  const user = await User.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
    .select('-password -otp -otpExpiration -fcmToken')

  if (!user) return res.status(404).json(new apiResponse(404, null, 'User not found'))
  return res.status(200).json(new apiResponse(200, { user }, 'User updated ✅'))
})

/* ─────────────────────────────────────────────
   PATCH /api/users/:id/toggle — toggle isActive
───────────────────────────────────────────── */
export const toggleUserStatus = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db)
  const user = await User.findById(req.params.id)
  if (!user) return res.status(404).json(new apiResponse(404, null, 'User not found'))
  user.isActive = !user.isActive
  await user.save()
  return res.status(200).json(new apiResponse(200, { isActive: user.isActive }, `User is now ${user.isActive ? 'Active ✅' : 'Inactive ❌'}`))
})

/* ─────────────────────────────────────────────
   DELETE /api/users/:id
───────────────────────────────────────────── */
export const deleteUser = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db)
  const user = await User.findByIdAndDelete(req.params.id)
  if (!user) return res.status(404).json(new apiResponse(404, null, 'User not found'))
  return res.status(200).json(new apiResponse(200, null, 'User deleted ✅'))
})

/* ─────────────────────────────────────────────
   GET /api/users/:id/access — get module access
───────────────────────────────────────────── */
export const getUserAccess = asyncHandler(async (req, res) => {
  const UserAccess = getUserAccessModel(req.db)
  const User = getUserModel(req.db)

  const user = await User.findById(req.params.id).select('role')
  if (!user) return res.status(404).json(new apiResponse(404, null, 'User not found'))

  let access = await UserAccess.findOne({ userId: req.params.id }).lean()
  if (!access) {
    // Return defaults for this role
    return res.status(200).json(new apiResponse(200, {
      userId: req.params.id,
      modules: DEFAULT_ACCESS[user.role] || ['dashboard'],
      isDefault: true,
    }, 'Default access ✅'))
  }
  return res.status(200).json(new apiResponse(200, { userId: req.params.id, modules: access.modules, isDefault: false }, 'Access fetched ✅'))
})

/* ─────────────────────────────────────────────
   PUT /api/users/:id/access — save module access
───────────────────────────────────────────── */
export const saveUserAccess = asyncHandler(async (req, res) => {
  const { modules } = req.body
  if (!Array.isArray(modules)) return res.status(400).json(new apiResponse(400, null, 'modules must be an array'))

  const UserAccess = getUserAccessModel(req.db)
  const access = await UserAccess.findOneAndUpdate(
    { userId: req.params.id },
    { $set: { modules } },
    { upsert: true, new: true }
  )
  return res.status(200).json(new apiResponse(200, { modules: access.modules }, 'Access saved ✅'))
})

/* ─────────────────────────────────────────────
   PATCH /api/users/:id/reset-password — admin resets any user's password
───────────────────────────────────────────── */
export const resetUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json(new apiResponse(400, null, 'newPassword must be at least 6 characters'))
  }

  const User = getUserModel(req.db)
  const user = await User.findById(req.params.id)
  if (!user) return res.status(404).json(new apiResponse(404, null, 'User not found'))

  user.password  = newPassword   // plain-text (matches existing system pattern)
  user.updatedAt = new Date()
  await user.save()

  return res.status(200).json(
    new apiResponse(200, {
      userId:   user.userId,
      name:     user.name,
      role:     user.role,
    }, `Password reset for ${user.name} ✅`)
  )
})

/* ─────────────────────────────────────────────
   GET /api/users/:id/credentials — return userId + password for admin view
───────────────────────────────────────────── */
export const getUserCredentials = asyncHandler(async (req, res) => {
  const User = getUserModel(req.db)
  const user = await User.findById(req.params.id).select('userId password name role')
  if (!user) return res.status(404).json(new apiResponse(404, null, 'User not found'))

  return res.status(200).json(
    new apiResponse(200, {
      userId:   user.userId,
      password: user.password,
      name:     user.name,
      role:     user.role,
    }, 'Credentials fetched ✅')
  )
})

/* ─────────────────────────────────────────────
   GET /api/menu-access/:role — get menu access
───────────────────────────────────────────── */
export const getMenuAccess = asyncHandler(async (req, res) => {
  const MenuAccess = getMenuAccessModel(req.db)
  const doc = await MenuAccess.findOne({ role: req.params.role }).lean()
  if (!doc) {
    // Return empty (frontend will use its own defaults)
    return res.status(200).json(new apiResponse(200, { role: req.params.role, items: {}, isDefault: true }, 'Default menu access ✅'))
  }
  // Convert Map to plain object
  const items = Object.fromEntries(doc.items || new Map())
  return res.status(200).json(new apiResponse(200, { role: req.params.role, items, isDefault: false }, 'Menu access fetched ✅'))
})

/* ─────────────────────────────────────────────
   PUT /api/menu-access/:role — save menu access
───────────────────────────────────────────── */
export const saveMenuAccess = asyncHandler(async (req, res) => {
  const { items } = req.body
  if (!items || typeof items !== 'object') return res.status(400).json(new apiResponse(400, null, 'items must be an object'))

  const MenuAccess = getMenuAccessModel(req.db)
  const doc = await MenuAccess.findOneAndUpdate(
    { role: req.params.role },
    { $set: { items: new Map(Object.entries(items)) } },
    { upsert: true, new: true }
  )
  return res.status(200).json(new apiResponse(200, { role: doc.role, items: Object.fromEntries(doc.items) }, 'Menu access saved ✅'))
})
