import { apiResponse } from "../utils/apiResponse.js";

/**
 * Middleware to check if user is SuperAdmin
 * Must be used AFTER verifyJWT middleware
 */
export const isSuperAdmin = (req, res, next) => {
  try {
    // Check if user exists (should be set by verifyJWT middleware)
    if (!req.user) {
      return res
        .status(401)
        .json(new apiResponse(401, null, "User not authenticated"));
    }

    // Check role - support both 'role' and 'accountType' fields
    const userRole = (req.user.role || req.user.accountType || "")
      .replace(/\s+/g, "")
      .toLowerCase();

    if (userRole !== "superadmin") {
      return res
        .status(403)
        .json(
          new apiResponse(
            403,
            null,
            "Access denied. Only SuperAdmin can perform this action."
          )
        );
    }

    next();
  } catch (error) {
    console.error("❌ isSuperAdmin middleware error:", error.message);
    return res
      .status(500)
      .json(new apiResponse(500, null, "Internal server error"));
  }
};

export default isSuperAdmin;
