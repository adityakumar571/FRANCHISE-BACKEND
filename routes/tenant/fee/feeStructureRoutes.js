import { Router } from "express";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";
import {
  createFeeStructure,
  deleteFeeStructure,
  getFeeStructures,
  getFullFeeStructureById,
  getFullFeeStructures,
  updateFeeStructure,
} from "../../../controllers/tenant/fee/FeeStructureController.js";

const router = Router();

/* ================= PUBLIC ================= */
router.get("/", getFeeStructures);
router.get("/:id/full", getFullFeeStructureById);
router.get("/full", getFullFeeStructures);

/* ================= PROTECTED ================= */
router.post("/", createFeeStructure);
router.put("/:id", verifyJWT, updateFeeStructure);
router.delete("/:id", verifyJWT, deleteFeeStructure);

export default router;
