/**
 * FreeTrialPackage.routes.js
 * Mounted at: /api/free-trial-packages
 * All routes require admin JWT.
 */

import { Router } from "express";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import {
    createFreeTrialPackage,
    getAllFreeTrialPackages,
    getFreeTrialPackageById,
    updateFreeTrialPackage,
    deleteFreeTrialPackage,
    toggleFreeTrialPackageStatus,
    setDefaultFreeTrialPackage,
    assignFreeTrialToSchool,
    resetTrialEligibility,
} from "../controllers/FreeTrialPackage.controller.js";

const router = Router();

// ── All admin-protected ────────────────────────────────────────────────────
router.post("/",                               verifyMainJWT, createFreeTrialPackage);
router.get("/",                                verifyMainJWT, getAllFreeTrialPackages);

// ⚠️  Specific named routes BEFORE /:id param routes to avoid Express conflicts
router.patch("/reset-eligibility/:tenantId",   verifyMainJWT, resetTrialEligibility);

router.get("/:id",                             verifyMainJWT, getFreeTrialPackageById);
router.put("/:id",                             verifyMainJWT, updateFreeTrialPackage);
router.delete("/:id",                          verifyMainJWT, deleteFreeTrialPackage);
router.patch("/:id/toggle",                    verifyMainJWT, toggleFreeTrialPackageStatus);
router.patch("/:id/set-default",               verifyMainJWT, setDefaultFreeTrialPackage);

// ── Assign a specific trial package to a particular school ─────────────────
// POST /api/free-trial-packages/:id/assign/:tenantId
// Body: { force?: true }  (optional — admin override for eligibleOnce check)
router.post("/:id/assign/:tenantId",           verifyMainJWT, assignFreeTrialToSchool);

export default router;
