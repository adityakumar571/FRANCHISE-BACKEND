import express from "express";
import { verifyJWT, authorizeUserType } from "../../../middleware/authTypeMiddleware.js";
import {
  getPayrollDashboard,
  generatePayroll,
  getPayroll,
  getPayrollById,
  updatePayroll,
  deletePayroll,
  recordPayment,
  getPayments,
  getSalarySlip,
} from "../../../controllers/tenant/hr/payrollController.js";
import {
  getSalaryStructures,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
} from "../../../controllers/tenant/hr/salaryStructureController.js";

const router = express.Router();
router.use(verifyJWT);

const hrAccess = authorizeUserType("Admin", "SuperAdmin", "HRManager", "HRStaff");
const hrManage = authorizeUserType("Admin", "SuperAdmin", "HRManager");
const adminOnly = authorizeUserType("Admin", "SuperAdmin");

// ── PAYROLL DASHBOARD ─────────────────────────────────────────
router.get("/payroll/dashboard",          hrAccess, getPayrollDashboard);

// ── SALARY STRUCTURE ──────────────────────────────────────────
router.get("/salary-structures",          hrAccess, getSalaryStructures);
router.post("/salary-structures",         hrManage, createSalaryStructure);
router.put("/salary-structures/:id",      hrManage, updateSalaryStructure);
router.delete("/salary-structures/:id",   adminOnly, deleteSalaryStructure);

// ── PAYROLL ───────────────────────────────────────────────────
router.get("/payroll",                    hrAccess, getPayroll);
router.post("/payroll/generate",          hrManage, generatePayroll);
router.get("/payroll/:id",                hrAccess, getPayrollById);
router.put("/payroll/:id",                hrManage, updatePayroll);
router.delete("/payroll/:id",             adminOnly, deletePayroll);

// ── SALARY PAYMENT ────────────────────────────────────────────
router.post("/salary-payments",           hrManage, recordPayment);
router.get("/salary-payments",            hrAccess, getPayments);

// ── SALARY SLIP ───────────────────────────────────────────────
router.get("/salary-slip/:id",            hrAccess, getSalarySlip);

export default router;
