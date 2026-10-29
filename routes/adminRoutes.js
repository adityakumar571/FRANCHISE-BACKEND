import express from "express";

import {
  createAdmin,
  deleteAdmin,
  getAdminById,
  getAdmins,
  updateAdmin,
  resetAdminPassword,
} from "../controllers/adminController.js";
const router = express.Router();

router.post("/create", createAdmin);
router.get("/", getAdmins);
router.get("/:id", getAdminById);
router.put("/:id", updateAdmin);
router.delete("/:id", deleteAdmin);
router.post("/reset-password", resetAdminPassword);

export default router;
