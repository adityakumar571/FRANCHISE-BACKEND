import express from "express";

import {
  createAdmin,
  deleteAdmin,
  getAdminById,
  getAdmins,
  updateAdmin,
  toggleAdminStatus,
  superAdminLogin,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} from "../controllers/adminController.js";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────
// POST /api/admins/login  — SuperAdmin portal login
// Also mounted at /api/auth/superadmin/login for frontend compatibility
router.post("/login", superAdminLogin);

// ── Current admin's own profile (must come before /:id routes) ───────────────
router.get("/me",                  verifyMainJWT, getMyProfile);
router.put("/me",                  verifyMainJWT, updateMyProfile);
router.put("/me/change-password",  verifyMainJWT, changeMyPassword);

// ── CRUD ──────────────────────────────────────────────────
router.post("/create", createAdmin);
router.get("/", getAdmins);
router.get("/:id", getAdminById);
router.put("/:id", updateAdmin);
router.delete("/:id", deleteAdmin);
router.patch("/:id/toggle", toggleAdminStatus);

export default router;
