import Supplier from '../models/Supplier.model.js'
import { apiError } from '../utils/apiError.js'
import { apiResponse } from '../utils/apiResponse.js'

class FranchiseSupplierController {
  // Get all active suppliers for franchise admin
  async getActiveSuppliers(req, res) {
    try {
      const suppliers = await Supplier.find({ status: 'Active' })
        .select('companyName contactPerson email phone businessType address')
        .sort({ companyName: 1 })
        .lean()

      return res.status(200).json(
        new apiResponse(200, suppliers, 'Active suppliers fetched successfully')
      )
    } catch (error) {
      console.error('Get active suppliers error:', error)
      return apiError(res, 500, false, 'Failed to fetch suppliers', error.message)
    }
  }

  // Get all medicines from all active suppliers
  async getAllMedicines(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        search = '',
        category = '',
        sortBy = 'name',
        sortOrder = 'asc',
        minPrice = '',
        maxPrice = '',
        supplierName = ''
      } = req.query

      // Build aggregation pipeline
      const pipeline = [
        // Match only active suppliers
        { $match: { status: 'Active' } },
        
        // Unwind medicines array
        { $unwind: '$medicines' },
        
        // Match available medicines only
        { $match: { 'medicines.isAvailable': true } },
        
        // Add supplier info to each medicine
        {
          $addFields: {
            'medicines.supplierInfo': {
              _id: '$_id',
              companyName: '$companyName',
              contactPerson: '$contactPerson',
              email: '$email',
              phone: '$phone'
            }
          }
        },
        
        // Replace root with medicine data
        { $replaceRoot: { newRoot: '$medicines' } }
      ]

      // Add search filter
      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { genericName: { $regex: search, $options: 'i' } },
              { manufacturer: { $regex: search, $options: 'i' } }
            ]
          }
        })
      }

      // Add category filter
      if (category) {
        pipeline.push({ $match: { category } })
      }

      // Add supplier filter
      if (supplierName) {
        pipeline.push({
          $match: {
            'supplierInfo.companyName': { $regex: supplierName, $options: 'i' }
          }
        })
      }

      // Add price range filter
      if (minPrice || maxPrice) {
        const priceMatch = {}
        if (minPrice) priceMatch.$gte = parseFloat(minPrice)
        if (maxPrice) priceMatch.$lte = parseFloat(maxPrice)
        pipeline.push({ $match: { supplierPrice: priceMatch } })
      }

      // Count total documents
      const countPipeline = [...pipeline, { $count: 'total' }]
      const totalResult = await Supplier.aggregate(countPipeline)
      const totalCount = totalResult[0]?.total || 0

      // Add sorting
      const sortDirection = sortOrder === 'desc' ? -1 : 1
      pipeline.push({ $sort: { [sortBy]: sortDirection } })

      // Add pagination
      const skip = (parseInt(page) - 1) * parseInt(limit)
      pipeline.push({ $skip: skip }, { $limit: parseInt(limit) })

      // Execute query
      const medicines = await Supplier.aggregate(pipeline)

      const totalPages = Math.ceil(totalCount / parseInt(limit))

      return res.status(200).json(
        new apiResponse(200, {
          medicines,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalRecords: totalCount,
            limit: parseInt(limit),
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1
          },
          filters: { search, category, sortBy, sortOrder, minPrice, maxPrice, supplierName }
        }, 'Medicines fetched successfully')
      )
    } catch (error) {
      console.error('Get all medicines error:', error)
      return apiError(res, 500, false, 'Failed to fetch medicines', error.message)
    }
  }

  // Compare medicine prices across suppliers
  async compareMedicines(req, res) {
    try {
      const { medicineName } = req.params
      
      if (!medicineName) {
        return apiError(res, 400, false, 'Medicine name is required')
      }

      const pipeline = [
        // Match only active suppliers
        { $match: { status: 'Active' } },
        
        // Unwind medicines array
        { $unwind: '$medicines' },
        
        // Match medicines by name (case insensitive) and available only
        {
          $match: {
            $and: [
              { 'medicines.isAvailable': true },
              {
                $or: [
                  { 'medicines.name': { $regex: medicineName, $options: 'i' } },
                  { 'medicines.genericName': { $regex: medicineName, $options: 'i' } }
                ]
              }
            ]
          }
        },
        
        // Project required fields
        {
          $project: {
            supplierInfo: {
              _id: '$_id',
              companyName: '$companyName',
              contactPerson: '$contactPerson',
              email: '$email',
              phone: '$phone',
              rating: '$rating'
            },
            medicine: {
              _id: '$medicines._id',
              name: '$medicines.name',
              genericName: '$medicines.genericName',
              manufacturer: '$medicines.manufacturer',
              category: '$medicines.category',
              strength: '$medicines.strength',
              packSize: '$medicines.packSize',
              mrp: '$medicines.mrp',
              supplierPrice: '$medicines.supplierPrice',
              discount: '$medicines.discount',
              stock: '$medicines.stock',
              expiryDate: '$medicines.expiryDate',
              addedAt: '$medicines.addedAt'
            }
          }
        },
        
        // Sort by supplier price (lowest first)
        { $sort: { 'medicine.supplierPrice': 1 } }
      ]

      const results = await Supplier.aggregate(pipeline)

      if (results.length === 0) {
        return res.status(200).json(
          new apiResponse(200, [], 'No medicines found with this name')
        )
      }

      // Calculate price comparison stats
      const prices = results.map(r => r.medicine.supplierPrice)
      const stats = {
        count: results.length,
        lowestPrice: Math.min(...prices),
        highestPrice: Math.max(...prices),
        averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length,
        priceDifference: Math.max(...prices) - Math.min(...prices)
      }

      return res.status(200).json(
        new apiResponse(200, {
          medicines: results,
          comparison: stats
        }, 'Medicine comparison data fetched successfully')
      )
    } catch (error) {
      console.error('Compare medicines error:', error)
      return apiError(res, 500, false, 'Failed to compare medicines', error.message)
    }
  }

  // Get medicines by supplier ID
  async getMedicinesBySupplier(req, res) {
    try {
      const { supplierId } = req.params
      const {
        page = 1,
        limit = 10,
        search = '',
        category = '',
        sortBy = 'name',
        sortOrder = 'asc'
      } = req.query

      const supplier = await Supplier.findOne({ 
        _id: supplierId, 
        status: 'Active' 
      }).select('companyName medicines')

      if (!supplier) {
        return apiError(res, 404, false, 'Supplier not found or inactive')
      }

      let medicines = [...supplier.medicines.filter(med => med.isAvailable)]

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
          supplier: {
            _id: supplier._id,
            companyName: supplier.companyName
          },
          medicines: paginatedMedicines,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalRecords: medicines.length,
            limit: parseInt(limit)
          }
        }, 'Supplier medicines fetched successfully')
      )
    } catch (error) {
      console.error('Get medicines by supplier error:', error)
      return apiError(res, 500, false, 'Failed to fetch supplier medicines', error.message)
    }
  }

  // Get medicine categories from all suppliers
  async getMedicineCategories(req, res) {
    try {
      const categories = await Supplier.aggregate([
        { $match: { status: 'Active' } },
        { $unwind: '$medicines' },
        { $match: { 'medicines.isAvailable': true } },
        { $group: { _id: '$medicines.category' } },
        { $sort: { _id: 1 } }
      ])

      const categoryList = categories.map(cat => cat._id).filter(Boolean)

      return res.status(200).json(
        new apiResponse(200, categoryList, 'Medicine categories fetched successfully')
      )
    } catch (error) {
      console.error('Get medicine categories error:', error)
      return apiError(res, 500, false, 'Failed to fetch categories', error.message)
    }
  }

  // Search medicines with autocomplete
  async searchMedicines(req, res) {
    try {
      const { query } = req.query
      
      if (!query || query.length < 2) {
        return res.status(200).json(
          new apiResponse(200, [], 'Query too short')
        )
      }

      const pipeline = [
        { $match: { status: 'Active' } },
        { $unwind: '$medicines' },
        {
          $match: {
            $and: [
              { 'medicines.isAvailable': true },
              {
                $or: [
                  { 'medicines.name': { $regex: query, $options: 'i' } },
                  { 'medicines.genericName': { $regex: query, $options: 'i' } }
                ]
              }
            ]
          }
        },
        {
          $group: {
            _id: '$medicines.name',
            genericName: { $first: '$medicines.genericName' },
            category: { $first: '$medicines.category' },
            supplierCount: { $sum: 1 }
          }
        },
        { $sort: { supplierCount: -1 } },
        { $limit: 10 }
      ]

      const suggestions = await Supplier.aggregate(pipeline)

      return res.status(200).json(
        new apiResponse(200, suggestions, 'Search suggestions fetched successfully')
      )
    } catch (error) {
      console.error('Search medicines error:', error)
      return apiError(res, 500, false, 'Failed to search medicines', error.message)
    }
  }

  // Get top suppliers by medicine count
  async getTopSuppliers(req, res) {
    try {
      const { limit = 5 } = req.query

      const pipeline = [
        { $match: { status: 'Active' } },
        {
          $addFields: {
            medicineCount: {
              $size: {
                $filter: {
                  input: '$medicines',
                  cond: { $eq: ['$$this.isAvailable', true] }
                }
              }
            }
          }
        },
        {
          $project: {
            companyName: 1,
            contactPerson: 1,
            email: 1,
            phone: 1,
            businessType: 1,
            medicineCount: 1,
            rating: 1
          }
        },
        { $sort: { medicineCount: -1 } },
        { $limit: parseInt(limit) }
      ]

      const topSuppliers = await Supplier.aggregate(pipeline)

      return res.status(200).json(
        new apiResponse(200, topSuppliers, 'Top suppliers fetched successfully')
      )
    } catch (error) {
      console.error('Get top suppliers error:', error)
      return apiError(res, 500, false, 'Failed to fetch top suppliers', error.message)
    }
  }
}

export default new FranchiseSupplierController()