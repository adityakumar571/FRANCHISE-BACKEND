import express from "express";
import {
  createMarks,
  getAllMarks,
  getMarksById,
  updateMarks,
  updateStudentMarks,
  deleteMarks,
  getClassWiseMarksSummary,
  getFullMarksheet,
  publishResult,
  unpublishResult,
  teacherCreateMarks,
  getClassWiseTopper,
  getSchoolWiseTopper,
} from "../../../controllers/tenant/academics/MarksheetController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.get("/", getAllMarks);
router.post("/", createMarks);
router.get("/getClassWiseMarksSummary", getClassWiseMarksSummary);
router.get("/getFullMarksheet", getFullMarksheet);
router.put("/update-student-marks", updateStudentMarks);
router.post("/marksheet", teacherCreateMarks);
router.post("/publish-result", verifyJWT, publishResult);
router.post("/unpublish-result", verifyJWT, unpublishResult);
router.get("/class-wise-topper", verifyJWT, getClassWiseTopper);

router.get("/school-wise-topper", verifyJWT, getSchoolWiseTopper);
router.get("/:id", getMarksById);
router.put("/:id", updateMarks);
router.delete("/:id", deleteMarks);

export default router;
