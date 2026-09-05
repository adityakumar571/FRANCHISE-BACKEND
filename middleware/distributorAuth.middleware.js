import jwt from 'jsonwebtoken'
import Distributor from '../models/Distributor.model.js'
import { apiResponse } from '../utils/apiResponse.js'

/**
 * verifyDistributor — protects distributor-only routes
 * Expects: Authorization: Bearer <token>
 */
export const verifyDistributor = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(new apiResponse(401, null, 'Unauthorized — token missing.'))
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (decoded.role !== 'distributor') {
      return res.status(403).json(new apiResponse(403, null, 'Forbidden — not a distributor token.'))
    }

    const dist = await Distributor.findById(decoded.distributorId).select('-password')
    if (!dist || !dist.isActive) {
      return res.status(401).json(new apiResponse(401, null, 'Distributor account not found or inactive.'))
    }

    req.distributor = dist
    next()
  } catch (err) {
    return res.status(401).json(new apiResponse(401, null, 'Invalid or expired token.'))
  }
}
