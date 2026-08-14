import { Router } from "express";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import {
  getPendingTransportFeesForStudent,
  getTransportFeeWaivers,
  waiveTransportFee,
  unwaiveTransportFee,
  updateTransportWaiverReason,
} from "../../../controllers/tenant/fee/TransportFeeWaiverController.js";

const router = Router();

/* ── GET routes ── */
router.get("/pending-for-student", getPendingTransportFeesForStudent);
router.get("/waiver",              getTransportFeeWaivers);

/* ── POST routes — exact paths before param routes ── */
router.post("/waiver/unwaive",      verifyJWT, unwaiveTransportFee);
router.post("/waiver/:id/reason",   verifyJWT, updateTransportWaiverReason);
router.post("/waiver",              verifyJWT, waiveTransportFee);

export default router;
