import express from "express";
import {
  createHomework,
  getAllHomework,
  getStudentHomework,
  getHomeworkById,
  updateHomework,
  deleteHomework,
  getHomeworkByTeacher,
} from "../../../controllers/tenant/academics/HomeWorkController.js";

import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();



router.post("/", verifyJWT, createHomework);

router.get("/", getAllHomework);
router.get("/student", getStudentHomework);
router.get("/teacher", getHomeworkByTeacher); 

router.get("/:id", getHomeworkById);

router.put("/:id", verifyJWT, updateHomework);

router.delete("/:id",verifyJWT, deleteHomework);

export default router;