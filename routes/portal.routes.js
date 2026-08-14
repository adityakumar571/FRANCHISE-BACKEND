import express from "express";
import {
    portalSendOtp,
    portalVerifyOtp,
    portalLogin,
    portalSetPassword,
    portalDashboard,
    portalLogout,
} from "../controllers/PortalAuth.controller.js";
import { verifyPortalJWT } from "../middleware/portalAuth.middleware.js";

const router = express.Router();

// ── PUBLIC ────────────────────────────────────────────────────
router.post("/send-otp",      portalSendOtp);    // OTP bhejo
router.post("/verify-otp",    portalVerifyOtp);  // OTP verify → token
router.post("/login",         portalLogin);      // Password login → token

// ── AUTH REQUIRED ─────────────────────────────────────────────
router.post("/set-password",  verifyPortalJWT, portalSetPassword);
router.get("/dashboard",      verifyPortalJWT, portalDashboard);
router.post("/logout",        verifyPortalJWT, portalLogout);

export default router;
