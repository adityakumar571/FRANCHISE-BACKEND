import express from "express";
import { createAttendance, getAttendanceByDate, updateAttendance, getClassMonthlyCalendarAttendance, getStudentMonthlyCalendarAttendance, getMonthWiseClassReport, getYearWiseClassReport, getStudentAttendanceReport } from "../../../controllers/tenant/academics/AttendanceController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createAttendance);
router.get("/day", getAttendanceByDate);
router.put("/:id", updateAttendance);
router.get("/class-monthly", getClassMonthlyCalendarAttendance);
router.get("/student-monthly", getStudentMonthlyCalendarAttendance);
router.get("/report/class/month", getMonthWiseClassReport);
router.get("/report/class/year", getYearWiseClassReport);
router.get("/report/student", getStudentAttendanceReport);
router.get("/monthly-calendar", getClassMonthlyCalendarAttendance);
router.get("/monthly-student-calendar", getStudentMonthlyCalendarAttendance);

export default router;
