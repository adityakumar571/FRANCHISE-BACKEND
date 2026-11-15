import express from "express";
import { getDashboardData } from "../controllers/superAdminDashboard.controller.js";
import { verifyMainJWT, authorizeMainUserType } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// ⚠️ PROTECTED: Only Super Admin can access dashboard
router.get("/", verifyMainJWT, authorizeMainUserType("Super Admin"), getDashboardData);

export default router;
