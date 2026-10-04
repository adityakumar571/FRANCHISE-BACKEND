import Supplier from '../models/Supplier.model.js'
import jwt from 'jsonwebtoken'
import { validationResult } from 'express-validator'
import { apiError } from '../utils/apiError.js'
import { apiResponse } from '../utils/apiResponse.js'
import crypto from 'crypto'

class SupplierAuthController {
  // Supplier Registration
  async register(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return apiError(res, 400, false, 'Validation failed', errors.array())
      }

      const {
        companyName,
        contactPerson,
        email,
        password,
        phone,
        address,
        businessType,
        gstNumber,
        panNumber
      } = req.body

      // Check if supplier already exists
      const existingSupplier = await Supplier.findOne({ email })
      if (existingSupplier) {
        return apiError(res, 400, false, 'Supplier with this email already exists')
      }

      // Create new supplier
      const supplier = new Supplier({
        companyName,
        contactPerson,
        email,
        password,
        phone,
        address,
        businessType,
        gstNumber,
        panNumber,
        status: 'Pending', // Needs super admin approval
      })

      await supplier.save()

      // Remove password from response
      const supplierResponse = supplier.toObject()
      delete supplierResponse.password

      return res.status(201).json(
        new apiResponse(201, supplierResponse, 'Supplier registered successfully. Please wait for admin approval.')
      )
    } catch (error) {
      console.error('Supplier registration error:', error)
      return apiError(res, 500, false, 'Registration failed', error.message)
    }
  }

  // Supplier Login
  async login(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return apiError(res, 400, false, 'Validation failed', errors.array())
      }

      const { email, password } = req.body

      // Find supplier
      const supplier = await Supplier.findOne({ email }).select('+password')
      if (!supplier) {
        return apiError(res, 401, false, 'Invalid email or password')
      }

      // Check if supplier is approved
      if (supplier.status !== 'Active') {
        return apiError(res, 403, false, `Account is ${supplier.status.toLowerCase()}. Please contact support.`)
      }

      // Verify password
      const isPasswordValid = await supplier.comparePassword(password)
      if (!isPasswordValid) {
        return apiError(res, 401, false, 'Invalid email or password')
      }

      // Update last login
      supplier.lastLogin = new Date()
      await supplier.save()

      // Generate JWT token
      const token = jwt.sign(
        { 
          supplierId: supplier._id,
          type: 'supplier',
          email: supplier.email
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
      )

      // Remove sensitive data from response
      const supplierResponse = supplier.toObject()
      delete supplierResponse.password

      // Set cookie
      const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      }

      res.cookie('supplierToken', token, cookieOptions)

      return res.status(200).json(
        new apiResponse(200, {
          supplier: supplierResponse,
          token
        }, 'Login successful')
      )
    } catch (error) {
      console.error('Supplier login error:', error)
      return apiError(res, 500, false, 'Login failed', error.message)
    }
  }

  // Get Current Supplier Profile
  async getProfile(req, res) {
    try {
      const supplier = await Supplier.findById(req.supplier._id).select('-password')
      
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      return res.status(200).json(
        new apiResponse(200, supplier, 'Profile fetched successfully')
      )
    } catch (error) {
      console.error('Get supplier profile error:', error)
      return apiError(res, 500, false, 'Failed to fetch profile', error.message)
    }
  }

  // Update Supplier Profile
  async updateProfile(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return apiError(res, 400, false, 'Validation failed', errors.array())
      }

      const updateData = { ...req.body }
      delete updateData.password // Prevent password update through this route
      delete updateData.email    // Prevent email update
      delete updateData.status   // Prevent status update

      const supplier = await Supplier.findByIdAndUpdate(
        req.supplier._id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password')

      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      return res.status(200).json(
        new apiResponse(200, supplier, 'Profile updated successfully')
      )
    } catch (error) {
      console.error('Update supplier profile error:', error)
      return apiError(res, 500, false, 'Failed to update profile', error.message)
    }
  }

  // Change Password
  async changePassword(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return apiError(res, 400, false, 'Validation failed', errors.array())
      }

      const { currentPassword, newPassword } = req.body

      const supplier = await Supplier.findById(req.supplier._id).select('+password')
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      // Verify current password
      const isCurrentPasswordValid = await supplier.comparePassword(currentPassword)
      if (!isCurrentPasswordValid) {
        return apiError(res, 401, false, 'Current password is incorrect')
      }

      // Update password
      supplier.password = newPassword
      await supplier.save()

      return res.status(200).json(
        new apiResponse(200, null, 'Password changed successfully')
      )
    } catch (error) {
      console.error('Change password error:', error)
      return apiError(res, 500, false, 'Failed to change password', error.message)
    }
  }

  // Logout
  async logout(req, res) {
    try {
      res.clearCookie('supplierToken')
      
      return res.status(200).json(
        new apiResponse(200, null, 'Logged out successfully')
      )
    } catch (error) {
      console.error('Supplier logout error:', error)
      return apiError(res, 500, false, 'Logout failed', error.message)
    }
  }

  // Forgot Password
  async forgotPassword(req, res) {
    try {
      const { email } = req.body

      const supplier = await Supplier.findOne({ email })
      if (!supplier) {
        return apiError(res, 404, false, 'No supplier found with this email')
      }

      // Generate reset token
      const resetToken = supplier.generatePasswordResetToken()
      await supplier.save()

      // In production, send email with reset link
      // For now, just return the token (remove this in production)
      const resetURL = `${req.protocol}://${req.get('host')}/api/suppliers/auth/reset-password/${resetToken}`

      return res.status(200).json(
        new apiResponse(200, { resetURL }, 'Password reset link sent to email')
      )
    } catch (error) {
      console.error('Forgot password error:', error)
      return apiError(res, 500, false, 'Failed to process forgot password request', error.message)
    }
  }

  // Reset Password
  async resetPassword(req, res) {
    try {
      const { token } = req.params
      const { password } = req.body

      // Hash token to compare with stored token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

      const supplier = await Supplier.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpiry: { $gt: Date.now() }
      })

      if (!supplier) {
        return apiError(res, 400, false, 'Token is invalid or has expired')
      }

      // Update password
      supplier.password = password
      supplier.resetPasswordToken = undefined
      supplier.resetPasswordExpiry = undefined
      await supplier.save()

      return res.status(200).json(
        new apiResponse(200, null, 'Password reset successfully')
      )
    } catch (error) {
      console.error('Reset password error:', error)
      return apiError(res, 500, false, 'Failed to reset password', error.message)
    }
  }

  // Get Dashboard Stats
  async getDashboardStats(req, res) {
    try {
      const supplier = await Supplier.findById(req.supplier._id)
      
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      const stats = {
        totalMedicines: supplier.medicines.length,
        activeMedicines: supplier.medicines.filter(m => m.isAvailable).length,
        lowStockMedicines: supplier.medicines.filter(m => m.stock <= m.minStock).length,
        expiringSoon: supplier.medicines.filter(m => {
          if (!m.expiryDate) return false
          const monthFromNow = new Date()
          monthFromNow.setMonth(monthFromNow.getMonth() + 1)
          return m.expiryDate <= monthFromNow
        }).length,
        totalStockValue: supplier.medicines.reduce((total, med) => total + (med.stock * med.supplierPrice), 0),
        categories: [...new Set(supplier.medicines.map(m => m.category))].map(category => ({
          name: category,
          count: supplier.medicines.filter(m => m.category === category).length
        }))
      }

      return res.status(200).json(
        new apiResponse(200, stats, 'Dashboard stats fetched successfully')
      )
    } catch (error) {
      console.error('Get dashboard stats error:', error)
      return apiError(res, 500, false, 'Failed to fetch dashboard stats', error.message)
    }
  }
}

export default new SupplierAuthController()