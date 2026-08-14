import express from "express";

import {
  activateInstallmentType,
  getActiveInstallmentType,
  updateInstallmentActiveStatus,
  seedInstallmentTypes,
} from "../../../controllers/tenant/fee/installmentTypeController.js";
const router = express.Router();

router.post("/seed", seedInstallmentTypes);
router.post("/activate", activateInstallmentType);
router.get("/active", getActiveInstallmentType);
router.put("/:id", updateInstallmentActiveStatus);

export default router;
