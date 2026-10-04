import jwt from 'jsonwebtoken'
import { apiError } from '../utils/apiError.js'
import Supplier from '../models/Supplier.model.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const verifySupplierJWT = asyncHandler(async (req, res, next) => {
  try {
    // Get token from cookies or Authorization header
    const token = 
      req.cookies?.supplierToken ||
      req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return apiError(res, 401, false, "Access denied. No token provided.")
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    if (decoded.type !== 'supplier') {
      return apiError(res, 401, false, "Invalid token type")
    }

    // Find supplier
    const supplier = await Supplier.findById(decoded.supplierId).select('-password')
    
    if (!supplier) {
      return apiError(res, 401, false, "Token is valid but supplier not found")
    }

    // Check if supplier is active
    if (supplier.status !== 'Active') {
      return apiError(res, 403, false, `Account is ${supplier.status.toLowerCase()}. Please contact support.`)
    }

    req.supplier = supplier
    next()
  } catch (error) {
    console.error('Supplier JWT verification error:', error)
    return apiError(res, 401, false, error?.message || "Invalid token")
  }
})

export const checkSupplierStatus = (...allowedStatuses) => {
  return (req, res, next) => {
    try {
      if (!req.supplier) {
        return apiError(res, 401, false, "Unauthorized: No supplier data")
      }

      if (!allowedStatuses.includes(req.supplier.status)) {
        return apiError(res, 403, false, `Access denied. Account status: ${req.supplier.status}`)
      }

      next()
    } catch (error) {
      return apiError(res, 500, false, error.message || "Authorization error")
    }
  }
}