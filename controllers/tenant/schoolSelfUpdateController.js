import Tenant from "../../models/tenant.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { apiResponse } from "../../utils/apiResponse.js";

/**
 * PATCH /api/school/profile
 * School Admin apni school ki safe details update kar sakta hai.
 * Sensitive fields (razorpayKey, razorpaySecret, dbUri, subdomain) allowed nahi hain.
 */
export const updateSchoolProfile = asyncHandler(async (req, res) => {
  const tenantId = req.tenant?._id || req.tenant?.id;

  if (!tenantId) {
    return res.status(400).json(new apiResponse(400, null, "Tenant not identified"));
  }

  // Only these fields can be updated by school admin themselves
  const ALLOWED_FIELDS = [
    "schoolName",
    "logo",
    "description",
    "schoolEmail",
    "schoolContact",
    "schoolContactAlt",
    "schoolCode",
    "estNo",
    "addressLine1",
    "city",
    "state",
    "country",
    "pincode",
    "schoolAddress",
    "affiliationLine",
    "affiliationNo",
    "schoolMedium",
    "msmeRegNo",
    "isoRegNo",
    "regInfo",
    "registrationNo",
    "nitiAayog",
    "managedBy",
    "contactPerson1",
    "contactPerson2",
  ];

  const updateData = {};
  for (const key of ALLOWED_FIELDS) {
    if (req.body[key] !== undefined) {
      const val = req.body[key];
      updateData[key] = typeof val === "string" ? val.trim() : val;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json(new apiResponse(400, null, "No valid fields to update"));
  }

  // Auto-compose schoolAddress from structured fields (same as super admin flow)
  const ADDRESS_PARTS = ["addressLine1", "city", "state", "country", "pincode"];
  const anyAddressChanged = ADDRESS_PARTS.some((k) => updateData[k] !== undefined);
  if (anyAddressChanged) {
    // Fetch current values so unchanged parts are preserved in the composed string
    const current = await Tenant.findById(tenantId).select(ADDRESS_PARTS.join(" "));
    if (current) {
      const merged = { ...current.toObject(), ...updateData };
      const composed = ADDRESS_PARTS.map((k) => merged[k]).filter(Boolean).join(", ");
      if (composed) updateData.schoolAddress = composed;
    }
  }

  const updated = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select("-razorpayKey -razorpaySecret -dbUri -portalPassword -portalOtp");

  if (!updated) {
    return res.status(404).json(new apiResponse(404, null, "School not found"));
  }

  return res.status(200).json(new apiResponse(200, updated, "School profile updated successfully"));
});

/**
 * GET /api/school/profile
 * School Admin apni school ki details fetch kar sakta hai.
 */
export const getSchoolProfile = asyncHandler(async (req, res) => {
  const tenantId = req.tenant?._id || req.tenant?.id;

  if (!tenantId) {
    return res.status(400).json(new apiResponse(400, null, "Tenant not identified"));
  }

  const school = await Tenant.findById(tenantId)
    .select("-razorpayKey -razorpaySecret -dbUri -portalPassword -portalOtp");

  if (!school) {
    return res.status(404).json(new apiResponse(404, null, "School not found"));
  }

  return res.status(200).json(new apiResponse(200, school, "School profile fetched successfully"));
});
