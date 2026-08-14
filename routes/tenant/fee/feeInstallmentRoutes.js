import { Router } from "express";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import {
  deleteFeeInstallment,
  getInstallmentsByFeeStructure,
  updateFeeInstallment,
} from "../../../controllers/tenant/fee/FeeInstallmentController.js";

const router = Router();

/* ================= PUBLIC ================= */
router.get("/fee-structure/:feeStructureId", getInstallmentsByFeeStructure);

/* ================= PROTECTED ================= */
router.put("/:id", verifyJWT, updateFeeInstallment);
router.delete("/:id", verifyJWT, deleteFeeInstallment);

export default router;
