
import jwt from "jsonwebtoken";
import { apiError } from "../utils/apiError.js";
import User from "../models/user.modal.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyMainJWT = asyncHandler(async (req, res, next) => {
    try {
        // Get the token from cookies or Authorization header
        // Support multiple cookie names: accessToken (Super Admin), multitenant (Tenant Admin), LMS (legacy)
        const token = req.cookies?.accessToken || 
                     req.cookies?.multitenant || 
                     req.cookies?.LMS || 
                     req.header("Authorization")?.replace("Bearer ", "");



        if (!token) {
            apiError(res, 401, false, "Unauthorized request: No token provided");
            return;
        }

        // Verify the token
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);



        // Find the user associated with the token from MAIN database
        const user = await User.findById(decodedToken?.userId)
            .select("-password -authToken"); // Don't return sensitive fields like password and authToken
        console.log("TOKEN =>", token);
        if (!user) {
            apiError(res, 401, false, "Invalid access token: User not found");
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        apiError(res, 401, false, error?.message || "Invalid access token");
        return;
    }
});

export const authorizeMainUserType = (...allowedTypes) => {
    return async (req, res, next) => {

        try {
            // Ensure the user object is attached to the request
            if (!req.user) {
                return apiError(res, 401, false, "Unauthorized access: No user data available");
            }

            // Check if the user's role is in the allowedTypes array
            // Support both "Super Admin" (with space) and "SuperAdmin" (without space)
            const userRole = req.user.role || req.user.accountType;
            const normalizedUserRole = userRole?.replace(/\s+/g, ''); // Remove spaces
            
            const hasAccess = allowedTypes.some(allowedType => {
                const normalizedAllowedType = allowedType?.replace(/\s+/g, '');
                return normalizedUserRole === normalizedAllowedType;
            });

            if (!hasAccess) {
                return apiError(res, 403, false, "Forbidden: You do not have access to this resource");
            }

            next();
        } catch (error) {
            return apiError(res, 500, false, error.message || "Error in authorization");
        }
    };
};
