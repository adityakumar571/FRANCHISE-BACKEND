import SiteSettings from "../models/SiteSettings.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { logFromReq } from "../utils/logActivity.js";

/* ─────────────────────────────────────────────────────────────
   GET /api/site-settings  (Public — no auth)
   Returns all platform settings
─────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────
   PUT /api/site-settings/update  (Admin auth — verifyMainJWT)
   Accepts all settings fields grouped or flat
─────────────────────────────────────────────────────────────── */
const updateSiteSettings = asyncHandler(async (req, res) => {
    const allowedFields = [
        // General
        "platformName", "adminEmail", "supportEmail", "phone", "address", "timezone", "currency",
        // Web
        "siteUrl", "logoUrl", "faviconUrl", "maintenanceMode", "googleAnalytics",
        // Email / SMTP
        "smtpHost", "smtpPort", "smtpUser", "smtpPass", "fromName", "fromEmail",
        // Security
        "sessionTimeout", "maxLoginAttempts", "minPasswordLength", "auditRetentionDays", "force2FA", "ipWhitelist",
        // Notifications
        "notifyEmail", "expiryAlertDays",
        "notifyExpiryEmail", "notifyExpirySms", "notifyNewFranchise",
        "notifySupplierOnboard", "notifyLowStock", "notifyAuditAlert",
        // Inventory
        "nearExpiryDays", "lowStockThreshold", "fefo", "batchMandatory", "expiryMandatory",
        // Support
        "whatsappNo", "ticketAutoClose", "slaHours",
    ];

    const updates = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            const val = req.body[field];
            updates[field] = typeof val === "string" ? val.trim() : val;
        }
    }

    // Legacy compat: plain `email` → adminEmail
    if (req.body.email !== undefined && updates.adminEmail === undefined) {
        updates.adminEmail = req.body.email.trim().toLowerCase();
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json(
            new apiResponse(400, null, "No valid fields provided to update")
        );
    }

    const settings = await SiteSettings.findOneAndUpdate(
        { _singleton: true },
        { $set: updates },
        { new: true, upsert: true }
    );

    logFromReq(req, {
        action: "Updated System Settings",
        target: "System Settings",
        module: "Settings",
        type:   "Update",
    });

    return res.status(200).json(
        new apiResponse(200, settings, "Site settings updated successfully ✅")
    );
});

export { getSiteSettings, updateSiteSettings };
