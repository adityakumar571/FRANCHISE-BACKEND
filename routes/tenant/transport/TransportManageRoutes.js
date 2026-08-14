import { Router } from "express";
import {
  getStudentTransportStatus,
  setTransportExemptMonths,
  stopTransportFromMonth,
  restartTransportFromMonth,
} from "../../../controllers/tenant/transport/TransportManageController.js";

const router = Router();

// GET transport status & month summary for a student
// GET /transport-manage/:studentId?sessionId=xxx
router.get("/:studentId", getStudentTransportStatus);

// Set exempt months (vacation/chhuti months — no fee charged)
// PATCH /transport-manage/:studentId/exempt-months
// Body: { sessionId, exemptMonths: ["JUNE","JULY"], reason: "Summer vacation" }
router.patch("/:studentId/exempt-months", setTransportExemptMonths);

// Stop transport from a specific month onwards
// PATCH /transport-manage/:studentId/stop
// Body: { sessionId, fromMonth: "SEPTEMBER", reason: "..." }
router.patch("/:studentId/stop", stopTransportFromMonth);

// Restart transport from a specific month
// PATCH /transport-manage/:studentId/restart
// Body: { sessionId, fromMonth: "OCTOBER", reason: "..." }
router.patch("/:studentId/restart", restartTransportFromMonth);

export default router;
