import express from "express";
import { createTeacher, getAllTeachers, getTeacherById, updateTeacher, deleteTeacher, assignClassToTeacher, getAssignedClassesByTeacherSession, updateAssignedClass, deleteAssignedClass } from "../../../controllers/tenant/teacher/TeacherController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/", createTeacher);
router.get("/", getAllTeachers);
router.get("/:id", getTeacherById);
router.put("/:id", updateTeacher);
router.delete("/:id", deleteTeacher);
router.post("/:teacherId/assign-class", assignClassToTeacher);
router.get("/:teacherId/assigned-classes", getAssignedClassesByTeacherSession);
router.put("/assigned-class/:assignId", updateAssignedClass);
router.delete("/assigned-class/:assignId", deleteAssignedClass);

export default router;
