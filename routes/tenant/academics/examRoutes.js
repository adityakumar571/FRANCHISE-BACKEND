import express from "express";

import {
  createExam,
  deleteExam,
  getAllExams,
  getExamById,
  migrateExamOrder,
  updateExam
} from "../../../controllers/tenant/academics/ExamController.js"
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.post("/", verifyJWT, createExam);
router.get("/", getAllExams);
router.get("/:id", getExamById);
router.put("/migrateExamOrder", migrateExamOrder);
router.put("/:id", verifyJWT, updateExam);
router.delete("/:id", verifyJWT, deleteExam);

export default router;
