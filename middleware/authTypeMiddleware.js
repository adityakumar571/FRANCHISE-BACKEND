import jwt from "jsonwebtoken";
import { apiError } from "../utils/apiError.js";
import { getUserModel } from "../models/tenant/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        // ===============================
        // 🔐 TOKEN GET
        // ===============================
        const token =
            req.cookies?.accessToken ||
            req.cookies?.multitenant ||  // ADD: Tenant admin token
            req.cookies?.LMS ||
            req.header("Authorization")?.replace(/^Bearer\s+/i, "");

        console.log('🔑 [verifyJWT] Checking token...')
        console.log('   - Cookie accessToken:', !!req.cookies?.accessToken)
        console.log('   - Cookie multitenant:', !!req.cookies?.multitenant)
        console.log('   - Cookie LMS:', !!req.cookies?.LMS)
        console.log('   - Authorization header:', !!req.header("Authorization"))
        console.log('   - Token found:', !!token)

        if (!token) {
            console.log('❌ [verifyJWT] No token provided')
            return apiError(res, 401, false, "Unauthorized: No token provided");
        }

        // ===============================
        // 🔍 VERIFY TOKEN
        // ===============================
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ [verifyJWT] Token decoded:', { userId: decoded.userId, role: decoded.role })

        // ===============================
        // 🏢 GET TENANT USER MODEL
        // ===============================
        if (!req.db) {
            console.log('❌ [verifyJWT] No tenant database connection (req.db is undefined)')
            return apiError(res, 500, false, "Tenant database connection not available");
        }
        
        console.log('✅ [verifyJWT] Tenant DB available')
        const User = getUserModel(req.db); // ✅ IMPORTANT

        const user = await User.findById(decoded.userId).select(
            "-password -otp -otpExpiration"
        );

        if (!user) {
            console.log('❌ [verifyJWT] User not found in tenant database')
            return apiError(res, 401, false, "Invalid token: User not found");
        }

        console.log('✅ [verifyJWT] User found:', { id: user._id, role: user.role, name: user.name })

        // ===============================
        // 📌 ATTACH USER
        // ===============================
        req.user = user;

        next();
    } catch (error) {
        console.log('❌ [verifyJWT] Error:', error.message)
        return apiError(
            res,
            401,
            false,
            error?.message || "Invalid or expired token"
        );
    }
});

// ── SuperAdmin JWT Verification (Main DB, no tenant context) ──
export const verifyJWTForSuperAdmin = asyncHandler(async (req, res, next) => {
    try {
        const token =
            req.cookies?.accessToken ||
            req.cookies?.multitenant ||  // ADD: Accept multitenant cookie (from Tenant Admin login)
            req.cookies?.SA_TOKEN ||      // ADD: Accept SA_TOKEN cookie
            req.header("Authorization")?.replace(/^Bearer\s+/i, "");

        console.log('🔑 [verifyJWTForSuperAdmin] Checking SuperAdmin token...')
        console.log('   - Cookie accessToken:', !!req.cookies?.accessToken)
        console.log('   - Cookie multitenant:', !!req.cookies?.multitenant)
        console.log('   - Cookie SA_TOKEN:', !!req.cookies?.SA_TOKEN)
        console.log('   - Authorization header:', !!req.header("Authorization"))
        console.log('   - Token found:', !!token)

        if (!token) {
            console.log('❌ [verifyJWTForSuperAdmin] No token provided')
            return apiError(res, 401, false, "Unauthorized: No token provided");
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ [verifyJWTForSuperAdmin] Token decoded:', { userId: decoded.userId, role: decoded.role })

        // For SuperAdmin, we just set the decoded data
        // We don't look up from database (no tenant DB context)
        req.user = {
            _id: decoded.userId,
            role: decoded.role,
            email: decoded.email,
        };

        // Check if SuperAdmin role
        if (decoded.role?.toLowerCase() !== 'superadmin') {
            console.log('❌ [verifyJWTForSuperAdmin] User is not SuperAdmin, role:', decoded.role)
            return apiError(res, 403, false, "Forbidden: SuperAdmin access required");
        }

        console.log('✅ [verifyJWTForSuperAdmin] SuperAdmin verified')
        next();
    } catch (error) {
        console.log('❌ [verifyJWTForSuperAdmin] Error:', error.message)
        return apiError(
            res,
            401,
            false,
            error?.message || "Invalid or expired token"
        );
    }
});

export const authorizeUserType = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return apiError(res, 401, false, "Unauthorized: No user data");
            }

            // ❗ FIX: accountType ❌ → role ✅
            if (!allowedRoles.includes(req.user.role)) {
                return apiError(
                    res,
                    403,
                    false,
                    "Forbidden: Access denied"
                );
            }

            next();
        } catch (error) {
            return apiError(
                res,
                500,
                false,
                error.message || "Authorization error"
            );
        }
    };
};