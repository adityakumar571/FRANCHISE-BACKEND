import { Router } from "express";
import { createStudentRegistration, deleteStudentRegistration, getAllStudentRegistrations, getStudentRegistrationById, updateStudentRegistration } from "../../../controllers/tenant/student/studentRegistrationController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";



const router = Router();

router.get("/", getAllStudentRegistrations);
router.get("/:id", getStudentRegistrationById);

router.post("/", verifyJWT, createStudentRegistration);
router.put("/:id", verifyJWT, updateStudentRegistration);
router.delete("/:id", verifyJWT, deleteStudentRegistration);

export default router;
