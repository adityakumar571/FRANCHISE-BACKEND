/**
 * subscriptionGuard.js
 *
 * Runs on every tenant request AFTER tenantMiddleware + dbMiddleware.
 * Skips non-tenant (admin/public) requests where req.tenant is not set.
 *
 * Responsibilities:
 *  1. Block requests when TenantSubscription is EXPIRED / CANCELLED / PENDING
 *  2. Auto-expire subscriptions whose endDate has passed
 *  3. Block after OVERDUE grace period expires (7 days)
 *  4. Attach req.subscription for downstream middleware
 *  5. Set X-Subscription-* response headers
 *
 * Exempt routes (inline check in index.js):
 *  - /api/auth
 *  - /api/subscription-status
 *  - /api/my-subscription
 */

import TenantSubscription from "../models/TenantSubscription.modal.js";
import { asyncHandler }   from "../utils/asyncHandler.js";
import { apiResponse }    from "../utils/apiResponse.js";

const OVERDUE_GRACE_DAYS = 7;

export const subscriptionGuard = asyncHandler(async (req, res, next) => {
  // Skip for non-tenant (main/admin) requests
  if (!req.tenant) return next();

  const tenantId = req.tenant._id;
  const now      = new Date();

  const subscription = await TenantSubscription.findOne({ tenantId }).lean();

  if (!subscription) {
    return res.status(403).json(
      new apiResponse(403, { reason: "NO_SUBSCRIPTION" },
        "No active subscription found. Please contact admin.")
    );
  }

  const endDate   = subscription.currentPlan?.endDate;
  const isExpired = endDate ? now > new Date(endDate) : false;
  const daysLeft  = endDate
    ? Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24))
    : null;

  // Auto-expire
  if (isExpired && ["ACTIVE", "TRIAL"].includes(subscription.status)) {
    TenantSubscription.updateOne(
      { _id: subscription._id },
      { $set: { status: "EXPIRED" } }
    ).catch((e) => console.error("[subscriptionGuard] auto-expire failed:", e.message));

    const isTrial = subscription.status === "TRIAL";
    return res.status(403).json(
      new apiResponse(403, {
        reason:   "EXPIRED",
        endDate,
        daysLeft: 0,
        isTrial,
      }, isTrial
        ? "Your free trial has expired. Please contact admin to activate a plan."
        : "Your subscription has expired. Please contact admin to renew."
      )
    );
  }

  if (subscription.status === "EXPIRED") {
    return res.status(403).json(
      new apiResponse(403, { reason: "EXPIRED", endDate },
        "Subscription expired. Contact admin to renew.")
    );
  }
  if (subscription.status === "CANCELLED") {
    return res.status(403).json(
      new apiResponse(403, { reason: "CANCELLED" },
        "Subscription cancelled. Contact admin.")
    );
  }
  if (subscription.status === "PENDING") {
    return res.status(403).json(
      new apiResponse(403, { reason: "PENDING" },
        "Subscription pending activation. Contact admin.")
    );
  }

  // Overdue grace-period block
  if (subscription.paidStatus === "OVERDUE" && subscription.dueDate) {
    const overdueSince = Math.ceil(
      (now - new Date(subscription.dueDate)) / (1000 * 60 * 60 * 24)
    );
    if (overdueSince > OVERDUE_GRACE_DAYS) {
      return res.status(402).json(
        new apiResponse(402, {
          reason: "PAYMENT_OVERDUE", dueDate: subscription.dueDate,
          overdueSince, graceDays: OVERDUE_GRACE_DAYS,
        }, `Payment overdue by ${overdueSince} days. Access suspended. Contact admin.`)
      );
    }
  }

  // Attach to request
  req.subscription = subscription;

  // No session restrictions — admissions/registration always open unless plan expired
  req.sessionRestrictions = {
    newAdmissionsBlocked:       false,
    studentRegistrationBlocked: false,
    overdueMonthCount:          0,
    hasSessionBill:             false,
  };

  // Response headers
  const usagePct = subscription.totalStudentLimit > 0
    ? Math.round(((subscription.usedStudents || 0) / subscription.totalStudentLimit) * 100)
    : 0;

  res.set("X-Subscription-Status",    subscription.status);
  res.set("X-Subscription-Days-Left", daysLeft !== null ? String(Math.max(0, daysLeft)) : "unlimited");
  res.set("X-Subscription-Used",      String(subscription.usedStudents || 0));
  res.set("X-Subscription-Limit",     String(subscription.totalStudentLimit || 0));
  res.set("X-Subscription-Usage-Pct", String(usagePct));
  res.set("X-Subscription-Paid",      subscription.paidStatus || "UNKNOWN");
  if (subscription.isTrial) {
    res.set("X-Subscription-Trial",      "true");
    res.set("X-Subscription-Trial-Days", daysLeft !== null ? String(Math.max(0, daysLeft)) : "0");
  }

  // Warnings
  const warnings = [];
  if (daysLeft !== null && daysLeft <= 30 && daysLeft > 0 && !subscription.isTrial) warnings.push("EXPIRING_SOON");
  if (daysLeft !== null && daysLeft <= 7  && daysLeft > 0 && subscription.isTrial)  warnings.push("TRIAL_EXPIRING_SOON");
  if (daysLeft !== null && daysLeft <= 0)   warnings.push("EXPIRED");
  if (usagePct >= 90)                        warnings.push("LIMIT_CRITICAL");
  else if (usagePct >= 70)                   warnings.push("LIMIT_WARNING");
  if (subscription.paidStatus === "OVERDUE") warnings.push("PAYMENT_OVERDUE");
  if (subscription.paidStatus === "UNPAID")  warnings.push("PAYMENT_UNPAID");
  if (warnings.length) res.set("X-Subscription-Warnings", warnings.join(","));

  next();
});
