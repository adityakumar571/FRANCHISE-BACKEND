import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

export const verifyPortalJWT = asyncHandler(async (req, res, next) => {
    const token =
        req.cookies?.portalToken ||
        req.header("Authorization")?.replace("Bearer ", "");

    if (!token)
        return res.status(401).json(new apiResponse(401, null, "Login required"));

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type !== "portal")
            return res.status(401).json(new apiResponse(401, null, "Invalid token type"));

        req.tenantId = decoded.tenantId;
        next();
    } catch {
        return res.status(401).json(new apiResponse(401, null, "Token invalid ya expire ho gaya. Dobara login karo."));
    }
});
