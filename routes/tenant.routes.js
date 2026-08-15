import express from "express";
import {
    deleteTenant,
    getAllTenants,
    getTenantById,
    registerTenant,
    toggleTenantStatus,
    updateTenant,
    loginAsTenantUser,
} from "../controllers/tenant.controller.js";

const router = express.Router();

router.post("/", registerTenant);

router.get("/", getAllTenants);

// Login as franchise admin/superadmin — returns JWT token for that tenant user
router.post("/:id/login-as", loginAsTenantUser);

router.get("/:id", getTenantById);

router.put("/:id", updateTenant);

router.delete("/:id", deleteTenant);

router.patch("/toggle-status/:id", toggleTenantStatus);

export default router;