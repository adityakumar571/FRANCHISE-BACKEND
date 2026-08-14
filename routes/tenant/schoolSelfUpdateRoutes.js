import express from "express";
import { verifyJWT, authorizeUserType } from "../../middleware/authTypeMiddleware.js";
import {
  getSchoolProfile,
  updateSchoolProfile,
} from "../../controllers/tenant/schoolSelfUpdateController.js";

const router = express.Router();

// Only SuperAdmin can update school profile when logged into a school context
router.get("/",    verifyJWT, authorizeUserType("Admin", "SuperAdmin"), getSchoolProfile);
router.patch("/",  verifyJWT, authorizeUserType("Admin", "SuperAdmin"), updateSchoolProfile);

export default router;
