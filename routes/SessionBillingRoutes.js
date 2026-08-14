import { Router } from "express";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import { verifyPortalJWT } from "../middleware/portalAuth.middleware.js";
import {
  generateSessionBill,
  recordPayment,
  getSessionDashboard,
  getAllSessionBills,
  getSessionBillDetail,
  getReceipts,
  generateBulkSessionBills,
  markOverdueMonths,
  updateSessionBill,
  processAlerts,
  getSubscriptionReport,
  getPortalSessionBill,
  fixRestrictionFlags,
} from "../controllers/SessionBillingController.js";

const router = Router();

/* ── PORTAL (school-facing) ─────────────────────────────────── */
router.get("/portal/my-bill", verifyPortalJWT, getPortalSessionBill);

/* ── ADMIN ────────────────────────────────────────────────────
   All admin routes require verifyMainJWT (SAAS admin token)
─────────────────────────────────────────────────────────────── */

// Generate session bill for ONE tenant
router.post("/generate", verifyMainJWT, generateSessionBill);

// Bulk generate for ALL active tenants (April 1 cron)
router.post("/generate-bulk", verifyMainJWT, generateBulkSessionBills);

// Record payment (single / multi-month / advance / partial)
router.post("/:tenantId/pay", verifyMainJWT, recordPayment);

// Update session bill (student count, overdue threshold, recalc)
router.patch("/:tenantId/update", verifyMainJWT, updateSessionBill);

// Mark overdue months (run daily via cron)
router.patch("/mark-overdue", verifyMainJWT, markOverdueMonths);

// Process alerts (run daily via cron)
router.post("/process-alerts", verifyMainJWT, processAlerts);

// Get all session bills (admin listing with filters)
router.get("/", verifyMainJWT, getAllSessionBills);

// Subscription collection report (admin)
router.get("/report", verifyMainJWT, getSubscriptionReport);

// Dashboard for specific tenant + session
router.get("/:tenantId/dashboard", verifyMainJWT, getSessionDashboard);

// Full detail (all months + receipts)
router.get("/:tenantId/detail", verifyMainJWT, getSessionBillDetail);

// All receipts for a session
router.get("/:tenantId/receipts", verifyMainJWT, getReceipts);

// One-time fix: clear stale restriction flags on fully-paid bills
router.post("/fix-restrictions", verifyMainJWT, fixRestrictionFlags);

export default router;
