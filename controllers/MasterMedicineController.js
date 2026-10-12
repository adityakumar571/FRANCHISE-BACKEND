import { apiResponse } from '../utils/apiResponse.js'
import { apiError } from '../utils/apiError.js'
import MASTER_MEDICINES, { 
  searchMedicines, 
  getAllCategories,
  getMedicinesByCategory 
} from '../constants/masterMedicines.js'

class MasterMedicineController {
  // Get all master medicines
  async getAllMasterMedicines(req, res) {
    try {
      return res.status(200).json(
        new apiResponse(200, MASTER_MEDICINES, 'Master medicines fetched successfully')
      )
    } catch (error) {
      console.error('Get master medicines error:', error)
      return apiError(res, 500, false, 'Failed to fetch master medicines', error.message)
    }
  }

  // Search master medicines (autocomplete)
  async searchMasterMedicines(req, res) {
    try {
      const { q } = req.query

      if (!q || q.trim().length < 2) {
        return apiError(res, 400, false, 'Search term must be at least 2 characters')
      }

      const results = searchMedicines(q)

      return res.status(200).json(
        new apiResponse(200, results, `Found ${results.length} medicines`)
      )
    } catch (error) {
      console.error('Search master medicines error:', error)
      return apiError(res, 500, false, 'Failed to search medicines', error.message)
    }
  }

  // Get all categories
  async getCategories(req, res) {
    try {
      const categories = getAllCategories()

      return res.status(200).json(
        new apiResponse(200, categories, 'Categories fetched successfully')
      )
    } catch (error) {
      console.error('Get categories error:', error)
      return apiError(res, 500, false, 'Failed to fetch categories', error.message)
    }
  }

  // Get medicines by category
  async getMedicinesByCategory(req, res) {
    try {
      const { category } = req.params

      if (!category) {
        return apiError(res, 400, false, 'Category is required')
      }

      const medicines = getMedicinesByCategory(category)

      return res.status(200).json(
        new apiResponse(200, medicines, `Found ${medicines.length} medicines in ${category}`)
      )
    } catch (error) {
      console.error('Get medicines by category error:', error)
      return apiError(res, 500, false, 'Failed to fetch medicines', error.message)
    }
  }
}

export default new MasterMedicineController()
