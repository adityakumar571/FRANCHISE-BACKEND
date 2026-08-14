import express from "express";

import { createUser, getProfile, loginUser } from "../controllers/mainUser.controller.js";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

router.post("/register", createUser);
router.post("/login", loginUser);
router.get("/getProfile", verifyMainJWT, getProfile);

export default router;