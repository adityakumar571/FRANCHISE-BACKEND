import jwt from 'jsonwebtoken'
import { apiError } from '../utils/apiError.js'
import Supplier from '../models/Supplier.model.js'  // Global Supplier model
import { asyncHandler } from '../utils/asyncHandler.js'

export const verifySupplierJWT = asyncHandler(async (req, res, next) => {
  try {
    // Get token from cookies or Authorization header
    const token = 
      req.cookies?.supplierToken ||
      req.header("Authorization")?.replace("Bearer ", "")

    console.log('🔐 [verifySupplierJWT] Checking supplier token...')
    console.log('🔐 Cookie token exists:', !!req.cookies?.supplierToken)
    console.log('🔐 Header token exists:', !!req.header("Authorization"))

    if (!token) {
      console.log('❌ [verifySupplierJWT] No token found')
      return apiError(res, 401, false, "Access denied. No token provided.")
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    console.log('🔐 [verifySupplierJWT] Token decoded:', { type: decoded.type, supplierId: decoded.supplierId })
    
    if (decoded.type !== 'supplier') {
      console.log('❌ [verifySupplierJWT] Invalid token type:', decoded.type)
      return apiError(res, 401, false, "Invalid token type")
    }

    // ✅ Find supplier in GLOBAL DB (not tenant DB)
    const supplier = await Supplier.findById(decoded.supplierId).select('-password')
    
    if (!supplier) {
      console.log('❌ [verifySupplierJWT] Supplier not found:', decoded.supplierId)
      return apiError(res, 401, false, "Token is valid but supplier not found")
    }

    // Check if supplier is active
    if (supplier.status !== 'Active') {
      console.log('❌ [verifySupplierJWT] Supplier inactive:', supplier.status)
      return apiError(res, 403, false, `Account is ${supplier.status}. Please contact support.`)
    }

    console.log('✅ [verifySupplierJWT] Supplier authenticated:', supplier.companyName)
    req.supplier = supplier
    next()
  } catch (error) {
    console.error('❌ [verifySupplierJWT] Error:', error.message)
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