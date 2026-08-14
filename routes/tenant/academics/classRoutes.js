import { Router } from "express";

import {
  createClass,
  deleteClass,
  getAllClasses,
  getClassById, migrateClassOrder, updateClass
} from "../../../controllers/tenant/academics/classController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = Router();

// 🔹 Public Routes
router.get("/", getAllClasses);
router.get("/:id", getClassById);
router.put("/migrateClassOrder", migrateClassOrder);

// 🔹 Protected/Admin Routes
router.post("/", verifyJWT, createClass);
router.put("/:id", verifyJWT, updateClass);
router.delete("/:id", verifyJWT, deleteClass);

export default router;
