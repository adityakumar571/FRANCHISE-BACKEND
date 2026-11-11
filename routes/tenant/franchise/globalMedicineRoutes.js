import express from "express";
import {
  getAvailableGlobalMedicines,
  importGlobalMedicine,
  bulkImportGlobalMedicines,
  bulkImportAllGlobalMedicines,
  checkGlobalMedicineUpdates,
  updateMedicineFromGlobal,
  unlinkFromGlobal,
} from "../../../controllers/tenant/franchise/globalMedicineController.js";

const router = express.Router();

// ── GET Available Global Medicines
router.get("/global-available", getAvailableGlobalMedicines);

// ── Import Single Global Medicine
router.post("/import-global/:globalMedicineId", importGlobalMedicine);

// ── Bulk Import Global Medicines (by list)
router.post("/bulk-import-global", bulkImportGlobalMedicines);

// ── Bulk Import ALL Global Medicines (all at once)
router.post("/import-all-global", bulkImportAllGlobalMedicines);

// ── Check for Updates from Global
router.get("/:id/check-global-update", checkGlobalMedicineUpdates);

// ── Update Specific Fields from Global
router.patch("/:id/update-from-global", updateMedicineFromGlobal);

// ── Unlink from Global
router.delete("/:id/unlink-global", unlinkFromGlobal);

export default router;
