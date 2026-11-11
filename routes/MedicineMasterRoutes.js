import express from "express";
import {
  getGlobalMedicines,
  createGlobalMedicine,
  bulkUploadMedicines,
  getGlobalMedicineById,
  updateGlobalMedicine,
  deleteGlobalMedicine,
  exportMedicinesToExcel,
} from "../controllers/MedicineMasterController.js";
import { verifyJWTForSuperAdmin } from "../middleware/authTypeMiddleware.js";
import upload from "../config/multerConfig.js";
import { isSuperAdmin } from "../middleware/isSuperAdmin.middleware.js";

const router = express.Router();

// ── Protected Routes (Superadmin only) ──
router.use(verifyJWTForSuperAdmin, isSuperAdmin);

// ── GET all medicines with search & filters
router.get("/", getGlobalMedicines);

// ── POST create single medicine
router.post("/", createGlobalMedicine);

// ── POST bulk upload from Excel
router.post("/bulk-upload", upload.single("file"), bulkUploadMedicines);

// ── GET single medicine
router.get("/:id", getGlobalMedicineById);

// ── PUT update medicine
router.put("/:id", updateGlobalMedicine);

// ── DELETE medicine
router.delete("/:id", deleteGlobalMedicine);

// ── GET export to Excel
router.get("/export/excel", exportMedicinesToExcel);

export default router;
