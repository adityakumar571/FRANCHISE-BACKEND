import express from "express";

import {
    createSupport,
    getAllSupports,
    getSingleSupport,
    updateSupportStatus,
    deleteSupport,
} from "../controllers/tenant/communication/supportController.js";

import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// ==========================================
// SUPPORT AUTH MIDDLEWARE
// Works without req.db — decodes JWT directly
// School users are in tenant DB but their token
// has enough info (userId, role) for support routes
// ==========================================

const verifySupportUser = async (req, res, next) => {
    try {
        const token =
            req.cookies?.accessToken ||
            req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({
                status: false,
                message: "Unauthorized: No token provided",
            });
        }

        // Just decode — no DB lookup needed for support
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach minimal user info from token payload
        req.user = {
            _id:    decoded.userId,
            userId: decoded.userId,
            role:   decoded.role,
        };

        next();
    } catch (error) {
        return res.status(401).json({
            status: false,
            message: error?.message || "Invalid or expired token",
        });
    }
};

// ==========================================
// CREATE SUPPORT
// ==========================================
router.post("/create", verifySupportUser, createSupport);

// ==========================================
// GET ALL SUPPORTS
// ==========================================
router.get("/all", verifySupportUser, getAllSupports);

// ==========================================
// GET SINGLE SUPPORT
// ==========================================
router.get("/:id", verifySupportUser, getSingleSupport);

// ==========================================
// UPDATE SUPPORT
// ==========================================
router.put("/update/:id", verifySupportUser, updateSupportStatus);

// ==========================================
// DELETE SUPPORT
// ==========================================
router.delete("/delete/:id", verifySupportUser, deleteSupport);

export default router;
