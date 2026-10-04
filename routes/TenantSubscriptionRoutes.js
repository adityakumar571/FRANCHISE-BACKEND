import { Router } from "express";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";
import { verifyPortalJWT } from "../middleware/portalAuth.middleware.js";
import {
  adminAssignPlan,
  createOrder,
  getSubscription,
  markSubscriptionPaid,
  verifyPayment,
  getInstallments,
  markInstallmentPaid,
  markInstallmentOverdue,
  upgradePlan,
  addAddon,
  removeAddon,
  cancelSubscription,
  getPortalSubscription,
} from "../controllers/TenantSubscriptionController.js";

const router = Router();

// ── PORTAL (school-facing, JWT required) ─────────────────────────────────────
// School sees their own subscription status, usage, history
router.get("/portal/my-subscription", verifyPortalJWT, getPortalSubscription);

// ── SELF-SERVICE (Razorpay flow from website) ─────────────────────────────────
router.post("/create-order",   createOrder);
router.post("/verify-payment", verifyPayment);

// ── ADMIN ROUTES (require admin JWT) ─────────────────────────────────────────
router.post("/admin-assign",   verifyMainJWT, adminAssignPlan);

router.get("/",                verifyMainJWT, getSubscription);

router.patch("/:id/mark-paid", verifyMainJWT, markSubscriptionPaid);

// Upgrade active plan
router.post("/:tenantId/upgrade",    verifyMainJWT, upgradePlan);

// Add-on management
router.post("/:tenantId/addon",      verifyMainJWT, addAddon);
router.delete("/:tenantId/addon/:addonId", verifyMainJWT, removeAddon);

// Cancel subscription
router.patch("/:tenantId/cancel",    verifyMainJWT, cancelSubscription);

// ── YEARLY INSTALLMENT ROUTES ─────────────────────────────────────────────────
router.get("/:tenantId/installments",                                    verifyMainJWT, getInstallments);
router.patch("/:tenantId/installments/:installmentNo/mark-paid",         verifyMainJWT, markInstallmentPaid);
router.patch("/:tenantId/installments/:installmentNo/mark-overdue",      verifyMainJWT, markInstallmentOverdue);

export default router;