import express from "express";
import { registerTenant } from "../../../controllers/tenant.controller.js";
import {
  changePassword,
  getTenentProfile,
  loginWithPassword,
  tenantLogin,
  updateFcmToken,
} from "../../../controllers/tenant/auth/authController.js";
import { verifyJWT } from "../../../middleware/authTypeMiddleware.js";

const router = express.Router();

router.post("/loginWithPassword", loginWithPassword);
router.get("/profile", verifyJWT, getTenentProfile);
router.put("/update", verifyJWT, updateFcmToken);
router.post("/change-password", verifyJWT, changePassword);

export default router;
