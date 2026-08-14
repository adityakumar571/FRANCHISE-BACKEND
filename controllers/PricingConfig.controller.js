import BillingConfig from "../models/BillingConfig.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

/**
 * GET /api/pricing-config
 * Returns current active config + history (last 10 changes)
 * Frontend expects: { current: { baseStudentLimit, basePrice, extraBlockSize, extraBlockPrice }, history: [] }
 */
export const getPricingConfig = asyncHandler(async (req, res) => {
  // Get current active config
  let current = await BillingConfig.findOne({ isActive: true }).sort({ createdAt: -1 })

  // If none exists, create default
  if (!current) {
    current = await BillingConfig.create({
      baseStudentLimit: 350,
      basePrice: 1200,
      addonSlotSize: 50,
      addonSlotPrice: 100,
      isActive: true,
    })
  }

  // Get history (last 10 configs sorted by updatedAt desc)
  const historyDocs = await BillingConfig.find({})
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean()

  // Map to frontend-friendly shape
  const mapConfig = (doc) => ({
    _id: doc._id,
    baseStudentLimit: doc.baseStudentLimit,
    basePrice: doc.basePrice,
    extraBlockSize: doc.addonSlotSize,
    extraBlockPrice: doc.addonSlotPrice,
    isActive: doc.isActive,
    changedAt: doc.updatedAt,
    changedBy: doc.updatedBy || "system",
  })

  return res.status(200).json(
    new apiResponse(
      200,
      {
        current: mapConfig(current),
        history: historyDocs.map(mapConfig),
      },
      "Pricing config fetched successfully"
    )
  )
})

/**
 * PUT /api/pricing-config
 * Save / update the active pricing configuration
 * Body: { baseStudentLimit, basePrice, extraBlockSize, extraBlockPrice }
 */
export const updatePricingConfig = asyncHandler(async (req, res) => {
  const { baseStudentLimit, basePrice, extraBlockSize, extraBlockPrice } = req.body

  // Basic validation
  if (!baseStudentLimit || !basePrice || !extraBlockSize || !extraBlockPrice) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "All pricing fields are required"))
  }

  if (
    isNaN(Number(baseStudentLimit)) || Number(baseStudentLimit) < 1 ||
    isNaN(Number(basePrice))        || Number(basePrice) < 0 ||
    isNaN(Number(extraBlockSize))   || Number(extraBlockSize) < 1 ||
    isNaN(Number(extraBlockPrice))  || Number(extraBlockPrice) < 0
  ) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid pricing values"))
  }

  // Update the existing active config (upsert if none)
  const updated = await BillingConfig.findOneAndUpdate(
    { isActive: true },
    {
      baseStudentLimit: Number(baseStudentLimit),
      basePrice: Number(basePrice),
      addonSlotSize: Number(extraBlockSize),
      addonSlotPrice: Number(extraBlockPrice),
      isActive: true,
      updatedBy: "admin",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  return res.status(200).json(
    new apiResponse(
      200,
      {
        baseStudentLimit: updated.baseStudentLimit,
        basePrice: updated.basePrice,
        extraBlockSize: updated.addonSlotSize,
        extraBlockPrice: updated.addonSlotPrice,
      },
      "Pricing configuration saved successfully"
    )
  )
})
