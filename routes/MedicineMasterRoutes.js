import express from "express";
import {
  getGlobalMedicines,
  createGlobalMedicine,
  bulkUploadMedicines,
  bulkUploadChunk,
  bulkUploadFinalize,
  getGlobalMedicineById,
  updateGlobalMedicine,
  deleteGlobalMedicine,
  exportMedicinesToExcel,
} from "../controllers/MedicineMasterController.js";
import { verifyJWTForSuperAdmin } from "../middleware/authTypeMiddleware.js";
import upload from "../config/multerConfig.js";
import { isSuperAdmin } from "../middleware/isSuperAdmin.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { getMedicineModel } from "../models/tenant/franchise/Medicine.model.js";
import mongoose from "mongoose";

const router = express.Router();

// ── PUBLIC: Get distinct categories from global medicine master ──
router.get("/public/categories", asyncHandler(async (req, res) => {
  const Medicine = getMedicineModel(mongoose.connection);
  const categories = await Medicine.distinct('category', {
    isGlobal: true,
    isActive: true,
    category: { $ne: null, $exists: true }
  });
  const sorted = categories.filter(Boolean).sort();
  return res.status(200).json(new apiResponse(200, sorted, 'Categories fetched'));
}));

// ── GET all medicines with search & filters
router.get("/", getGlobalMedicines);

// ── POST create single medicine
router.post("/", createGlobalMedicine);

// ── POST bulk upload from Excel (old method - all at once)
router.post("/bulk-upload", upload.single("file"), bulkUploadMedicines);

// ── POST bulk upload chunk (new method - chunked)
router.post("/bulk-upload-chunk", upload.single("file"), bulkUploadChunk);

// ── POST bulk upload finalize (assemble & process chunks)
router.post("/bulk-upload-finalize", bulkUploadFinalize);

// ── GET single medicine
router.get("/:id", getGlobalMedicineById);

// ── PUT update medicine
router.put("/:id", updateGlobalMedicine);

// ── DELETE medicine
router.delete("/:id", deleteGlobalMedicine);

// ── GET export to Excel
router.get("/export/excel", exportMedicinesToExcel);

export default router;
