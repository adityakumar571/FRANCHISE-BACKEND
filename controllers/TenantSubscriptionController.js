import TenantSubscription from "./../models/TenantSubscription.modal.js";
import SubscriptionPlan from "./../models/subscription.modal.js";
import mongoose from "mongoose";
import crypto from "crypto";
import Razorpay from "razorpay";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

/* ─── helpers ─── */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * effectiveAddonPrice — plan aur addon ki billing cycle mismatch handle karo
 *
 * Logic:
 *  - Plan: Yearly,  Addon: Monthly  → addon price × 12  (school ek saal ke liye monthly addon pay karti hai)
 *  - Plan: Monthly, Addon: Yearly   → addon price ÷ 12  (monthly installment mein yearly addon ka 1/12 hissa)
 *  - Same cycle (both Monthly or both Yearly) → addon price as-is
 *  - billingCycle missing → Monthly assume karo (most addons Monthly hote hain)
 *
 * @param {number} addonPrice - addon ka unit price
 * @param {string} addonBillingCycle - "Monthly" | "Yearly" | undefined
 * @param {string} planBillingCycle  - "Monthly" | "Yearly"
 * @param {number} quantity
 * @returns {number} effective price for totalAmount calculation
 */
const effectiveAddonPrice = (addonPrice, addonBillingCycle, planBillingCycle, quantity = 1) => {
  const unitPrice   = (addonPrice || 0) * (quantity || 1);
  const addonCycle  = addonBillingCycle || "Monthly";  // default Monthly if not stored
  const planCycleN  = planBillingCycle  || "Monthly";
  if (addonCycle === planCycleN)                                  return unitPrice;  // same — no conversion
  if (planCycleN === "Yearly"  && addonCycle === "Monthly")       return unitPrice * 12;  // monthly addon on yearly plan
  if (planCycleN === "Monthly" && addonCycle === "Yearly")        return Math.round(unitPrice / 12);  // yearly addon on monthly plan
  return unitPrice;
};

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY || !process.env.RAZORPAY_SECRET)
    throw new Error("Razorpay keys missing in .env");
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret: process.env.RAZORPAY_SECRET,
  });
};

/* ─────────────────────────────────────────────
   ADMIN ASSIGN PLAN
   POST /api/subscription/admin-assign
   Body: { tenantId, planId, studentCount?, totalAmount?,
           paidStatus?, billingMonth?, dueDate?, paymentRef? }
───────────────────────────────────────────────── */
export const adminAssignPlan = asyncHandler(async (req, res) => {
  try {
  let {
    tenantId,
    planId,
    studentCount,
    totalAmount,
    paidStatus = "PENDING",
    billingMonth,
    dueDate,
    paymentRef,
  } = req.body;

  /* ── validation ── */
  if (!tenantId || !isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Valid tenantId required"));
  if (!planId || !isValidId(planId))
    return res.status(400).json(new apiResponse(400, null, "Valid planId required"));
  if (!["PAID", "UNPAID", "PENDING"].includes(paidStatus))
    return res.status(400).json(new apiResponse(400, null, "paidStatus must be PAID | UNPAID | PENDING"));

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) return res.status(404).json(new apiResponse(404, null, "Plan not found"));
  if (!plan.isActive) return res.status(400).json(new apiResponse(400, null, "Plan is inactive"));

  /* ── dates ── */
  const startDate = new Date();
  const endDate   = new Date();
  if (plan.billingCycle === "Yearly") endDate.setFullYear(endDate.getFullYear() + 1);
  else                                endDate.setMonth(endDate.getMonth() + 1);

  /* ── amounts ── */
  studentCount = studentCount != null ? Number(studentCount) : null;

  // Always use the plan's defined price and student limit
  const finalStudentLimit = plan.studentLimit;
  const finalAmount       = plan.price;

  // ── Fetch existing subscription to preserve addons ──────────────────────────
  // PEHLE addons fetch karo taaki installments mein bhi addon price reflect ho
  const existingSubscription = await TenantSubscription.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
  }).lean();

  const preservedAddons = existingSubscription?.currentAddons || [];

  const addonStudentLimit = preservedAddons.reduce(
    (sum, a) => sum + (a.studentLimit || 0) * (a.quantity || 1),
    0
  );

  // Existing addons ka price bhi totalAmount mein add karo
  // IMPORTANT: addon ki billingCycle vs plan ki billingCycle mismatch handle karo
  const addonTotalPrice = preservedAddons.reduce(
    (sum, a) => sum + effectiveAddonPrice(a.price, a.billingCycle, plan.billingCycle, a.quantity || 1),
    0
  );

  // totalStudentLimit = base plan limit + all existing addons
  const finalTotalStudentLimit = finalStudentLimit + addonStudentLimit;

  // totalAmount = base plan price + existing addons price
  const finalTotalAmount = finalAmount + addonTotalPrice;

  /* ── yearly: 12 installments ── */
  // NOTE: finalTotalAmount use karo (base plan + addons) taaki installments mein
  // addon price bhi reflect ho
  let installments = [];
  if (plan.billingCycle === "Yearly" && finalTotalAmount > 0) {
    const monthlyAmt  = Math.round(finalTotalAmount / 12);
    const startMonth  = billingMonth
      ? new Date(billingMonth + "-01")
      : new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    // Agar paidStatus === "PAID" toh sab installments bhi PAID mark karo
    // (school ne pura saal ka ek baar mein de diya)
    const instStatus = paidStatus === "PAID" ? "PAID" : "PENDING";
    const instPaidDate = paidStatus === "PAID" ? new Date() : undefined;

    for (let i = 0; i < 12; i++) {
      const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      const ym  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const due = new Date(d.getFullYear(), d.getMonth(), 7);
      const inst = {
        installmentNo: i + 1,
        billingMonth:  ym,
        dueDate:       due,
        amount:        i === 11 ? finalTotalAmount - monthlyAmt * 11 : monthlyAmt,
        status:        instStatus,
      };
      if (instPaidDate) inst.paidDate = instPaidDate;
      installments.push(inst);
    }
  }

  const updatePayload = {
    currentPlan: {
      planId:       plan._id,
      name:         plan.name,
      price:        finalAmount,
      studentLimit: finalStudentLimit,
      billingCycle: plan.billingCycle,
      startDate,
      endDate,
    },
    totalStudentLimit: finalTotalStudentLimit,  // base + addons
    totalAmount:       finalTotalAmount,         // base price + addons price
    status:            "ACTIVE",
    paidStatus,
    billingMonth:      billingMonth  || null,
    dueDate:           dueDate       ? new Date(dueDate) : null,
    paymentRef:        paymentRef    || null,
    installments,
    isTrial:           false,
  };

  if (paidStatus === "PAID") updatePayload.paidDate = new Date();

  const subscription = await TenantSubscription.findOneAndUpdate(
    { tenantId: new mongoose.Types.ObjectId(tenantId) },
    {
      $set:  updatePayload,
      $push: {
        history: {
          type:         "PLAN_PURCHASE",
          planId:       plan._id,
          name:         plan.name,
          price:        finalAmount,
          studentLimit: finalStudentLimit,
          startDate,
          endDate,
        },
      },
    },
    { upsert: true, new: true }
  );

  return res.status(200).json(new apiResponse(200, subscription, "Subscription assigned successfully"));
  } catch (err) {
    console.error("❌ adminAssignPlan ERROR:", err?.message);
    console.error("❌ adminAssignPlan STACK:", err?.stack);
    return res.status(500).json(new apiResponse(500, null, err?.message || "Internal error"));
  }
});

/* ─────────────────────────────────────────────
   MARK SUBSCRIPTION PAID
   PATCH /api/subscription/:id/mark-paid
───────────────────────────────────────────────── */
export const markSubscriptionPaid = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paidDate, paymentRef } = req.body;

  if (!isValidId(id))
    return res.status(400).json(new apiResponse(400, null, "Invalid subscription ID"));

  const subscription = await TenantSubscription.findById(id);
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "Subscription not found"));

  subscription.paidStatus = "PAID";
  subscription.paidDate   = paidDate ? new Date(paidDate) : new Date();
  if (paymentRef) subscription.paymentRef = paymentRef;
  await subscription.save();

  return res.status(200).json(new apiResponse(200, subscription, "Marked as paid"));
});

/* ─────────────────────────────────────────────
   GET ALL SUBSCRIPTIONS (paginated + filtered)
   GET /api/subscription
   Query: tenantId, status, paidStatus, billingCycle,
          planType, search, page, limit, isPagination
───────────────────────────────────────────────── */
export const getSubscription = asyncHandler(async (req, res) => {
  const {
    tenantId,
    page         = 1,
    limit        = 10,
    isPagination = "true",
    status,
    billingCycle,
    planType,
    paidStatus,
    search       = "",
  } = req.query;

  const match = {};

  if (tenantId && isValidId(tenantId))
    match.tenantId = new mongoose.Types.ObjectId(tenantId);

  if (status)     match.status     = status;
  if (paidStatus) match.paidStatus = paidStatus;

  /* search on plan name */
  if (search.trim()) {
    match["currentPlan.name"] = { $regex: search.trim(), $options: "i" };
  }

  const pipeline = [
    { $match: match },

    /* tenant lookup */
    {
      $lookup: {
        from:         "tenants",
        localField:   "tenantId",
        foreignField: "_id",
        as:           "tenantDetails",
      },
    },
    { $unwind: { path: "$tenantDetails", preserveNullAndEmptyArrays: true } },

    /* plan lookup */
    {
      $lookup: {
        from:         "subscriptionplans",
        localField:   "currentPlan.planId",
        foreignField: "_id",
        as:           "planDetails",
      },
    },
    { $unwind: { path: "$planDetails", preserveNullAndEmptyArrays: true } },

    /* addons lookup */
    {
      $lookup: {
        from:         "subscriptionplans",
        localField:   "currentAddons.addonId",
        foreignField: "_id",
        as:           "addonDetails",
      },
    },

    {
      $addFields: {
        currentPlanDetails:   "$planDetails",
        currentAddonsDetails: "$addonDetails",
      },
    },
  ];

  /* post-lookup filters */
  const postMatch = {};
  if (billingCycle) postMatch["currentPlanDetails.billingCycle"] = billingCycle;
  if (planType)     postMatch["currentPlanDetails.planType"]     = planType;
  if (Object.keys(postMatch).length) pipeline.push({ $match: postMatch });

  /* school name search (post-lookup) */
  if (search.trim()) {
    pipeline.push({
      $match: {
        $or: [
          { "currentPlan.name":        { $regex: search.trim(), $options: "i" } },
          { "tenantDetails.schoolName":{ $regex: search.trim(), $options: "i" } },
        ],
      },
    });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  /* count */
  const countResult = await TenantSubscription.aggregate([...pipeline, { $count: "count" }]);
  const total       = countResult[0]?.count || 0;

  /* paginate */
  if (isPagination === "true") {
    pipeline.push(
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) }
    );
  }

  const subscriptions = await TenantSubscription.aggregate(pipeline);

  return res.status(200).json(
    new apiResponse(200, {
      subscriptions,
      total,
      totalPages:  isPagination === "true" ? Math.ceil(total / Number(limit)) : 1,
      currentPage: isPagination === "true" ? Number(page) : null,
    }, "Subscriptions fetched")
  );
});

/* ─────────────────────────────────────────────
   GET INSTALLMENTS
   GET /api/subscription/:tenantId/installments
───────────────────────────────────────────────── */
export const getInstallments = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "Subscription not found"));

  if (subscription.currentPlan?.billingCycle !== "Yearly") {
    return res.status(200).json(
      new apiResponse(200, { installments: [], billingCycle: subscription.currentPlan?.billingCycle }, "Not a yearly plan")
    );
  }

  /* auto-mark overdue */
  const now     = new Date();
  let   changed = false;
  subscription.installments.forEach((inst) => {
    if (inst.status === "PENDING" && inst.dueDate && new Date(inst.dueDate) < now) {
      inst.status = "OVERDUE";
      changed     = true;
    }
  });
  if (changed) await subscription.save();

  const paid            = subscription.installments.filter((i) => i.status === "PAID").length;
  const pending         = subscription.installments.filter((i) => i.status === "PENDING").length;
  const overdue         = subscription.installments.filter((i) => i.status === "OVERDUE").length;
  const totalPaidAmount = subscription.installments
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + (i.amount || 0), 0);

  return res.status(200).json(
    new apiResponse(200, {
      tenantId,
      billingCycle:  subscription.currentPlan?.billingCycle,
      planName:      subscription.currentPlan?.name,
      totalAmount:   subscription.totalAmount,
      startDate:     subscription.currentPlan?.startDate,
      endDate:       subscription.currentPlan?.endDate,
      installments:  subscription.installments,
      summary: {
        paid, pending, overdue, totalPaidAmount,
        remaining: subscription.totalAmount - totalPaidAmount,
      },
    }, "Installments fetched")
  );
});

/* ─────────────────────────────────────────────
   MARK INSTALLMENT PAID
   PATCH /api/subscription/:tenantId/installments/:installmentNo/mark-paid
───────────────────────────────────────────────── */
export const markInstallmentPaid = asyncHandler(async (req, res) => {
  const { tenantId, installmentNo } = req.params;
  const { paidDate, paymentRef, remarks } = req.body;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "Subscription not found"));

  const idx = subscription.installments.findIndex(
    (i) => i.installmentNo === Number(installmentNo)
  );
  if (idx === -1)
    return res.status(404).json(new apiResponse(404, null, `Installment #${installmentNo} not found`));

  const inst = subscription.installments[idx];
  if (inst.status === "PAID")
    return res.status(400).json(new apiResponse(400, null, "Already paid"));

  inst.status   = "PAID";
  inst.paidDate = paidDate ? new Date(paidDate) : new Date();
  if (paymentRef) inst.paymentRef = paymentRef;
  if (remarks)    inst.remarks    = remarks;

  await subscription.save();

  return res.status(200).json(
    new apiResponse(200, subscription.installments[idx], `Installment #${installmentNo} marked as paid`)
  );
});

/* ─────────────────────────────────────────────
   MARK INSTALLMENT OVERDUE
   PATCH /api/subscription/:tenantId/installments/:installmentNo/mark-overdue
───────────────────────────────────────────────── */
export const markInstallmentOverdue = asyncHandler(async (req, res) => {
  const { tenantId, installmentNo } = req.params;

  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "Subscription not found"));

  const inst = subscription.installments.find(
    (i) => i.installmentNo === Number(installmentNo)
  );
  if (!inst)    return res.status(404).json(new apiResponse(404, null, "Installment not found"));
  if (inst.status === "PAID")
    return res.status(400).json(new apiResponse(400, null, "Cannot mark paid installment as overdue"));

  inst.status = "OVERDUE";
  await subscription.save();

  return res.status(200).json(new apiResponse(200, inst, "Marked overdue"));
});

/* ─────────────────────────────────────────────
   LEGACY — Razorpay (tenant portal self-service)
   These are kept for the website onboarding flow
───────────────────────────────────────────────── */
export const createOrder = asyncHandler(async (req, res) => {
  const { planId, tenantId } = req.body;
  if (!planId || !tenantId)
    return res.status(400).json(new apiResponse(400, null, "planId & tenantId required"));

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) return res.status(404).json(new apiResponse(404, null, "Plan not found"));

  const razorpay = getRazorpayInstance();
  const order    = await razorpay.orders.create({
    amount:   plan.price * 100,
    currency: "INR",
    receipt:  `rcpt_${Date.now()}`,
  });

  await TenantSubscription.findOneAndUpdate(
    { tenantId },
    { $set: { pendingOrder: { orderId: order.id, planId } } },
    { upsert: true }
  );

  return res.status(200).json(
    new apiResponse(200, { orderId: order.id, amount: order.amount, currency: order.currency, plan }, "Order created")
  );
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, tenantId } = req.body;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature)
    return res.status(400).json(new apiResponse(400, null, "Payment verification failed"));

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) return res.status(404).json(new apiResponse(404, null, "Plan not found"));

  const startDate = new Date();
  const endDate   = new Date();
  if (plan.billingCycle === "Monthly") endDate.setMonth(endDate.getMonth() + 1);
  else                                 endDate.setFullYear(endDate.getFullYear() + 1);

  const subscription = await TenantSubscription.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        currentPlan: {
          planId: plan._id, name: plan.name, price: plan.price,
          pricingModel: plan.pricingModel || "FIXED",
          studentLimit: plan.studentLimit, billingCycle: plan.billingCycle,
          startDate, endDate,
        },
        totalStudentLimit: plan.studentLimit,
        totalAmount:       plan.price,
        status:            "ACTIVE",
        paidStatus:        "PAID",
        paidDate:          new Date(),
        isTrial:           false,
      },
      $push: {
        history: {
          type: "PLAN_PURCHASE", planId: plan._id, name: plan.name,
          price: plan.price, studentLimit: plan.studentLimit, startDate, endDate,
          razorpayPaymentId: razorpay_payment_id,
        },
      },
    },
    { upsert: true, new: true }
  );

  return res.status(200).json(
    new apiResponse(200, { subscription, razorpay_payment_id }, "Payment verified & subscription activated")
  );
});

/* ─────────────────────────────────────────────
   UPGRADE PLAN
   POST /api/subscription/:tenantId/upgrade
   Body: { planId, studentCount?, totalAmount?, paidStatus?, paymentRef? }
   - Saves current plan to history as PLAN_UPGRADE
   - Replaces currentPlan with new plan
   - Re-generates yearly installments if applicable
───────────────────────────────────────────────── */
export const upgradePlan = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  let {
    planId,
    studentCount,
    totalAmount,
    paidStatus = "PENDING",
    paymentRef,
  } = req.body;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));
  if (!planId || !isValidId(planId))
    return res.status(400).json(new apiResponse(400, null, "Valid planId required"));

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) return res.status(404).json(new apiResponse(404, null, "Plan not found"));
  if (!plan.isActive) return res.status(400).json(new apiResponse(400, null, "Plan is inactive"));

  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "No subscription found for this tenant"));

  const startDate = new Date();
  const endDate   = new Date();
  if (plan.billingCycle === "Yearly") endDate.setFullYear(endDate.getFullYear() + 1);
  else                                endDate.setMonth(endDate.getMonth() + 1);

  studentCount        = studentCount != null ? Number(studentCount) : null;

  // FIXED → always use plan's defined limit; PER_STUDENT → use committed student count
  const finalLimit =
    plan.pricingModel === "PER_STUDENT"
      ? (studentCount && studentCount > 0 ? studentCount : plan.studentLimit)
      : plan.studentLimit;

  // FIXED → always use plan.price; PER_STUDENT → use calculated totalAmount from frontend
  const finalAmount =
    plan.pricingModel === "PER_STUDENT"
      ? (totalAmount != null && totalAmount >= 0 ? Number(totalAmount) : plan.price)
      : plan.price;

  // Existing addons ka price bhi new totalAmount mein add karo
  // IMPORTANT: billing cycle mismatch handle karo
  const addonStudentLimit = (subscription.currentAddons || []).reduce(
    (sum, a) => sum + (a.studentLimit || 0) * (a.quantity || 1),
    0
  );
  const addonTotalPrice = (subscription.currentAddons || []).reduce(
    (sum, a) => sum + effectiveAddonPrice(a.price, a.billingCycle, plan.billingCycle, a.quantity || 1),
    0
  );
  const finalTotalAmount = finalAmount + addonTotalPrice;

  /* ── yearly installments ── */
  // NOTE: finalTotalAmount use karo (base plan + addons) taaki installments mein addon price bhi reflect ho
  let installments = [];
  if (plan.billingCycle === "Yearly" && finalTotalAmount > 0) {
    const monthlyAmt = Math.round(finalTotalAmount / 12);
    const base       = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    const instStatus   = paidStatus === "PAID" ? "PAID" : "PENDING";
    const instPaidDate = paidStatus === "PAID" ? new Date() : undefined;

    for (let i = 0; i < 12; i++) {
      const d   = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const ym  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const due = new Date(d.getFullYear(), d.getMonth(), 7);
      const inst = {
        installmentNo: i + 1,
        billingMonth:  ym,
        dueDate:       due,
        amount:        i === 11 ? finalTotalAmount - monthlyAmt * 11 : monthlyAmt,
        status:        instStatus,
      };
      if (instPaidDate) inst.paidDate = instPaidDate;
      installments.push(inst);
    }
  }

  subscription.history.push({
    type:         "PLAN_UPGRADE",
    planId:       plan._id,
    name:         plan.name,
    price:        finalAmount,
    studentLimit: finalLimit,
    startDate,
    endDate,
  });

  subscription.currentPlan = {
    planId:       plan._id,
    name:         plan.name,
    price:        finalAmount,
    pricingModel: plan.pricingModel || "FIXED",
    studentLimit: finalLimit,          // base plan limit only
    billingCycle: plan.billingCycle,
    startDate,
    endDate,
  };

  // Recalculate totalStudentLimit = new plan base limit + existing addons
  // This preserves addons the school already purchased during an upgrade
  subscription.totalStudentLimit = finalLimit + addonStudentLimit;
  subscription.totalAmount       = finalTotalAmount;  // base + addons
  subscription.status            = "ACTIVE";
  subscription.paidStatus        = paidStatus;
  subscription.installments      = installments;
  subscription.isTrial           = false;
  if (paidStatus === "PAID") {
    subscription.paidDate  = new Date();
    subscription.paymentRef = paymentRef || null;
  }

  await subscription.save();

  return res.status(200).json(new apiResponse(200, subscription, "Plan upgraded successfully"));
});

/* ─────────────────────────────────────────────
   ADD ADDON
   POST /api/subscription/:tenantId/addon
   Body: { addonId, quantity? }
───────────────────────────────────────────────── */
export const addAddon = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { addonId, quantity = 1 } = req.body;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));
  if (!addonId || !isValidId(addonId))
    return res.status(400).json(new apiResponse(400, null, "Valid addonId required"));

  const addon = await SubscriptionPlan.findById(addonId);
  if (!addon)          return res.status(404).json(new apiResponse(404, null, "Addon plan not found"));
  if (!addon.isActive) return res.status(400).json(new apiResponse(400, null, "Addon is inactive"));
  if (addon.planType !== "Addon")
    return res.status(400).json(new apiResponse(400, null, "Provided plan is not an Addon type"));

  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "No subscription found for this tenant"));

  /* check if addon already exists — update quantity */
  const existing = subscription.currentAddons.find(
    (a) => a.addonId.toString() === addonId
  );
  if (existing) {
    existing.quantity = (existing.quantity || 1) + Number(quantity);
  } else {
    subscription.currentAddons.push({
      addonId:      addon._id,
      name:         addon.name,
      price:        addon.price,
      studentLimit: addon.studentLimit,
      billingCycle: addon.billingCycle || "Monthly",  // ← addon ki cycle save karo
      quantity:     Number(quantity),
    });
  }

  /* recalculate totalStudentLimit */
  const addonStudentLimit = subscription.currentAddons.reduce(
    (sum, a) => sum + (a.studentLimit || 0) * (a.quantity || 1),
    0
  );
  subscription.totalStudentLimit =
    (subscription.currentPlan?.studentLimit || 0) + addonStudentLimit;

  /* recalculate totalAmount = base plan price + effective addon prices
     IMPORTANT: billing cycle mismatch handle karo
     Monthly addon on Yearly plan → price × 12
     Yearly addon on Monthly plan → price ÷ 12
  */
  const planCycle = subscription.currentPlan?.billingCycle || "Monthly";
  const addonTotalPrice = subscription.currentAddons.reduce(
    (sum, a) => sum + effectiveAddonPrice(a.price, a.billingCycle, planCycle, a.quantity || 1),
    0
  );
  subscription.totalAmount = (subscription.currentPlan?.price || 0) + addonTotalPrice;

  /* ── Yearly plan ke liye installments recalculate karo ──────────────────────
     Addon add hone ke baad naye totalAmount se pending installments update karo.
     Paid installments unchanged rehte hain — sirf PENDING/OVERDUE update hogi.
  ─────────────────────────────────────────────────────────────────────────── */
  if (subscription.currentPlan?.billingCycle === "Yearly" && subscription.installments?.length) {
    const newTotalAmount   = subscription.totalAmount;
    const unpaidCount      = subscription.installments.filter((i) => i.status !== "PAID").length;
    const paidTotal        = subscription.installments
      .filter((i) => i.status === "PAID")
      .reduce((s, i) => s + (i.amount || 0), 0);
    const remainingAmount  = Math.max(0, newTotalAmount - paidTotal);

    if (unpaidCount > 0) {
      const newMonthlyAmt = Math.round(remainingAmount / unpaidCount);
      let distributed     = 0;
      const unpaidInsts   = subscription.installments.filter((i) => i.status !== "PAID");

      unpaidInsts.forEach((inst, idx) => {
        if (idx === unpaidInsts.length - 1) {
          // Last unpaid installment mein rounding difference dal do
          inst.amount = remainingAmount - distributed;
        } else {
          inst.amount = newMonthlyAmt;
          distributed += newMonthlyAmt;
        }
      });
    }
  }

  subscription.history.push({
    type:         "ADDON_PURCHASE",
    planId:       addon._id,
    name:         addon.name,
    price:        addon.price * Number(quantity),
    studentLimit: addon.studentLimit * Number(quantity),
    quantity:     Number(quantity),
  });

  await subscription.save();

  return res.status(200).json(
    new apiResponse(200, {
      currentAddons:     subscription.currentAddons,
      totalStudentLimit: subscription.totalStudentLimit,
      totalAmount:       subscription.totalAmount,
    }, "Addon added successfully")
  );
});

/* ─────────────────────────────────────────────
   REMOVE ADDON
   DELETE /api/subscription/:tenantId/addon/:addonId
───────────────────────────────────────────────── */
export const removeAddon = asyncHandler(async (req, res) => {
  const { tenantId, addonId } = req.params;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "Subscription not found"));

  const before = subscription.currentAddons.length;
  subscription.currentAddons = subscription.currentAddons.filter(
    (a) => a.addonId.toString() !== addonId
  );

  if (subscription.currentAddons.length === before)
    return res.status(404).json(new apiResponse(404, null, "Addon not found in current subscription"));

  /* recalculate totalStudentLimit */
  const addonStudentLimitAfter = subscription.currentAddons.reduce(
    (sum, a) => sum + (a.studentLimit || 0) * (a.quantity || 1),
    0
  );
  subscription.totalStudentLimit =
    (subscription.currentPlan?.studentLimit || 0) + addonStudentLimitAfter;

  /* recalculate totalAmount = base plan price + remaining addon prices
     IMPORTANT: billing cycle mismatch handle karo */
  const planCycleAfter = subscription.currentPlan?.billingCycle || "Monthly";
  const addonTotalPriceAfter = subscription.currentAddons.reduce(
    (sum, a) => sum + effectiveAddonPrice(a.price, a.billingCycle, planCycleAfter, a.quantity || 1),
    0
  );
  subscription.totalAmount = (subscription.currentPlan?.price || 0) + addonTotalPriceAfter;

  /* ── Yearly plan ke liye installments recalculate karo ──────────────────────
     Addon remove hone ke baad remaining unpaid installments update karo
  ─────────────────────────────────────────────────────────────────────────── */
  if (subscription.currentPlan?.billingCycle === "Yearly" && subscription.installments?.length) {
    const newTotalAmount  = subscription.totalAmount;
    const paidTotal       = subscription.installments
      .filter((i) => i.status === "PAID")
      .reduce((s, i) => s + (i.amount || 0), 0);
    const remainingAmount = Math.max(0, newTotalAmount - paidTotal);
    const unpaidInsts     = subscription.installments.filter((i) => i.status !== "PAID");

    if (unpaidInsts.length > 0) {
      const newMonthlyAmt = Math.round(remainingAmount / unpaidInsts.length);
      let distributed     = 0;
      unpaidInsts.forEach((inst, idx) => {
        if (idx === unpaidInsts.length - 1) {
          inst.amount = remainingAmount - distributed;
        } else {
          inst.amount = newMonthlyAmt;
          distributed += newMonthlyAmt;
        }
      });
    }
  }

  await subscription.save();

  return res.status(200).json(
    new apiResponse(200, {
      currentAddons:     subscription.currentAddons,
      totalStudentLimit: subscription.totalStudentLimit,
      totalAmount:       subscription.totalAmount,
    }, "Addon removed successfully")
  );
});

/* ─────────────────────────────────────────────
   CANCEL SUBSCRIPTION
   PATCH /api/subscription/:tenantId/cancel
───────────────────────────────────────────────── */
export const cancelSubscription = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { reason } = req.body;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "Subscription not found"));

  if (subscription.status === "CANCELLED")
    return res.status(400).json(new apiResponse(400, null, "Already cancelled"));

  subscription.status = "CANCELLED";
  if (reason) subscription.history.push({
    type:      "PLAN_PURCHASE",   // closest enum match — records the event
    name:      `CANCELLED: ${reason}`,
    price:     0,
    createdAt: new Date(),
  });

  await subscription.save();

  return res.status(200).json(new apiResponse(200, null, "Subscription cancelled"));
});

/* ─────────────────────────────────────────────
   SYNC USED STUDENTS (admin utility)
   POST /api/subscription/:tenantId/sync-students
   Counts actual enrolled students in the tenant DB and syncs usedStudents.
   Useful for correcting count drift.
───────────────────────────────────────────────── */
export const syncUsedStudents = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  /* We need the tenant's DB connection to count students */
  /* The admin request goes through tenantMiddleware — but for this
     admin-only route, we accept an optional ?dbUri param OR rely on
     the tenant model to look it up */
  const Tenant = (await import("../models/tenant.model.js")).default;
  const { getTenantDB } = await import("../utils/dbManager.js");

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return res.status(404).json(new apiResponse(404, null, "Tenant not found"));

  const db = await getTenantDB(tenant.dbUri);
  const { getStudentEnrolmentModel } = await import("../models/tenant/student/StudentEnrolment.model.js");
  const StudentEnrolment = getStudentEnrolmentModel(db);

  const count = await StudentEnrolment.countDocuments({ status: { $ne: "Left" } });

  const subscription = await TenantSubscription.findOneAndUpdate(
    { tenantId },
    { $set: { usedStudents: count } },
    { new: true }
  );

  if (!subscription)
    return res.status(404).json(new apiResponse(404, null, "No subscription found for this tenant"));

  return res.status(200).json(
    new apiResponse(200, {
      usedStudents:      count,
      totalStudentLimit: subscription.totalStudentLimit,
      remaining:         subscription.totalStudentLimit === 0
        ? "unlimited"
        : Math.max(0, subscription.totalStudentLimit - count),
    }, "usedStudents synced successfully")
  );
});

/* ─────────────────────────────────────────────
   PORTAL — GET MY SUBSCRIPTION
   GET /api/subscription/portal/my-subscription
   Auth: verifyPortalJWT  (req.tenantId set by portal middleware)

   Returns full subscription info for the school's portal:
   - Current plan name, status, usage, days left
   - Installments (if yearly)
   - Last 20 history events
   - All available plans (for upgrade prompt)
───────────────────────────────────────────────── */
export const getPortalSubscription = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;  // set by verifyPortalJWT

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid portal session"));

  const subscription = await TenantSubscription.findOne({ tenantId })
    .populate("currentPlan.planId", "name description features billingCycle price pricingModel");

  if (!subscription) {
    return res.status(200).json(
      new apiResponse(200, {
        hasSubscription: false,
        message: "No subscription assigned yet. Please contact admin.",
      }, "No subscription found")
    );
  }

  const now         = new Date();
  const endDate     = subscription.currentPlan?.endDate;
  const trialEnd    = subscription.trialEndDate;
  const isExpired   = endDate ? now > new Date(endDate) : false;
  const daysLeft    = endDate
    ? Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24)))
    : null;
  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((new Date(trialEnd) - now) / (1000 * 60 * 60 * 24)))
    : null;

  /* auto-mark overdue installments */
  if (subscription.currentPlan?.billingCycle === "Yearly") {
    let changed = false;
    subscription.installments.forEach((inst) => {
      if (inst.status === "PENDING" && inst.dueDate && new Date(inst.dueDate) < now) {
        inst.status = "OVERDUE";
        changed     = true;
      }
    });
    if (changed) await subscription.save();
  }

  /* installments summary */
  const paidInstallments    = subscription.installments.filter((i) => i.status === "PAID").length;
  const pendingInstallments = subscription.installments.filter((i) => i.status === "PENDING").length;
  const overdueInstallments = subscription.installments.filter((i) => i.status === "OVERDUE").length;
  const totalPaidAmount     = subscription.installments
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + (i.amount || 0), 0);

  /* available plans for upgrade (higher studentLimit or different cycle) */
  const availablePlans = await SubscriptionPlan.find({ isActive: true, planType: "Plan" })
    .sort({ sortOrder: 1, price: 1 })
    .select("name description price pricingModel pricePerStudent billingCycle studentLimit features isPopular yearlyDiscountPercent");

  const availableAddons = await SubscriptionPlan.find({ isActive: true, planType: "Addon" })
    .sort({ sortOrder: 1 })
    .select("name description price studentLimit features");

  return res.status(200).json(
    new apiResponse(200, {
      hasSubscription: true,
      status:          isExpired ? "EXPIRED" : subscription.status,
      isTrial:         subscription.isTrial,

      currentPlan: {
        name:          subscription.currentPlan?.name             || "—",
        billingCycle:  subscription.currentPlan?.billingCycle     || "—",
        price:         subscription.currentPlan?.price            || 0,
        pricingModel:  subscription.currentPlan?.pricingModel     || "FIXED",
        startDate:     subscription.currentPlan?.startDate        || null,
        endDate:       subscription.currentPlan?.endDate          || null,
        daysLeft,
        trialEndDate:  subscription.trialEndDate                  || null,
        trialDaysLeft,
        isExpired,
        description:   subscription.currentPlan?.planId?.description || null,
        features:      subscription.currentPlan?.planId?.features    || [],
      },

      usage: {
        totalStudentLimit: subscription.totalStudentLimit,
        usedStudents:      subscription.usedStudents,
        remaining:         subscription.totalStudentLimit === 0
          ? "unlimited"
          : Math.max(0, subscription.totalStudentLimit - subscription.usedStudents),
        percentUsed: subscription.totalStudentLimit > 0
          ? Math.round((subscription.usedStudents / subscription.totalStudentLimit) * 100)
          : 0,
      },

      addons: (subscription.currentAddons || []).map((a) => ({
        addonId:      a.addonId,
        name:         a.name,
        price:        a.price,
        studentLimit: a.studentLimit,
        quantity:     a.quantity,
      })),

      billing: {
        paidStatus:  subscription.paidStatus,
        paidDate:    subscription.paidDate    || null,
        dueDate:     subscription.dueDate     || null,
        paymentRef:  subscription.paymentRef  || null,
        billingMonth: subscription.billingMonth || null,
        totalAmount: subscription.totalAmount,
      },

      installments: subscription.currentPlan?.billingCycle === "Yearly"
        ? {
            schedule:        subscription.installments,
            summary: {
              paid:          paidInstallments,
              pending:       pendingInstallments,
              overdue:       overdueInstallments,
              totalPaid:     totalPaidAmount,
              remaining:     subscription.totalAmount - totalPaidAmount,
            },
          }
        : null,

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
          razorpayPaymentId: h.razorpayPaymentId || null,
          createdAt:         h.createdAt,
        })),

      availablePlans,
      availableAddons,
    }, "Subscription details fetched")
  );
});

/* ─────────────────────────────────────────────
   FIX TRIAL LIMITS (admin one-time utility)
   PATCH /api/subscription/fix-trial-limits
   Sabhi existing TRIAL subscriptions jinki
   totalStudentLimit = 0 hai unhe 350 pe set karo.
───────────────────────────────────────────────── */
export const fixTrialLimits = asyncHandler(async (req, res) => {
  const LIMIT = Number(req.body?.limit) || 350;

  // Fix ALL subscriptions (TRIAL or already EXPIRED trial) where studentLimit is 0
  const result = await TenantSubscription.updateMany(
    {
      isTrial:           true,        // only trial subscriptions
      totalStudentLimit: 0,           // only those with 0 (unlimited) limit
    },
    {
      $set: {
        totalStudentLimit:           LIMIT,
        "currentPlan.studentLimit":  LIMIT,
      },
    }
  );

  return res.status(200).json(
    new apiResponse(200, {
      matched:  result.matchedCount,
      modified: result.modifiedCount,
      limit:    LIMIT,
    }, `${result.modifiedCount} trial subscription(s) updated to ${LIMIT} student limit.`)
  );
});
