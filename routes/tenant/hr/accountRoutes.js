import express from "express";
import { verifyJWT, authorizeUserType } from "../../../middleware/authTypeMiddleware.js";
import {
  getAccountHeads, createAccountHead, updateAccountHead, deleteAccountHead,
  createVoucher, getVouchers, getVoucherById, cancelVoucher,
  getDayBook, getMonthlySummary, getAccountsDashboard,
  getAnnualReport, getPaymentModeReport,
} from "../../../controllers/tenant/hr/accountController.js";

const router = express.Router();
router.use(verifyJWT);

const hrAccess  = authorizeUserType("Admin", "SuperAdmin", "HRManager", "HRStaff");
const hrManage  = authorizeUserType("Admin", "SuperAdmin", "HRManager");
const adminOnly = authorizeUserType("Admin", "SuperAdmin");

// ── Account Heads ────────────────────────────────────────────
router.get   ("/account-heads",        hrAccess,  getAccountHeads);
router.post  ("/account-heads",        adminOnly, createAccountHead);
router.put   ("/account-heads/:id",    adminOnly, updateAccountHead);
router.delete("/account-heads/:id",    adminOnly, deleteAccountHead);

// ── Vouchers ─────────────────────────────────────────────────
router.get   ("/vouchers",             hrAccess,  getVouchers);
router.post  ("/vouchers",             hrAccess,  createVoucher);
router.get   ("/vouchers/:id",         hrAccess,  getVoucherById);
router.patch ("/vouchers/:id/cancel",  hrManage,  cancelVoucher);

// ── Reports ──────────────────────────────────────────────────
router.get   ("/accounts/dashboard",    hrAccess,  getAccountsDashboard);
router.get   ("/accounts/day-book",     hrAccess,  getDayBook);
router.get   ("/accounts/monthly",      hrAccess,  getMonthlySummary);
router.get   ("/accounts/annual",       hrAccess,  getAnnualReport);
router.get   ("/accounts/payment-mode", hrAccess,  getPaymentModeReport);

export default router;
