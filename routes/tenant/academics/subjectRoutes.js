import { Router } from "express";
import {
  createSubject,
  deleteSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
} from "../../../controllers/tenant/academics/subjectController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = Router();

// 🔹 Public Routes
router.get("/", getAllSubjects);
router.get("/:id", getSubjectById);

// 🔹 Protected/Admin Routes
router.post("/", verifyJWT, createSubject);
router.put("/:id", verifyJWT, updateSubject);
router.delete("/:id", verifyJWT, deleteSubject);

export default router;
