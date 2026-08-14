/**
 * tenantSelfSubscriptionRoutes.js
 *
 * School LMS users (SuperAdmin / Admin) view their own school's subscription.
 * No main-admin JWT required — uses tenant DB JWT (LMS cookie).
 *
 * Mounted at: /api/my-subscription
 * EXEMPTED from subscriptionGuard so schools with NO_SUBSCRIPTION or
 * PENDING status can still reach this endpoint and see their state.
 */

import { Router } from "express";
import { verifyJWT, authorizeUserType } from "../middleware/authTypeMiddleware.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

const router = Router();

/* ──────────────────────────────────────────────────────────────────────────────
   GET /api/my-subscription
   Returns the calling school's full subscription details.
   Auth: tenant JWT  (SuperAdmin or Admin role)
   Frontend: SAAS-ADMIN-FRONTEND  →  src/views/subscriptions/subscriptions.jsx
────────────────────────────────────────────────────────────────────────────── */
router.get(
    "/",
    verifyJWT,
    authorizeUserType("SuperAdmin", "Admin"),
    asyncHandler(async (req, res) => {
        // req.tenant is set by tenantMiddleware from x-tenant-id header
        const tenantId = req.tenant?._id;

        if (!tenantId) {
            return res.status(400).json(
                new apiResponse(400, null, "Tenant context missing. Check x-tenant-id header.")
            );
        }

        // ── Fetch subscription ──────────────────────────────────────────────
        const subscription = await TenantSubscription.findOne({ tenantId }).lean();

        // No subscription yet — return graceful empty state (NOT an error)
        if (!subscription) {
            return res.status(200).json(
                new apiResponse(200, {
                    hasSubscription: false,
                    status:          "NO_SUBSCRIPTION",
                    message:         "No subscription assigned yet. Contact admin to activate.",
                }, "No subscription found")
            );
        }

        // ── Compute derived fields ──────────────────────────────────────────
        const now       = new Date();
        const endDate   = subscription.currentPlan?.endDate || null;
        const isExpired = endDate ? now > new Date(endDate) : false;
        const daysLeft  = endDate
            ? Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24)))
            : null;

        const totalLimit = subscription.totalStudentLimit || 0;
        const usedCount  = subscription.usedStudents || 0;
        const usagePct   = totalLimit > 0 ? Math.round((usedCount / totalLimit) * 100) : 0;

        const effectiveStatus = isExpired ? "EXPIRED" : subscription.status;

        // ── Auto-mark overdue installments (yearly plans only) ───────────────
        if (subscription.currentPlan?.billingCycle === "Yearly" &&
            Array.isArray(subscription.installments)) {

            let changed = false;
            subscription.installments.forEach((inst) => {
                if (inst.status === "PENDING" && inst.dueDate && new Date(inst.dueDate) < now) {
                    inst.status = "OVERDUE";
                    changed = true;
                }
            });

            if (changed) {
                // Fire-and-forget — don't block the response
                TenantSubscription.updateOne(
                    { _id: subscription._id },
                    { $set: { installments: subscription.installments } }
                ).catch((e) => console.error("[my-subscription] installment update failed:", e.message));
            }
        }

        // ── Build response ───────────────────────────────────────────────────
        return res.status(200).json(
            new apiResponse(200, {
                hasSubscription: true,
                _id:             subscription._id,
                status:          effectiveStatus,
                isTrial:         subscription.isTrial || false,

                currentPlan: {
                    planId:       subscription.currentPlan?.planId       || null,
                    name:         subscription.currentPlan?.name         || "—",
                    billingCycle: subscription.currentPlan?.billingCycle || "—",
                    price:        subscription.currentPlan?.price        || 0,
                    pricingModel: subscription.currentPlan?.pricingModel || "FIXED",
                    studentLimit: subscription.currentPlan?.studentLimit || 0,
                    startDate:    subscription.currentPlan?.startDate    || null,
                    endDate,
                    daysLeft,
                    isExpired,
                },

                usage: {
                    totalStudentLimit: totalLimit,
                    usedStudents:      usedCount,
                    remaining:         totalLimit > 0
                        ? Math.max(0, totalLimit - usedCount)
                        : "unlimited",
                    percentUsed: usagePct,
                },

                billing: {
                    paidStatus:   subscription.paidStatus   || "—",
                    paidDate:     subscription.paidDate     || null,
                    dueDate:      subscription.dueDate      || null,
                    paymentRef:   subscription.paymentRef   || null,
                    totalAmount:  subscription.totalAmount  || 0,
                    billingMonth: subscription.billingMonth || null,
                },

                addons: (subscription.currentAddons || []).map((a) => ({
                    addonId:      a.addonId,
                    name:         a.name,
                    price:        a.price,
                    studentLimit: a.studentLimit,
                    quantity:     a.quantity || 1,
                })),

                installments: (() => {
                    if (subscription.currentPlan?.billingCycle !== "Yearly") return null;
                    const insts = subscription.installments || [];
                    const paid    = insts.filter((i) => i.status === "PAID").length;
                    const pending = insts.filter((i) => i.status === "PENDING").length;
                    const overdue = insts.filter((i) => i.status === "OVERDUE").length;
                    const totalPaid = insts
                        .filter((i) => i.status === "PAID")
                        .reduce((s, i) => s + (i.amount || 0), 0);
                    return {
                        schedule: insts,
                        summary: {
                            paid,
                            pending,
                            overdue,
                            totalPaid,
                            remaining: (subscription.totalAmount || 0) - totalPaid,
                        },
                    };
                })(),

                history: (subscription.history || [])
                    .slice(-20)
                    .reverse()
                    .map((h) => ({
                        type:              h.type,
                        name:              h.name,
                        price:             h.price,
                        studentLimit:      h.studentLimit,
                        startDate:         h.startDate,
                        endDate:           h.endDate,
                        createdAt:         h.createdAt,
                        razorpayPaymentId: h.razorpayPaymentId || null,
                    })),

            }, "Subscription fetched successfully")
        );
    })
);

export default router;
