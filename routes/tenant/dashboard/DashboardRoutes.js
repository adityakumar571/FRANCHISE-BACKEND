import { Router } from "express";

import { getAdminDashboardStats, getStudentDashboardStats, getTeacherDashboardStats, getParentDashboardStats, getDateWiseClassAttendance, getDashboardDefaulterSummary } from "../../../controllers/tenant/dashboard/DashboardController.js"

const router = Router();

router.get("/dashboard", getAdminDashboardStats);
router.get(
    "/dashboard/defaulter-summary",

    getDashboardDefaulterSummary
);
router.get("/dashboard/attendance", getDateWiseClassAttendance);
router.get("/student/dashboard", getStudentDashboardStats);
router.get("/teacher/dashboard", getTeacherDashboardStats);
router.get("/parent/dashboard", getParentDashboardStats);

export default router;