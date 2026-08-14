import { Router } from "express";
import { getTenantDashboard } from "../controllers/DashboardController.js";

const router = Router();

router.get("/dashboard", getTenantDashboard);

export default router;