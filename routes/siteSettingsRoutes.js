import express from "express";
import { getSiteSettings, updateSiteSettings } from "../controllers/siteSettingsController.js";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// ── Public (no auth) ─────────────────────────────────
router.get("/", getSiteSettings);

// ── Admin only ───────────────────────────────────────
router.put("/update", verifyMainJWT, updateSiteSettings);

export default router;
