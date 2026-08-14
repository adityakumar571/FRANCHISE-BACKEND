/**
 * checkStudentLimit.js
 *
 * Route-level middleware — enforces plan-based student enrollment cap.
 *
 * IMPORTANT: Does NOT increment usedStudents here.
 * The controller calls incrementStudentCount() only after a successful DB save,
 * so failed/errored requests never corrupt the count.
 *
 * Flow:
 *  1. Read req.subscription (set by subscriptionGuard)
 *  2. If totalStudentLimit === 0 → unlimited plan, pass through
 *  3. Do a live DB re-read to get fresh counts (avoids stale middleware data)
 *  4. If liveUsed >= liveLimit → 403 LIMIT_REACHED
 *  5. Attach req.subscriptionLimitInfo → call next()
 *
 * NOTE: 0 = unlimited is an explicit design choice.
 *       Plans with studentLimit > 0 enforce the cap.
 *       Plans with studentLimit = 0 are treated as unlimited.
 */

import TenantSubscription from "../models/TenantSubscription.modal.js";
import { apiResponse } from "../utils/apiResponse.js";

// ── Middleware ────────────────────────────────────────────────────────────────
export const checkStudentLimit = async (req, res, next) => {
    try {
        const subscription = req.subscription;

        // Guard: subscriptionGuard must run first and set req.subscription
        if (!subscription) {
            console.error("[checkStudentLimit] req.subscription is missing — subscriptionGuard did not run or was bypassed");
            return res.status(403).json(
                new apiResponse(403, null,
                    "No active subscription found. Cannot enroll student.")
            );
        }

        const limit = subscription.totalStudentLimit ?? 0;
        const used  = subscription.usedStudents ?? 0;

        console.log(`[checkStudentLimit] tenantId=${subscription.tenantId} | totalStudentLimit=${limit} | usedStudents=${used}`);

        // 0 = unlimited — always allow, but still pass subscriptionId
        // so incrementStudentCount() in the controller works correctly
        if (limit === 0) {
            console.log("[checkStudentLimit] UNLIMITED plan — allowing enrollment");
            req.subscriptionLimitInfo = {
                subscriptionId: subscription._id,
                limit:     0,
                used,
                remaining: "unlimited",
            };
            return next();
        }

        // Fresh live read — avoids stale cache / race condition under concurrent requests
        const fresh = await TenantSubscription
            .findById(subscription._id)
            .select("usedStudents totalStudentLimit")
            .lean();

        const liveUsed  = fresh?.usedStudents      ?? used;
        const liveLimit = fresh?.totalStudentLimit  ?? limit;

        console.log(`[checkStudentLimit] LIVE → liveUsed=${liveUsed} | liveLimit=${liveLimit}`);

        if (liveUsed >= liveLimit) {
            console.log(`[checkStudentLimit] BLOCKED — limit reached (${liveUsed}/${liveLimit})`);
            return res.status(403).json(
                new apiResponse(403, {
                    reason:            "LIMIT_REACHED",
                    totalStudentLimit: liveLimit,
                    usedStudents:      liveUsed,
                    remaining:         0,
                }, `Student enrollment limit reached (${liveUsed}/${liveLimit}). Upgrade your plan to enroll more students.`)
            );
        }

        console.log(`[checkStudentLimit] ALLOWED — remaining: ${liveLimit - liveUsed}`);
        req.subscriptionLimitInfo = {
            subscriptionId: subscription._id,
            limit:          liveLimit,
            used:           liveUsed,
            remaining:      liveLimit - liveUsed,
        };

        next();
    } catch (err) {
        console.error("[checkStudentLimit] error:", err.message);
        return res.status(500).json(
            new apiResponse(500, null, "Could not verify enrollment limit.")
        );
    }
};

// ── Helpers called by controllers ─────────────────────────────────────────────

/**
 * incrementStudentCount
 * Call AFTER a successful enrollment save in the controller.
 * Uses atomic $inc + $lt guard to prevent over-counting even under concurrency.
 *
 * @param {ObjectId} subscriptionId
 * @param {number}   limit  — 0 means unlimited (no $lt guard applied)
 */
export const incrementStudentCount = async (subscriptionId, limit) => {
    try {
        if (!subscriptionId) {
            console.warn("[incrementStudentCount] called without subscriptionId — skipped");
            return;
        }

        const filter = limit > 0
            ? { _id: subscriptionId, usedStudents: { $lt: limit } }
            : { _id: subscriptionId };

        const result = await TenantSubscription.updateOne(filter, { $inc: { usedStudents: 1 } });

        if (result.matchedCount === 0) {
            console.warn("[incrementStudentCount] no document matched — limit may already be reached");
        } else {
            console.log(`[incrementStudentCount] usedStudents incremented for subscription ${subscriptionId}`);
        }
    } catch (err) {
        console.error("[incrementStudentCount] error:", err.message);
    }
};

/**
 * decrementStudentLimit
 * Call AFTER a successful enrollment deletion in the controller.
 * Guards against going below zero.
 *
 * @param {ObjectId} tenantId
 */
export const decrementStudentLimit = async (tenantId) => {
    try {
        if (!tenantId) {
            console.warn("[decrementStudentLimit] called without tenantId — skipped");
            return;
        }

        const result = await TenantSubscription.updateOne(
            { tenantId, usedStudents: { $gt: 0 } },
            { $inc: { usedStudents: -1 } }
        );

        if (result.matchedCount === 0) {
            console.warn("[decrementStudentLimit] no document matched — usedStudents may already be 0");
        }
    } catch (err) {
        console.error("[decrementStudentLimit] error:", err.message);
    }
};
