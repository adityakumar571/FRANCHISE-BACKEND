import { Router } from "express";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import {
  createAdditionalFee,
  deleteAdditionalFee,
  getAdditionalFees,
  updateAdditionalFee,
} from "../../../controllers/tenant/fee/AdditionalFeeController.js";
import {
  getPendingFeesForStudent,
  getAdditionalFeeWaivers,
  waiveAdditionalFee,
  updateWaiverReason,
  unwaiveAdditionalFee,
} from "../../../controllers/tenant/fee/AdditionalFeeWaiverController.js";

const router = Router();

/* ================= WAIVER — must be BEFORE /:id param routes ================= */
// GET routes — no auth needed (same pattern as existing GET /)
router.get("/pending-for-student", getPendingFeesForStudent);
router.get("/waiver", getAdditionalFeeWaivers);

// POST /waiver/unwaive — must be BEFORE /waiver/:id/reason (exact before param)
router.post("/waiver/unwaive", verifyJWT, unwaiveAdditionalFee);
router.post("/waiver/:id/reason", verifyJWT, updateWaiverReason);
router.post("/waiver", verifyJWT, waiveAdditionalFee);

/* ================= ADDITIONAL FEE CRUD ================= */
router.get("/", getAdditionalFees);
router.post("/", verifyJWT, createAdditionalFee);
router.put("/:id", verifyJWT, updateAdditionalFee);
router.delete("/:id", verifyJWT, deleteAdditionalFee);

export default router;
