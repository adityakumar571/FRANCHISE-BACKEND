import Supplier from '../models/Supplier.model.js'
import { validationResult } from 'express-validator'
import { apiError } from '../utils/apiError.js'
import { apiResponse } from '../utils/apiResponse.js'
import { syncMedicineToAllFranchises, removeMedicineFromAllFranchises } from '../utils/syncSupplierMedicines.js'

class SupplierMedicineController {
  // Get all medicines for the supplier
  async getMedicines(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        category = '',
        sortBy = 'addedAt',
        sortOrder = 'desc',
        isAvailable = '',
        lowStock = false
      } = req.query

      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      let medicines = [...supplier.medicines]

      // Apply filters
      if (search) {
        const searchRegex = new RegExp(search, 'i')
        medicines = medicines.filter(med => 
          searchRegex.test(med.name) || 
          searchRegex.test(med.genericName) || 
          searchRegex.test(med.manufacturer)
        )
      }

      if (category) {
        medicines = medicines.filter(med => med.category === category)
      }

      if (isAvailable !== '') {
        medicines = medicines.filter(med => med.isAvailable === (isAvailable === 'true'))
      }

      if (lowStock === 'true') {
        medicines = medicines.filter(med => med.stock <= med.minStock)
      }

      // Sort medicines
      medicines.sort((a, b) => {
        const aValue = a[sortBy]
        const bValue = b[sortBy]
        
        if (sortOrder === 'desc') {
          return bValue > aValue ? 1 : -1
        } else {
          return aValue > bValue ? 1 : -1
        }
      })

      // Pagination
      const startIndex = (parseInt(page) - 1) * parseInt(limit)
      const endIndex = startIndex + parseInt(limit)
      const paginatedMedicines = medicines.slice(startIndex, endIndex)

      const totalPages = Math.ceil(medicines.length / parseInt(limit))

      return res.status(200).json(
        new apiResponse(200, {
          medicines: paginatedMedicines,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalRecords: medicines.length,
            limit: parseInt(limit),
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1
          },
          filters: {
            search,
            category,
            isAvailable,
            lowStock,
            sortBy,
            sortOrder
          }
        }, 'Medicines fetched successfully')
      )
    } catch (error) {
      console.error('Get medicines error:', error)
      return apiError(res, 500, false, 'Failed to fetch medicines', error.message)
    }
  }

  // Get single medicine by ID
  async getMedicineById(req, res) {
    try {
      const { medicineId } = req.params
      
      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      const medicine = supplier.medicines.id(medicineId)
      if (!medicine) {
        return apiError(res, 404, false, 'Medicine not found')
      }

      return res.status(200).json(
        new apiResponse(200, medicine, 'Medicine fetched successfully')
      )
    } catch (error) {
      console.error('Get medicine by ID error:', error)
      return apiError(res, 500, false, 'Failed to fetch medicine', error.message)
    }
  }

  // Add new medicine
  async addMedicine(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return apiError(res, 400, false, 'Validation failed', errors.array())
      }

      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      // Valid categories for Supplier medicines
      const validCategories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Cream', 'Ointment', 'Powder', 'Suspension', 'Gel', 'Lotion', 'Spray', 'Inhaler', 'Other'];
      
      // Map category to valid enum, default to 'Other' if not in list
      let category = req.body.category || 'Other';
      if (!validCategories.includes(category)) {
        // Try to infer from formulation
        if (req.body.formulation && validCategories.includes(req.body.formulation)) {
          category = req.body.formulation;
        } else {
          category = 'Other';
        }
      }

      // Convert snake_case to camelCase for database schema compatibility
      const medicineData = {
        name: req.body.name,
        genericName: req.body.generic_name || req.body.genericName,
        manufacturer: req.body.manufacturer,
        category: category,
        strength: req.body.strength,
        packSize: req.body.packSize || req.body.pack_size,
        mrp: req.body.mrp,
        supplierPrice: req.body.supplierPrice || req.body.supplier_price,
        stock: req.body.stock,
        // Optional fields
        medicine_id: req.body.medicine_id,
        medical_system: req.body.medical_system,
        minOrderQuantity: req.body.minOrderQuantity || req.body.min_order_quantity || 1,
        scheme: req.body.scheme,
        description: req.body.description,
        isAvailable: req.body.isAvailable !== false,
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : undefined,
        batchNumber: req.body.batchNumber,
        discount: req.body.discount || 0,
        minStock: req.body.minStock || 10,
        addedAt: new Date(),
        updatedAt: new Date()
      }

      // Remove undefined fields
      Object.keys(medicineData).forEach(key => medicineData[key] === undefined && delete medicineData[key])

      supplier.medicines.push(medicineData)
      await supplier.save()

      const addedMedicine = supplier.medicines[supplier.medicines.length - 1]

      // ✨ AUTO-SYNC TO ALL FRANCHISES
      console.log('[MEDICINE] Starting auto-sync to all franchises...')
      syncMedicineToAllFranchises(supplier, addedMedicine)
        .then(result => console.log('[MEDICINE] Auto-sync completed:', result))
        .catch(err => console.error('[MEDICINE] Auto-sync failed:', err))

      return res.status(201).json(
        new apiResponse(201, addedMedicine, 'Medicine added successfully and syncing to all franchises')
      )
    } catch (error) {
      console.error('Add medicine error:', error)
      return apiError(res, 500, false, 'Failed to add medicine', error.message)
    }
  }

  // Update medicine
  async updateMedicine(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return apiError(res, 400, false, 'Validation failed', errors.array())
      }

      const { medicineId } = req.params
      
      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      const medicine = supplier.medicines.id(medicineId)
      if (!medicine) {
        return apiError(res, 404, false, 'Medicine not found')
      }

      // Valid categories for Supplier medicines
      const validCategories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Cream', 'Ointment', 'Powder', 'Suspension', 'Gel', 'Lotion', 'Spray', 'Inhaler', 'Other'];
      
      // Map category to valid enum if provided
      let category = req.body.category || medicine.category;
      if (req.body.category && !validCategories.includes(req.body.category)) {
        if (req.body.formulation && validCategories.includes(req.body.formulation)) {
          category = req.body.formulation;
        } else {
          category = 'Other';
        }
      }

      // Convert snake_case to camelCase for database schema compatibility
      const updateData = {
        name: req.body.name || medicine.name,
        genericName: req.body.generic_name || req.body.genericName || medicine.genericName,
        manufacturer: req.body.manufacturer || medicine.manufacturer,
        category: category,
        strength: req.body.strength || medicine.strength,
        packSize: req.body.packSize || req.body.pack_size || medicine.packSize,
        mrp: req.body.mrp || medicine.mrp,
        supplierPrice: req.body.supplierPrice || req.body.supplier_price || medicine.supplierPrice,
        stock: req.body.stock !== undefined ? req.body.stock : medicine.stock,
        // Optional fields
        medical_system: req.body.medical_system,
        minOrderQuantity: req.body.minOrderQuantity || req.body.min_order_quantity,
        scheme: req.body.scheme,
        description: req.body.description,
        isAvailable: req.body.isAvailable !== undefined ? req.body.isAvailable : medicine.isAvailable,
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : medicine.expiryDate,
        batchNumber: req.body.batchNumber,
        discount: req.body.discount !== undefined ? req.body.discount : medicine.discount,
        minStock: req.body.minStock,
      }

      // Update medicine fields (exclude undefined values)
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          medicine[key] = updateData[key]
        }
      })
      medicine.updatedAt = new Date()

      await supplier.save()

      // ✨ AUTO-SYNC UPDATE TO ALL FRANCHISES
      console.log('[MEDICINE] Starting update sync to all franchises...')
      syncMedicineToAllFranchises(supplier, medicine)
        .then(result => console.log('[MEDICINE] Update sync completed:', result))
        .catch(err => console.error('[MEDICINE] Update sync failed:', err))

      return res.status(200).json(
        new apiResponse(200, medicine, 'Medicine updated successfully and syncing to all franchises')
      )
    } catch (error) {
      console.error('Update medicine error:', error)
      return apiError(res, 500, false, 'Failed to update medicine', error.message)
    }
  }

  // Delete medicine
  async deleteMedicine(req, res) {
    try {
      const { medicineId } = req.params
      
      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      const medicine = supplier.medicines.id(medicineId)
      if (!medicine) {
        return apiError(res, 404, false, 'Medicine not found')
      }

      const medicineName = medicine.name

      medicine.remove()
      await supplier.save()

      // ✨ REMOVE FROM ALL FRANCHISES
      console.log('[MEDICINE] Removing medicine from all franchises...')
      removeMedicineFromAllFranchises(supplier._id, medicineName)
        .then(() => console.log('[MEDICINE] Medicine removed from all franchises'))
        .catch(err => console.error('[MEDICINE] Removal failed:', err))

      return res.status(200).json(
        new apiResponse(200, null, 'Medicine deleted successfully and removed from all franchises')
      )
    } catch (error) {
      console.error('Delete medicine error:', error)
      return apiError(res, 500, false, 'Failed to delete medicine', error.message)
    }
  }

  // Update stock
  async updateStock(req, res) {
    try {
      const { medicineId } = req.params
      const { stock } = req.body

      if (stock < 0) {
        return apiError(res, 400, false, 'Stock cannot be negative')
      }

      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      const medicine = supplier.medicines.id(medicineId)
      if (!medicine) {
        return apiError(res, 404, false, 'Medicine not found')
      }

      medicine.stock = stock
      medicine.updatedAt = new Date()
      await supplier.save()

      return res.status(200).json(
        new apiResponse(200, medicine, 'Stock updated successfully')
      )
    } catch (error) {
      console.error('Update stock error:', error)
      return apiError(res, 500, false, 'Failed to update stock', error.message)
    }
  }

  // Toggle medicine availability
  async toggleAvailability(req, res) {
    try {
      const { medicineId } = req.params
      
      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      const medicine = supplier.medicines.id(medicineId)
      if (!medicine) {
        return apiError(res, 404, false, 'Medicine not found')
      }

      medicine.isAvailable = !medicine.isAvailable
      medicine.updatedAt = new Date()
      await supplier.save()

      return res.status(200).json(
        new apiResponse(200, medicine, `Medicine ${medicine.isAvailable ? 'enabled' : 'disabled'} successfully`)
      )
    } catch (error) {
      console.error('Toggle availability error:', error)
      return apiError(res, 500, false, 'Failed to toggle availability', error.message)
    }
  }

  // Bulk update medicines
  async bulkUpdate(req, res) {
    try {
      const { medicines } = req.body // Array of { medicineId, updates }

      if (!Array.isArray(medicines) || medicines.length === 0) {
        return apiError(res, 400, false, 'Medicines array is required')
      }

      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      let updatedCount = 0
      
      for (const { medicineId, updates } of medicines) {
        const medicine = supplier.medicines.id(medicineId)
        if (medicine) {
          Object.assign(medicine, updates)
          medicine.updatedAt = new Date()
          updatedCount++
        }
      }

      await supplier.save()

      return res.status(200).json(
        new apiResponse(200, { updatedCount }, `${updatedCount} medicines updated successfully`)
      )
    } catch (error) {
      console.error('Bulk update error:', error)
      return apiError(res, 500, false, 'Failed to update medicines', error.message)
    }
  }

  // Get categories for dropdown
  async getCategories(req, res) {
    try {
      const categories = [
        'Tablet',
        'Capsule', 
        'Syrup',
        'Injection',
        'Drops',
        'Cream',
        'Ointment',
        'Other'
      ]

      return res.status(200).json(
        new apiResponse(200, categories, 'Categories fetched successfully')
      )
    } catch (error) {
      console.error('Get categories error:', error)
      return apiError(res, 500, false, 'Failed to fetch categories', error.message)
    }
  }

  // Export medicines data
  async exportMedicines(req, res) {
    try {
      const supplier = await Supplier.findById(req.supplier._id)
      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found')
      }

      const medicinesData = supplier.medicines.map(med => ({
        name: med.name,
        genericName: med.genericName,
        manufacturer: med.manufacturer,
        category: med.category,
        strength: med.strength,
        packSize: med.packSize,
        batchNumber: med.batchNumber,
        expiryDate: med.expiryDate,
        mrp: med.mrp,
        supplierPrice: med.supplierPrice,
        discount: med.discount,
        stock: med.stock,
        minStock: med.minStock,
        isAvailable: med.isAvailable,
        addedAt: med.addedAt,
        updatedAt: med.updatedAt
      }))

      return res.status(200).json(
        new apiResponse(200, medicinesData, 'Medicines exported successfully')
      )
    } catch (error) {
      console.error('Export medicines error:', error)
      return apiError(res, 500, false, 'Failed to export medicines', error.message)
    }
  }
}

export default new SupplierMedicineController()