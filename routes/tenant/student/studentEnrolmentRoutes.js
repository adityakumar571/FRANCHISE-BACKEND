import { Router } from "express";

import { assignBulkManualRollNumbers, assignRollNumbersByName, createStudentEnrolment, deleteStudentEnrolment, getAllStudentEnrolments, getStudentEnrolmentById, updateStudentEnrolment } from "../../../controllers/tenant/student/StudentEnrolmentController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import { checkStudentLimit } from "../../../middleware/checkStudentLimit.js";

const router = Router();

/* ================= PUBLIC ================= */
router.get("/", getAllStudentEnrolments);
router.get("/:id", getStudentEnrolmentById);

/* ================= PROTECTED ================= */
// checkStudentLimit enforces plan-based enrollment cap before creating
router.post("/", verifyJWT, checkStudentLimit, createStudentEnrolment);
router.post("/assignRollNumbersByName", assignRollNumbersByName);
router.post("/assignBulkManualRollNumbers", assignBulkManualRollNumbers);
router.put("/:id", verifyJWT, updateStudentEnrolment);
router.delete("/:id", verifyJWT, deleteStudentEnrolment);

// router.post("/transfer", verifyJWT, bulkStudentTransfer);

export default router;
