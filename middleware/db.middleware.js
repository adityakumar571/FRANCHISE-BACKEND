import { getTenantDB } from "../utils/dbManager.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getUserModel } from "../models/tenant/user.model.js";
import { getUserAccessModel } from "../models/tenant/UserAccess.model.js";
import { getMenuAccessModel } from "../models/tenant/MenuAccess.model.js";
import { getRoleModel } from "../models/tenant/Role.model.js";

export const dbMiddleware = asyncHandler(async (req, res, next) => {
    // Central DB — no tenant DB needed
    if (req.isMain) return next();

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

        // Pre-register franchise models on this connection
        getUserModel(db);
        getUserAccessModel(db);
        getMenuAccessModel(db);
        getRoleModel(db);

        next();
    } catch (err) {
        console.error(`[dbMiddleware] Connection error for tenant "${req.tenant.subdomain}":`, err.message);
        return res.status(503).json({ message: "Database temporarily unavailable. Please retry." });
    }
});
