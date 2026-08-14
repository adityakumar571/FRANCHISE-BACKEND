import { getTenantDB } from "../utils/dbManager.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { registerTenantModels } from "../utils/registerTenantModels.js";

export const dbMiddleware = asyncHandler(async (req, res, next) => {
    // CENTRAL (no tenant DB needed)
    if (req.isMain) {
        console.log("👉 Using CENTRAL DB");
        return next();
    }

    // Tenant context must be set by tenantMiddleware before this runs
    if (!req.tenant) {
        return res.status(400).json({ message: "Tenant context missing" });
    }

    if (!req.tenant.dbUri) {
        console.error(`[dbMiddleware] tenant "${req.tenant.subdomain}" has no dbUri`);
        return res.status(500).json({ message: "Tenant database not configured" });
    }

    try {
        const db = await getTenantDB(req.tenant.dbUri);

        if (!db) {
            return res.status(500).json({ message: "DB connection failed" });
        }

        req.db = db;
        registerTenantModels(db);
        next();
    } catch (err) {
        console.error(`[dbMiddleware] Connection error for tenant "${req.tenant.subdomain}":`, err.message);
        return res.status(503).json({ message: "Database temporarily unavailable. Please retry." });
    }
});
