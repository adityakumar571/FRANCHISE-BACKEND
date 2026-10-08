import Supplier from '../models/Supplier.model.js'
import { validationResult } from 'express-validator'
import { apiError } from '../utils/apiError.js'
import { apiResponse } from '../utils/apiResponse.js'

class SupplierController {
  // Get all suppliers with pagination and filters (for Super Admin)
  async getAllSuppliers(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        status = '',
        businessType = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      // Build query
      const query = {}
      
      if (search) {
        query.$or = [
          { companyName: { $regex: search, $options: 'i' } },
          { contactPerson: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      }
      
      if (status) query.status = status
      if (businessType) query.businessType = businessType

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const sortDirection = sortOrder === 'desc' ? -1 : 1
      const sort = { [sortBy]: sortDirection }

      // Execute query
      const [suppliers, totalCount] = await Promise.all([
        Supplier.find(query)
          .populate('createdBy approvedBy', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Supplier.countDocuments(query)
      ])

      const totalPages = Math.ceil(totalCount / parseInt(limit))

      return res.status(200).json(
        new apiResponse(200, {
          suppliers,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalRecords: totalCount,
            limit: parseInt(limit)
          }
        }, 'Suppliers fetched successfully')
      )
    } catch (error) {
      return apiError(res, 500, false, 'Failed to fetch suppliers', error.message)
    }
  }

  // Get supplier by ID
  async getSupplierById(req, res) {
    try {
      const supplier = await Supplier.findById(req.params.id)
        .populate('createdBy approvedBy', 'name email')
      
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      return res.status(200).json(
        new apiResponse(200, supplier, 'Supplier fetched successfully')
      )
    } catch (error) {
      return apiError(res, 500, false, 'Failed to fetch supplier', error.message)
    }
  }

  // Create new supplier (Super Admin only)
  async createSupplier(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', JSON.stringify(errors.array(), null, 2))
        return apiError(res, 400, false, 'Validation failed', errors.array())
      }

      // Only Super Admin can create suppliers directly
      // Support both 'role' (from User model) and 'accountType' fields
      const userRole = (req.user.role || req.user.accountType || '').replace(/\s+/g, '').toLowerCase()
      const isSuperAdmin = userRole === 'superadmin'
      
      if (!isSuperAdmin) {
        return apiError(res, 403, false, 'Only Super Admin can create suppliers')
      }

      console.log('✅ Creating supplier with data:', JSON.stringify(req.body, null, 2))

      const supplierData = {
        ...req.body,
        createdBy: req.user.id,
        status: 'Active' // Super Admin created suppliers are auto-approved
      }

      // Check if email already exists
      const existingSupplier = await Supplier.findOne({ email: supplierData.email })
      if (existingSupplier) {
        return apiError(res, 400, false, 'Supplier with this email already exists')
      }

      const supplier = new Supplier(supplierData)
      await supplier.save()

      const populatedSupplier = await Supplier.findById(supplier._id)
        .populate('createdBy', 'name email')

      console.log('✅ Supplier created successfully:', supplier._id)

      return res.status(201).json(
        new apiResponse(201, populatedSupplier, 'Supplier created successfully by Super Admin')
      )
    } catch (error) {
      console.error('Create supplier error:', error)
      if (error.code === 11000) {
        return apiError(res, 400, false, 'Supplier with this email already exists')
      }
      return apiError(res, 500, false, 'Failed to create supplier', error.message)
    }
  }

  // Update supplier status (Approve/Reject/Suspend)
  async updateSupplierStatus(req, res) {
    try {
      const { status } = req.body
      const { id } = req.params

      if (!['Active', 'Inactive', 'Suspended', 'Pending'].includes(status)) {
        return apiError(res, 400, false, 'Invalid status')
      }

      const updateData = { 
        status,
        lastModifiedBy: req.user.id
      }

      if (status === 'Active') {
        updateData.approvedBy = req.user.id
        updateData.approvedAt = new Date()
      }

      const supplier = await Supplier.findByIdAndUpdate(id, updateData, { new: true })
        .populate('createdBy approvedBy', 'name email')

      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      return res.status(200).json(
        new apiResponse(200, supplier, 'Supplier status updated successfully')
      )
    } catch (error) {
      return apiError(res, 500, false, 'Failed to update supplier status', error.message)
    }
  }

  // Get supplier statistics
  async getSupplierStats(req, res) {
    try {
      const stats = await Supplier.aggregate([
        {
          $group: {
            _id: null,
            totalSuppliers: { $sum: 1 },
            activeSuppliers: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            pendingSuppliers: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
            suspendedSuppliers: { $sum: { $cond: [{ $eq: ['$status', 'Suspended'] }, 1, 0] } }
          }
        }
      ])

      const businessTypeStats = await Supplier.aggregate([
        { $group: { _id: '$businessType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])

      return res.status(200).json(
        new apiResponse(200, {
          general: stats[0] || {
            totalSuppliers: 0,
            activeSuppliers: 0,
            pendingSuppliers: 0,
            suspendedSuppliers: 0
          },
          businessTypes: businessTypeStats
        }, 'Statistics fetched successfully')
      )
    } catch (error) {
      return apiError(res, 500, false, 'Failed to fetch statistics', error.message)
    }
  }

  // Delete supplier
  async deleteSupplier(req, res) {
    try {
      const supplier = await Supplier.findByIdAndUpdate(
        req.params.id,
        { status: 'Inactive', lastModifiedBy: req.user.id },
        { new: true }
      )

      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      return res.status(200).json(
        new apiResponse(200, null, 'Supplier deactivated successfully')
      )
    } catch (error) {
      return apiError(res, 500, false, 'Failed to delete supplier', error.message)
    }
  }
}

export default new SupplierController()