import express from "express";

import { createUser, getProfile, loginUser } from "../controllers/mainUser.controller.js";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

router.post("/register", createUser);
router.post("/login", loginUser);

// SuperAdmin login via email+password (used by SuperAdminLogin.jsx → POST auth/superadmin/login)
router.post("/superadmin/login", loginUser);

router.get("/getProfile", verifyMainJWT, getProfile);

export default router;