import express from "express";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import {
    createPlan,
    deletePlan,
    getAllPlans,
    getPlanById,
    togglePlanStatus,
    updatePlan
} from "../controllers/Subscription.controller.js";

const router = express.Router();

// ── Public GET (school LMS uses this to display available plans) ──────────────
router.get("/",    getAllPlans);
router.get("/:id", getPlanById);

// ── Admin-only mutations ──────────────────────────────────────────────────────
router.post("/",           verifyMainJWT, createPlan);
router.put("/:id",         verifyMainJWT, updatePlan);
router.delete("/:id",      verifyMainJWT, deletePlan);
router.patch("/:id/toggle", verifyMainJWT, togglePlanStatus);

export default router;