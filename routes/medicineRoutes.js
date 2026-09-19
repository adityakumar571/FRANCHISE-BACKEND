import express from "express";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import {
  getAllMedicines, getMedicineStats, createMedicine, updateMedicine, toggleMedicine, deleteMedicine,
  getAllBrands,    createBrand,    updateBrand,    toggleBrand,    deleteBrand,
  getAllCategories,createCategory, updateCategory, toggleCategory, deleteCategory,
  getHsnList,
} from "../controllers/medicineController.js";

const router = express.Router();

/* ── Medicines ──────────────────────────────────────────── */
router.get("/stats",         verifyMainJWT, getMedicineStats);
router.get("/",              verifyMainJWT, getAllMedicines);
router.post("/",             verifyMainJWT, createMedicine);
router.put("/:id",           verifyMainJWT, updateMedicine);
router.patch("/:id/toggle",  verifyMainJWT, toggleMedicine);
router.delete("/:id",        verifyMainJWT, deleteMedicine);

/* ── Brands ─────────────────────────────────────────────── */
router.get("/brands",               verifyMainJWT, getAllBrands);
router.post("/brands",              verifyMainJWT, createBrand);
router.put("/brands/:id",           verifyMainJWT, updateBrand);
router.patch("/brands/:id/toggle",  verifyMainJWT, toggleBrand);
router.delete("/brands/:id",        verifyMainJWT, deleteBrand);

/* ── Categories ─────────────────────────────────────────── */
router.get("/categories",               verifyMainJWT, getAllCategories);
router.post("/categories",              verifyMainJWT, createCategory);
router.put("/categories/:id",           verifyMainJWT, updateCategory);
router.patch("/categories/:id/toggle",  verifyMainJWT, toggleCategory);
router.delete("/categories/:id",        verifyMainJWT, deleteCategory);

/* ── HSN / Tax ──────────────────────────────────────────── */
router.get("/hsn", verifyMainJWT, getHsnList);

export default router;
