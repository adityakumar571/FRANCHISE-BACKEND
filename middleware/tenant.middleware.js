import Tenant from "../models/tenant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";


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

    const tenant = await Tenant.findOne({
        subdomain: subdomain.toLowerCase().trim(),
    });

    if (!tenant || !tenant.isActive) {
        return res.status(404).json({ message: "Tenant not found" });
    }

    req.tenant = tenant;
    next();
});