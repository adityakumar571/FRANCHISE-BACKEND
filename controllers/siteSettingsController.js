import SiteSettings from "../models/SiteSettings.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

// =====================================================
// GET SITE SETTINGS  (Public — no auth)
// Returns current phone, email, address
// =====================================================
const getSiteSettings = asyncHandler(async (req, res) => {
    // findOrCreate singleton pattern
    let settings = await SiteSettings.findOne({ _singleton: true });

    if (!settings) {
        settings = await SiteSettings.create({ _singleton: true });
    }

    return res.status(200).json(
        new apiResponse(200, settings, "Site settings fetched successfully")
    );
});

// =====================================================
// UPDATE SITE SETTINGS  (Admin only)
// =====================================================
const updateSiteSettings = asyncHandler(async (req, res) => {
    const { phone, email, address } = req.body;

    const updates = {};
    if (phone   !== undefined) updates.phone   = phone.trim();
    if (email   !== undefined) updates.email   = email.trim().toLowerCase();
    if (address !== undefined) updates.address = address.trim();

    if (Object.keys(updates).length === 0) {
        return res.status(400).json(
            new apiResponse(400, null, "No fields provided to update")
        );
    }

    const settings = await SiteSettings.findOneAndUpdate(
        { _singleton: true },
        { $set: updates },
        { new: true, upsert: true }
    );

    return res.status(200).json(
        new apiResponse(200, settings, "Site settings updated successfully")
    );
});

export { getSiteSettings, updateSiteSettings };
