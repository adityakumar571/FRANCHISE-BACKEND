import Supplier from '../models/Supplier.model.js'
import { validationResult } from 'express-validator'
import { successResponse, errorResponse, paginationResponse } from '../utils/responseHandler.js'

class SupplierController {
  // Get all suppliers with pagination and filters
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
      
      if (status) {
        query.status = status
      }
      
      if (businessType) {
        query.businessType = businessType
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit)
      
      // Sort order
      const sortDirection = sortOrder === 'desc' ? -1 : 1
      const sort = { [sortBy]: sortDirection }

      // Execute query
      const [suppliers, totalCount] = await Promise.all([
        Supplier.find(query)
          .populate('createdBy', 'name email')
          .populate('lastModifiedBy', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Supplier.countDocuments(query)
      ])

      const totalPages = Math.ceil(totalCount / parseInt(limit))

      return paginationResponse(res, 200, 'Suppliers fetched successfully', {
        suppliers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecords: totalCount,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        filters: {
          search,
          status,
          businessType,
          sortBy,
          sortOrder
        }
      })
    } catch (error) {
      console.error('Get suppliers error:', error)
      return errorResponse(res, 500, 'Failed to fetch suppliers', error.message)
    }
  }

  // Get supplier by ID
  async getSupplierById(req, res) {
    try {
      const { id } = req.params
      
      const supplier = await Supplier.findById(id)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')
        .lean()

      if (!supplier) {
        return errorResponse(res, 404, 'Supplier not found')
      }

      return successResponse(res, 200, 'Supplier fetched successfully', supplier)
    } catch (error) {
      console.error('Get supplier by ID error:', error)
      return errorResponse(res, 500, 'Failed to fetch supplier', error.message)
    }
  }

  // Create new supplier
  async createSupplier(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, 'Validation failed', errors.array())
      }

      const supplierData = {
        ...req.body,
        createdBy: req.user.id
      }

      // Check if email already exists
      const existingSupplier = await Supplier.findOne({ email: supplierData.email })
      if (existingSupplier) {
        return errorResponse(res, 400, 'Supplier with this email already exists')
      }

      const supplier = new Supplier(supplierData)
      await supplier.save()

      const populatedSupplier = await Supplier.findById(supplier._id)
        .populate('createdBy', 'name email')

      return successResponse(res, 201, 'Supplier created successfully', populatedSupplier)
    } catch (error) {
      console.error('Create supplier error:', error)
      if (error.code === 11000) {
        return errorResponse(res, 400, 'Supplier with this email already exists')
      }
      return errorResponse(res, 500, 'Failed to create supplier', error.message)
    }
  }

  // Update supplier
  async updateSupplier(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, 'Validation failed', errors.array())
      }

      const { id } = req.params
      const updateData = {
        ...req.body,
        lastModifiedBy: req.user.id
      }

      // Check if email is being changed and if it already exists
      if (updateData.email) {
        const existingSupplier = await Supplier.findOne({ 
          email: updateData.email,
          _id: { $ne: id }
        })
        if (existingSupplier) {
          return errorResponse(res, 400, 'Supplier with this email already exists')
        }
      }

      const supplier = await Supplier.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate('createdBy lastModifiedBy', 'name email')

      if (!supplier) {
        return errorResponse(res, 404, 'Supplier not found')
      }

      return successResponse(res, 200, 'Supplier updated successfully', supplier)
    } catch (error) {
      console.error('Update supplier error:', error)
      if (error.code === 11000) {
        return errorResponse(res, 400, 'Supplier with this email already exists')
      }
      return errorResponse(res, 500, 'Failed to update supplier', error.message)
    }
  }

  // Delete supplier (soft delete by changing status)
  async deleteSupplier(req, res) {
    try {
      const { id } = req.params

      const supplier = await Supplier.findByIdAndUpdate(
        id,
        { 
          status: 'Inactive',
          lastModifiedBy: req.user.id
        },
        { new: true }
      )

      if (!supplier) {
        return errorResponse(res, 404, 'Supplier not found')
      }

      return successResponse(res, 200, 'Supplier deactivated successfully', supplier)
    } catch (error) {
      console.error('Delete supplier error:', error)
      return errorResponse(res, 500, 'Failed to delete supplier', error.message)
    }
  }

  // Permanently delete supplier
  async permanentDeleteSupplier(req, res) {
    try {
      const { id } = req.params

      const supplier = await Supplier.findByIdAndDelete(id)

      if (!supplier) {
        return errorResponse(res, 404, 'Supplier not found')
      }

      return successResponse(res, 200, 'Supplier permanently deleted successfully')
    } catch (error) {
      console.error('Permanent delete supplier error:', error)
      return errorResponse(res, 500, 'Failed to permanently delete supplier', error.message)
    }
  }

  // Update supplier status
  async updateSupplierStatus(req, res) {
    try {
      const { id } = req.params
      const { status } = req.body

      if (!['Active', 'Inactive', 'Blacklisted'].includes(status)) {
        return errorResponse(res, 400, 'Invalid status value')
      }

      const supplier = await Supplier.findByIdAndUpdate(
        id,
        { 
          status,
          lastModifiedBy: req.user.id
        },
        { new: true }
      ).populate('createdBy lastModifiedBy', 'name email')

      if (!supplier) {
        return errorResponse(res, 404, 'Supplier not found')
      }

      return successResponse(res, 200, 'Supplier status updated successfully', supplier)
    } catch (error) {
      console.error('Update supplier status error:', error)
      return errorResponse(res, 500, 'Failed to update supplier status', error.message)
    }
  }

  // Add product to supplier
  async addProduct(req, res) {
    try {
      const { id } = req.params
      const productData = req.body

      const supplier = await Supplier.findById(id)
      if (!supplier) {
        return errorResponse(res, 404, 'Supplier not found')
      }

      supplier.products.push(productData)
      supplier.lastModifiedBy = req.user.id
      await supplier.save()

      return successResponse(res, 200, 'Product added successfully', supplier)
    } catch (error) {
      console.error('Add product error:', error)
      return errorResponse(res, 500, 'Failed to add product', error.message)
    }
  }

  // Remove product from supplier
  async removeProduct(req, res) {
    try {
      const { id, productId } = req.params

      const supplier = await Supplier.findById(id)
      if (!supplier) {
        return errorResponse(res, 404, 'Supplier not found')
      }

      const product = supplier.products.id(productId)
      if (!product) {
        return errorResponse(res, 404, 'Product not found')
      }

      product.remove()
      supplier.lastModifiedBy = req.user.id
      await supplier.save()

      return successResponse(res, 200, 'Product removed successfully', supplier)
    } catch (error) {
      console.error('Remove product error:', error)
      return errorResponse(res, 500, 'Failed to remove product', error.message)
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
            activeSuppliers: {
              $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
            },
            inactiveSuppliers: {
              $sum: { $cond: [{ $eq: ['$status', 'Inactive'] }, 1, 0] }
            },
            blacklistedSuppliers: {
              $sum: { $cond: [{ $eq: ['$status', 'Blacklisted'] }, 1, 0] }
            },
            averageRating: { $avg: '$rating' }
          }
        }
      ])

      const businessTypeStats = await Supplier.aggregate([
        {
          $group: {
            _id: '$businessType',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ])

      const result = {
        general: stats[0] || {
          totalSuppliers: 0,
          activeSuppliers: 0,
          inactiveSuppliers: 0,
          blacklistedSuppliers: 0,
          averageRating: 0
        },
        businessTypes: businessTypeStats
      }

      return successResponse(res, 200, 'Supplier statistics fetched successfully', result)
    } catch (error) {
      console.error('Get supplier stats error:', error)
      return errorResponse(res, 500, 'Failed to fetch supplier statistics', error.message)
    }
  }

  // Get suppliers for dropdown (simplified data)
  async getSuppliersDropdown(req, res) {
    try {
      const { status = 'Active', businessType = '' } = req.query

      const query = { status }
      if (businessType) {
        query.businessType = businessType
      }

      const suppliers = await Supplier.find(query)
        .select('companyName contactPerson email phone businessType')
        .sort({ companyName: 1 })
        .lean()

      return successResponse(res, 200, 'Suppliers dropdown data fetched successfully', suppliers)
    } catch (error) {
      console.error('Get suppliers dropdown error:', error)
      return errorResponse(res, 500, 'Failed to fetch suppliers dropdown data', error.message)
    }
  }
}

export default new SupplierController()