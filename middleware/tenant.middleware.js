import Tenant from "../models/tenant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// In-memory tenant cache — DB pe har request pe query karne se bachata hai
// TTL: 5 minutes (300,000ms)
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const tenantMiddleware = asyncHandler(async (req, res, next) => {
    let subdomain = req.headers["x-tenant-id"];

    // fallback (optional)
    if (!subdomain) {
        const host = req.headers.host;
        if (host && host.includes(".")) {
            subdomain = host.split(".")[0];
        }
    }

    if (!subdomain || subdomain === "localhost") {
        req.isMain = true;
        return next();
    }

    const key = subdomain.toLowerCase().trim();

    // Cache check — DB hit avoid karo
    const cached = tenantCache.get(key);
    if (cached) {
        const isExpired = Date.now() - cached.cachedAt > CACHE_TTL;
        if (!isExpired) {
            req.tenant = cached.tenant;
            return next();
        }
        // Expired — cache se hatao
        tenantCache.delete(key);
    }

    // DB se fetch karo aur cache mein store karo
    const tenant = await Tenant.findOne({ subdomain: key }).lean();

    if (!tenant || !tenant.isActive) {
        return res.status(404).json({ message: "Tenant not found" });
    }

    // Cache mein store karo
    tenantCache.set(key, { tenant, cachedAt: Date.now() });

    req.tenant = tenant;
    next();
});

// Specific tenant ka cache invalidate karne ke liye (update/deactivate hone par)
export const invalidateTenantCache = (subdomain) => {
    if (subdomain) tenantCache.delete(subdomain.toLowerCase().trim());
};