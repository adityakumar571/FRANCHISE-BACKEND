import Distributor from '../models/Distributor.model.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { apiResponse } from '../utils/apiResponse.js'

// ─────────────────────────────────────────────────────────────
// POST /api/distributor/login
// Body: { mobile, password }
// ─────────────────────────────────────────────────────────────
export const distributorLogin = asyncHandler(async (req, res) => {
  const { mobile, password } = req.body

  if (!mobile || !password) {
    return res.status(400).json(new apiResponse(400, null, 'Mobile and password are required.'))
  }

  const dist = await Distributor.findOne({ mobile: mobile.trim() })

  if (!dist) {
    return res.status(401).json(new apiResponse(401, null, 'Invalid mobile number or password.'))
  }

  // Plain-text comparison (same pattern as rest of this project)
  if (dist.password !== password) {
    return res.status(401).json(new apiResponse(401, null, 'Invalid mobile number or password.'))
  }

  if (!dist.isActive) {
    return res.status(403).json(new apiResponse(403, null, 'Your distributor account is inactive. Contact support.'))
  }

  const token = dist.generateAuthToken()

  dist.lastLogin = new Date()
  await dist.save()

  return res.status(200).json(
    new apiResponse(200, {
      token,
      distributor: {
        _id:              dist._id,
        name:             dist.name,
        distributorCode:  dist.distributorCode,
        mobile:           dist.mobile,
        email:            dist.email,
        contactPerson:    dist.contactPerson,
        city:             dist.city,
        type:             dist.type,
        totalSkus:        dist.totalSkus,
        activeFranchises: dist.activeFranchises,
        rating:           dist.rating,
      },
    }, 'Distributor login successful ✅')
  )
})

// ─────────────────────────────────────────────────────────────
// POST /api/distributor/register  (Super Admin use only)
// ─────────────────────────────────────────────────────────────
export const registerDistributor = asyncHandler(async (req, res) => {
  const {
    name, mobile, password, email, contactPerson,
    type, gstNo, drugLicenseNo, panNo,
    addressLine1, city, state, pincode,
    distributorCode,
  } = req.body

  if (!name || !mobile || !password) {
    return res.status(400).json(new apiResponse(400, null, 'name, mobile and password are required.'))
  }

  const exists = await Distributor.findOne({ mobile: mobile.trim() })
  if (exists) {
    return res.status(409).json(new apiResponse(409, null, 'A distributor with this mobile number already exists.'))
  }

  // Auto-generate distributor code if not provided
  const code = distributorCode || `DIST${Date.now().toString().slice(-6)}`

  const dist = await Distributor.create({
    name, mobile: mobile.trim(), password,
    email, contactPerson, type,
    gstNo, drugLicenseNo, panNo,
    addressLine1, city, state, pincode,
    distributorCode: code,
  })

  return res.status(201).json(
    new apiResponse(201, {
      distributor: {
        _id:             dist._id,
        name:            dist.name,
        distributorCode: dist.distributorCode,
        mobile:          dist.mobile,
      },
      credentials: { mobile: dist.mobile, password },
    }, 'Distributor registered successfully 🚀')
  )
})

// ─────────────────────────────────────────────────────────────
// GET /api/distributor/profile  (auth required)
// ─────────────────────────────────────────────────────────────
export const getDistributorProfile = asyncHandler(async (req, res) => {
  const dist = await Distributor.findById(req.distributor._id).select('-password')
  if (!dist) {
    return res.status(404).json(new apiResponse(404, null, 'Distributor not found.'))
  }
  return res.status(200).json(new apiResponse(200, { distributor: dist }, 'Profile fetched ✅'))
})

// ─────────────────────────────────────────────────────────────
// GET /api/distributor/all  (Super Admin — list all)
// ─────────────────────────────────────────────────────────────
export const getAllDistributors = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, isActive } = req.query

  const filter = {}
  if (isActive !== undefined) filter.isActive = isActive === 'true'
  if (search) {
    const re = new RegExp(search.trim(), 'i')
    filter.$or = [{ name: re }, { mobile: re }, { distributorCode: re }, { city: re }]
  }

  const total = await Distributor.countDocuments(filter)
  const distributors = await Distributor.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean()

  return res.status(200).json(
    new apiResponse(200, {
      distributors,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
    }, 'Distributors fetched ✅')
  )
})

// ─────────────────────────────────────────────────────────────
// PUT /api/distributor/:id  (Super Admin)
// ─────────────────────────────────────────────────────────────
export const updateDistributor = asyncHandler(async (req, res) => {
  const { id } = req.params
  // Don't allow password update via this route — use change-password
  delete req.body.password

  const dist = await Distributor.findByIdAndUpdate(id, req.body, { new: true, runValidators: true }).select('-password')
  if (!dist) return res.status(404).json(new apiResponse(404, null, 'Distributor not found.'))

  return res.status(200).json(new apiResponse(200, { distributor: dist }, 'Updated ✅'))
})

// ─────────────────────────────────────────────────────────────
// DELETE /api/distributor/:id  (Super Admin)
// ─────────────────────────────────────────────────────────────
export const deleteDistributor = asyncHandler(async (req, res) => {
  const dist = await Distributor.findByIdAndDelete(req.params.id)
  if (!dist) return res.status(404).json(new apiResponse(404, null, 'Distributor not found.'))
  return res.status(200).json(new apiResponse(200, null, 'Distributor deleted ✅'))
})

// ─────────────────────────────────────────────────────────────
// PATCH /api/distributor/:id/toggle  (Super Admin)
// ─────────────────────────────────────────────────────────────
export const toggleDistributorStatus = asyncHandler(async (req, res) => {
  const dist = await Distributor.findById(req.params.id)
  if (!dist) return res.status(404).json(new apiResponse(404, null, 'Distributor not found.'))

  dist.isActive = !dist.isActive
  await dist.save()

  return res.status(200).json(
    new apiResponse(200, { isActive: dist.isActive }, `Distributor is now ${dist.isActive ? 'ACTIVE ✅' : 'INACTIVE ❌'}`)
  )
})
