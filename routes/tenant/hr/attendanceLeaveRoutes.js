import express from "express";
import { verifyJWT, authorizeUserType } from "../../../middleware/authTypeMiddleware.js";
import {
  markAttendance,
  bulkMarkAttendance,
  getAttendanceByDate,
  getStaffAttendance,
  getMonthlyRegister,
} from "../../../controllers/tenant/hr/attendanceController.js";
import {
  applyLeave,
  getLeaves,
  getLeaveById,
  updateLeaveStatus,
  deleteLeave,
} from "../../../controllers/tenant/hr/leaveController.js";

const router = express.Router();
router.use(verifyJWT);

const hrAccess = authorizeUserType("Admin", "SuperAdmin", "HRManager", "HRStaff");
const hrManage = authorizeUserType("Admin", "SuperAdmin", "HRManager");

// ── Attendance ────────────────────────────────────────────────────────────────
router.post("/attendance",          hrAccess, markAttendance);
router.post("/attendance/bulk",     hrManage, bulkMarkAttendance);
router.get("/attendance/by-date",   hrAccess, getAttendanceByDate);
router.get("/attendance/staff",     hrAccess, getStaffAttendance);
router.get("/attendance/register",  hrAccess, getMonthlyRegister);

// ── Leave ─────────────────────────────────────────────────────────────────────
router.get("/leaves",               hrAccess, getLeaves);
router.post("/leaves",              hrAccess, applyLeave);
router.get("/leaves/:id",           hrAccess, getLeaveById);
router.put("/leaves/:id/status",    hrManage, updateLeaveStatus);
router.delete("/leaves/:id",        hrManage, deleteLeave);

export default router;
