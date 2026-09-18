import express from "express";
import { verifyJWT, authorizeUserType } from "../../../middleware/authTypeMiddleware.js";

// ── Controllers ──────────────────────────────────────────────
import { getHRDashboard }                                          from "../../../controllers/tenant/hr/hrDashboardController.js";
import { getDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment } from "../../../controllers/tenant/hr/departmentController.js";
import { getDesignations, getDesignationById, createDesignation, updateDesignation, deleteDesignation } from "../../../controllers/tenant/hr/designationController.js";
import { getAllStaff, getStaffById, createStaff, updateStaff, deleteStaff, getStaffCredentials } from "../../../controllers/tenant/hr/staffController.js";
import { hrLogin, createHRUser, getHRUsers, updateHRUser, deleteHRUser } from "../../../controllers/tenant/hr/hrUserController.js";

const router = express.Router();

// ── PUBLIC — HR Login (no JWT needed) ────────────────────────
// POST /api/hr/login
router.post("/login", hrLogin);

// All routes below require valid JWT
router.use(verifyJWT);

// ── ROLES SHORTCUTS ──────────────────────────────────────────
const adminOnly      = authorizeUserType("Admin", "SuperAdmin");
const hrReadAccess   = authorizeUserType("Admin", "SuperAdmin", "HRManager", "HRStaff");
const hrWriteAccess  = authorizeUserType("Admin", "SuperAdmin", "HRManager");

// ── HR USER MANAGEMENT ───────────────────────────────────────
// Only Admin / SuperAdmin can manage HR users
router.get   ("/users",     authorizeUserType("Admin", "SuperAdmin"), getHRUsers);
router.post  ("/users",     authorizeUserType("Admin", "SuperAdmin"), createHRUser);
router.put   ("/users/:id", authorizeUserType("Admin", "SuperAdmin"), updateHRUser);
router.delete("/users/:id", authorizeUserType("Admin", "SuperAdmin"), deleteHRUser);

// ── DASHBOARD ────────────────────────────────────────────────
// GET /api/hr/dashboard  → Admin, SuperAdmin, HRManager, HRStaff
router.get("/dashboard", hrReadAccess, getHRDashboard);

// ── DEPARTMENTS ──────────────────────────────────────────────
// GET    /api/hr/departments        → Admin, SuperAdmin, HRManager, HRStaff
// POST   /api/hr/departments        → Admin, SuperAdmin
// GET    /api/hr/departments/:id    → Admin, SuperAdmin, HRManager, HRStaff
// PUT    /api/hr/departments/:id    → Admin, SuperAdmin
// DELETE /api/hr/departments/:id    → Admin, SuperAdmin
router.get   ("/departments",     hrReadAccess, getDepartments);
router.post  ("/departments",     adminOnly,    createDepartment);
router.get   ("/departments/:id", hrReadAccess, getDepartmentById);
router.put   ("/departments/:id", adminOnly,    updateDepartment);
router.delete("/departments/:id", adminOnly,    deleteDepartment);

// ── DESIGNATIONS ─────────────────────────────────────────────
// GET    /api/hr/designations        → Admin, SuperAdmin, HRManager, HRStaff
// POST   /api/hr/designations        → Admin, SuperAdmin
// GET    /api/hr/designations/:id    → Admin, SuperAdmin, HRManager, HRStaff
// PUT    /api/hr/designations/:id    → Admin, SuperAdmin
// DELETE /api/hr/designations/:id    → Admin, SuperAdmin
router.get   ("/designations",     hrReadAccess, getDesignations);
router.post  ("/designations",     adminOnly,    createDesignation);
router.get   ("/designations/:id", hrReadAccess, getDesignationById);
router.put   ("/designations/:id", adminOnly,    updateDesignation);
router.delete("/designations/:id", adminOnly,    deleteDesignation);

// ── STAFF ────────────────────────────────────────────────────
// GET    /api/hr/staff        → Admin, SuperAdmin, HRManager, HRStaff
// POST   /api/hr/staff        → Admin, SuperAdmin, HRManager
// GET    /api/hr/staff/:id    → Admin, SuperAdmin, HRManager, HRStaff
// PUT    /api/hr/staff/:id    → Admin, SuperAdmin, HRManager
// DELETE /api/hr/staff/:id    → Admin, SuperAdmin only
router.get   ("/staff",          hrReadAccess,  getAllStaff);
router.post  ("/staff",          hrWriteAccess, createStaff);
router.get   ("/staff/:id/credentials", hrReadAccess, getStaffCredentials);   // ← credentials
router.get   ("/staff/:id",      hrReadAccess,  getStaffById);
router.put   ("/staff/:id",      hrWriteAccess, updateStaff);
router.delete("/staff/:id",      adminOnly,     deleteStaff);

export default router;
