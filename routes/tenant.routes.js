import express from "express";
import {
    deleteTenant,
    getAllTenants,
    getTenantById,
    registerTenant,
    toggleTenantStatus,
    updateTenant,
    loginAsTenantUser,
    franchiseLogin,
} from "../controllers/tenant.controller.js";
import { verifyMainJWT, authorizeMainUserType } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// ⚠️ PROTECTED: Only Super Admin can create franchises
router.post("/", verifyMainJWT, authorizeMainUserType('Super Admin'), registerTenant);

// ⚠️ PROTECTED: Only Super Admin can view all franchises
router.get("/", verifyMainJWT, authorizeMainUserType('Super Admin'), getAllTenants);

// ⚠️ PROTECTED: Only Super Admin can login as franchise user
router.post("/:id/login-as", verifyMainJWT, authorizeMainUserType('Super Admin'), loginAsTenantUser);

// ⚠️ PROTECTED: Only Super Admin can view franchise details
router.get("/:id", verifyMainJWT, authorizeMainUserType('Super Admin'), getTenantById);

// ⚠️ PROTECTED: Only Super Admin can update franchise
router.put("/:id", verifyMainJWT, authorizeMainUserType('Super Admin'), updateTenant);

// ⚠️ PROTECTED: Only Super Admin can delete franchise
router.delete("/:id", verifyMainJWT, authorizeMainUserType('Super Admin'), deleteTenant);

// ⚠️ PROTECTED: Only Super Admin can toggle franchise status
router.patch("/toggle-status/:id", verifyMainJWT, authorizeMainUserType('Super Admin'), toggleTenantStatus);

export default router;