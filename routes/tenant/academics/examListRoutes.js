import express from "express";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

import {
  createExamList,
  deleteExamList,
  getAllExamList,
  getExamByIdList,
  reorderExamList,
  updateExamList,
} from "../../../controllers/tenant/academics/ExamListController.js";
const router = express.Router();

router.post("/", verifyJWT, createExamList);
router.get("/", getAllExamList);
router.put("/reorderExamList", reorderExamList);
router.get("/:id", getExamByIdList);
router.put("/:id", verifyJWT, updateExamList);
router.delete("/:id", verifyJWT, deleteExamList);

export default router;
