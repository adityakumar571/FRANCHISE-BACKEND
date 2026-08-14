
import jwt from "jsonwebtoken";
import { apiError } from "../utils/apiError.js";
import { getUserModel } from "../models/tenant/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        // ===============================
        // 🔐 TOKEN GET
        // ===============================
        const token =
            req.cookies?.accessToken ||
            req.cookies?.LMS ||
            req.header("Authorization")?.replace(/^Bearer\s+/i, "");

        if (!token) {
            return apiError(res, 401, false, "Unauthorized: No token provided");
        }

        // ===============================
        // 🔍 VERIFY TOKEN
        // ===============================
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ===============================
        // 🏢 GET TENANT USER MODEL
        // ===============================
        if (!req.db) {
            return apiError(res, 500, false, "Tenant database connection not available");
        }
        const User = getUserModel(req.db); // ✅ IMPORTANT

        const user = await User.findById(decoded.userId).select(
            "-password -otp -otpExpiration"
        );

        if (!user) {
            return apiError(res, 401, false, "Invalid token: User not found");
        }

        // ===============================
        // 📌 ATTACH USER
        // ===============================
        req.user = user;

        next();
    } catch (error) {
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