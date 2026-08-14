import mongoose from "mongoose";
import SessionBill from "../models/SessionBill.model.js";
import BillingConfig from "../models/BillingConfig.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import Tenant from "../models/tenant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ─── MONTH NAMES ─── */
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

/* ─────────────────────────────────────────────────────────────────
   HELPER: Active BillingConfig
───────────────────────────────────────────────────────────────── */
const getActiveConfig = async () => {
  let cfg = await BillingConfig.findOne({ isActive: true });
  if (!cfg) {
    cfg = await BillingConfig.create({
      baseStudentLimit: 350, basePrice: 1200,
      addonSlotSize: 50, addonSlotPrice: 100, isActive: true,
    });
  }
  return cfg;
};

/* ─────────────────────────────────────────────────────────────────
   HELPER: Calculate monthly amount from student count + config
───────────────────────────────────────────────────────────────── */
const calcMonthlyAmount = (studentCount, cfg) => {
  const { baseStudentLimit, basePrice, addonSlotSize, addonSlotPrice } = cfg;
  const base = basePrice;
  let addon = 0;
  if (studentCount > baseStudentLimit) {
    const extra = studentCount - baseStudentLimit;
    addon = Math.ceil(extra / addonSlotSize) * addonSlotPrice;
  }
  return { monthlyAmount: base + addon, baseAmount: base, addonAmount: addon };
};

/* ─────────────────────────────────────────────────────────────────
   HELPER: Generate receipt number
   Format: RCPT-<tenantId_last6>-<sessionYear>-<counter>
───────────────────────────────────────────────────────────────── */
const genReceiptNo = (tenantId, sessionYear, counter) => {
  const tid = tenantId.toString().slice(-6).toUpperCase();
  const sy  = sessionYear.replace("-", "");
  return `RCPT-${tid}-${sy}-${String(counter).padStart(4, "0")}`;
};

/* ─────────────────────────────────────────────────────────────────
   HELPER: Recalculate totals from monthlyDues
───────────────────────────────────────────────────────────────── */
const recalcTotals = (bill) => {
  bill.totalPaid = bill.receipts.reduce((s, r) => s + (r.totalPaidAmount || 0), 0);
  bill.totalDue  = Math.max(0, bill.totalSessionAmount - bill.totalPaid);

  // ── Step 1: overall status determine karo ──
  if (bill.totalPaid >= bill.totalSessionAmount) {
    // Fully paid → sab months PAID mark karo
    bill.status = "FULLY_PAID";
    bill.monthlyDues.forEach((d) => { if (d.status !== "PAID") d.status = "PAID"; });
  } else {
    // ── Step 2: overdue months check (sirf FULLY_PAID nahi hai toh) ──
    const now = new Date();
    let overdueCount = 0;
    bill.monthlyDues.forEach((d) => {
      if (d.status !== "PAID" && new Date(d.dueDate) < now) {
        d.status = "OVERDUE";
        overdueCount++;
      }
    });

    bill.status = overdueCount > 0 ? "OVERDUE" : "ACTIVE";

    // ── Step 3: restrictions — sirf tab jab overdue months threshold se zyada ho ──
    const threshold = bill.overdueRestrictionMonths || 2;
    bill.restrictNewAdmissions       = overdueCount >= threshold;
    bill.restrictStudentRegistration = overdueCount >= threshold;
    return; // restrictions set ho gayi, neeche wala reset na ho
  }

  // FULLY_PAID → restrictions hamesha false
  bill.restrictNewAdmissions       = false;
  bill.restrictStudentRegistration = false;
};

/* ═══════════════════════════════════════════════════════════════
   1. GENERATE SESSION BILL
   POST /api/session-billing/generate
   Body: { tenantId, sessionYear?, studentCount?, overdueRestrictionMonths? }

   sessionYear: "2025-26"  (default: current academic year)
   - April 1 → March 31
   - 12 monthly dues auto-generated
   - Each due: 7th of that month
   - Pricing snapshot taken from current BillingConfig
═══════════════════════════════════════════════════════════════ */
export const generateSessionBill = asyncHandler(async (req, res) => {
  let { tenantId, sessionYear, studentCount, overdueRestrictionMonths = 2 } = req.body;

  if (!tenantId || !isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Valid tenantId required"));

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return res.status(404).json(new apiResponse(404, null, "Tenant not found"));

  // ── Derive session year ──
  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // April=month3
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  // Validate "YYYY-YY" or "YYYY-YYYY"
  if (!/^\d{4}-\d{2,4}$/.test(sessionYear))
    return res.status(400).json(new apiResponse(400, null, 'sessionYear format: "2025-26"'));

  // ── Check duplicate ──
  const exists = await SessionBill.findOne({ tenantId, sessionYear });
  if (exists)
    return res.status(409).json(new apiResponse(409, exists, `Session bill for ${sessionYear} already exists`));

  // ── Student count ──
  if (studentCount === undefined || studentCount === null) {
    const sub = await TenantSubscription.findOne({ tenantId });
    studentCount = sub?.usedStudents ?? 0;
  }
  studentCount = Number(studentCount);

  // ── Pricing config ──
  const cfg = await getActiveConfig();
  const snap = {
    baseStudentLimit: cfg.baseStudentLimit,
    basePrice:        cfg.basePrice,
    addonSlotSize:    cfg.addonSlotSize,
    addonSlotPrice:   cfg.addonSlotPrice,
  };
  const { monthlyAmount } = calcMonthlyAmount(studentCount, cfg);

  // ── Session dates ──
  const startYear  = parseInt(sessionYear.split("-")[0]);
  const sessionStart = new Date(startYear, 3, 1);       // April 1
  const sessionEnd   = new Date(startYear + 1, 2, 31);  // March 31

  // ── Generate 12 monthly dues (April → March) ──
  const monthlyDues = [];
  for (let i = 0; i < 12; i++) {
    const mIndex = (3 + i) % 12;          // 3=April,4=May,...,11=Dec,0=Jan,1=Feb,2=Mar
    const mYear  = mIndex >= 3 ? startYear : startYear + 1;
    const ym     = `${mYear}-${String(mIndex + 1).padStart(2, "0")}`;
    const dueDate = new Date(mYear, mIndex, 7);  // 7th of month
    monthlyDues.push({
      monthNo:       i + 1,
      billingMonth:  ym,
      monthName:     `${MONTH_NAMES[mIndex]} ${mYear}`,
      dueDate,
      amount:        monthlyAmount,
      studentCount,
      status:        "PENDING",
      paidAmount:    0,
      balanceAmount: monthlyAmount,
    });
  }

  const bill = await SessionBill.create({
    tenantId,
    sessionYear,
    sessionStart,
    sessionEnd,
    pricingSnapshot:       snap,
    studentCount,
    monthlyAmount,
    totalSessionAmount:    monthlyAmount * 12,
    totalPaid:             0,
    totalDue:              monthlyAmount * 12,
    monthlyDues,
    receipts:              [],
    status:                "ACTIVE",
    overdueRestrictionMonths: Number(overdueRestrictionMonths),
    generatedBy:           req.user?.name || req.user?._id || "admin",
  });

  return res.status(201).json(new apiResponse(201, bill, `Session bill generated for ${sessionYear}`));
});

/* ═══════════════════════════════════════════════════════════════
   2. RECORD PAYMENT
   POST /api/session-billing/:tenantId/pay
   Body: {
     sessionYear?,       // default: current session
     totalPaidAmount,    // total amount received in this payment
     paymentRef?,
     paymentMode?,
     paidBy?,
     remarks?,
     months?,            // optional: ["2025-04","2025-05"] — specific months
                         // If omitted, auto-distribute oldest-first
   }

   Payment Types:
   - Single month:   months: ["2025-04"], totalPaidAmount: 1200
   - Multiple months: months: ["2025-04","2025-05"], totalPaidAmount: 2400
   - Advance:        months: ["2025-04","2025-05","2025-06"], totalPaidAmount: 3600
   - Full session:   totalPaidAmount: 14400 (no months needed — auto-fills all)
   - Partial:        months: ["2025-04"], totalPaidAmount: 600 (partial month)
═══════════════════════════════════════════════════════════════ */
export const recordPayment = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  let {
    sessionYear,
    totalPaidAmount,
    paymentRef,
    paymentMode = "OTHER",
    paidBy,
    remarks,
    months,    // optional array of "YYYY-MM" strings
  } = req.body;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));
  if (!totalPaidAmount || Number(totalPaidAmount) <= 0)
    return res.status(400).json(new apiResponse(400, null, "totalPaidAmount must be > 0"));

  totalPaidAmount = Number(totalPaidAmount);

  // ── Resolve session year ──
  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  const bill = await SessionBill.findOne({ tenantId, sessionYear });
  if (!bill)
    return res.status(404).json(new apiResponse(404, null, `No session bill found for ${sessionYear}`));

  if (bill.status === "FULLY_PAID")
    return res.status(400).json(new apiResponse(400, null, "Session is already fully paid"));

  // ── Determine which months to apply payment to ──
  let targetMonths;
  if (months && Array.isArray(months) && months.length > 0) {
    // Admin specified specific months
    targetMonths = bill.monthlyDues.filter((d) => months.includes(d.billingMonth));
    if (targetMonths.length === 0)
      return res.status(400).json(new apiResponse(400, null, "No matching months found in this session"));
  } else {
    // Auto-distribute: oldest unpaid/partial first
    targetMonths = bill.monthlyDues
      .filter((d) => d.status !== "PAID")
      .sort((a, b) => a.monthNo - b.monthNo);
  }

  // ── Distribute payment across target months ──
  let remaining = totalPaidAmount;
  const monthsApplied = [];

  for (const due of targetMonths) {
    if (remaining <= 0) break;

    const balance    = due.amount - due.paidAmount;
    const applyAmt   = Math.min(remaining, balance);

    due.paidAmount    += applyAmt;
    due.balanceAmount  = due.amount - due.paidAmount;
    remaining         -= applyAmt;

    if (due.balanceAmount <= 0) {
      due.status     = "PAID";
      due.balanceAmount = 0;
    } else {
      due.status = "PARTIALLY_PAID";
    }

    monthsApplied.push({
      billingMonth:  due.billingMonth,
      monthName:     due.monthName,
      amountApplied: applyAmt,
    });
  }

  // ── Build receipt ──
  bill.receiptCounter += 1;
  const receipt = {
    receiptNo:       genReceiptNo(tenantId, sessionYear, bill.receiptCounter),
    paidAt:          new Date(),
    paidBy:          paidBy || "admin",
    paymentRef:      paymentRef || null,
    paymentMode,
    totalPaidAmount,
    monthsApplied,
    remarks:         remarks || null,
  };
  bill.receipts.push(receipt);

  // ── Recalculate totals + status ──
  recalcTotals(bill);

  await bill.save();

  return res.status(200).json(
    new apiResponse(200, {
      receipt: bill.receipts[bill.receipts.length - 1],
      summary: {
        totalSessionAmount: bill.totalSessionAmount,
        totalPaid:          bill.totalPaid,
        totalDue:           bill.totalDue,
        status:             bill.status,
        monthsApplied,
      },
    }, "Payment recorded successfully")
  );
});

/* ═══════════════════════════════════════════════════════════════
   3. GET SESSION DASHBOARD (Admin)
   GET /api/session-billing/:tenantId/dashboard?sessionYear=2025-26

   Returns:
   - Total Session Amount, Paid, Due
   - Overdue months list
   - Month-wise breakdown
   - Restriction flags
   - Last 5 receipts
═══════════════════════════════════════════════════════════════ */
export const getSessionDashboard = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  let { sessionYear } = req.query;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  const bill = await SessionBill.findOne({ tenantId, sessionYear }).lean();
  if (!bill) {
    return res.status(200).json(new apiResponse(200, {
      hasSessionBill: false,
      sessionYear,
      message: "No session bill found. Generate one first.",
    }, "No session bill"));
  }

  const now = new Date();

  // ── Auto-mark overdue (lean so we compute only, not save here) ──
  const overdueMonths = bill.monthlyDues
    .filter((d) => d.status !== "PAID" && new Date(d.dueDate) < now)
    .map((d) => ({ billingMonth: d.billingMonth, monthName: d.monthName, dueDate: d.dueDate, balance: d.balanceAmount }));

  const paidMonths    = bill.monthlyDues.filter((d) => d.status === "PAID");
  const pendingMonths = bill.monthlyDues.filter((d) => d.status === "PENDING");
  const partialMonths = bill.monthlyDues.filter((d) => d.status === "PARTIALLY_PAID");

  // ── Alerts: upcoming dues ──
  const alerts = [];
  bill.monthlyDues.forEach((d) => {
    if (d.status === "PAID") return;
    const due     = new Date(d.dueDate);
    const diffMs  = due - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0 && diffDays >= -7) {
      alerts.push({ type: "7_DAYS_AFTER",  billingMonth: d.billingMonth, monthName: d.monthName, dueDate: d.dueDate, balance: d.balanceAmount, message: `Payment of ₹${d.balanceAmount} for ${d.monthName} is ${Math.abs(diffDays)} day(s) overdue` });
    } else if (diffDays === 0) {
      alerts.push({ type: "DUE_TODAY",     billingMonth: d.billingMonth, monthName: d.monthName, dueDate: d.dueDate, balance: d.balanceAmount, message: `Your ${d.monthName} subscription payment of ₹${d.balanceAmount} is due today` });
    } else if (diffDays > 0 && diffDays <= 7) {
      alerts.push({ type: "7_DAYS_BEFORE", billingMonth: d.billingMonth, monthName: d.monthName, dueDate: d.dueDate, balance: d.balanceAmount, message: `Your ${d.monthName} subscription payment of ₹${d.balanceAmount} is due in ${diffDays} day(s)` });
    }
  });

  return res.status(200).json(new apiResponse(200, {
    hasSessionBill:    true,
    tenantId,
    sessionYear,
    sessionStart:      bill.sessionStart,
    sessionEnd:        bill.sessionEnd,
    studentCount:      bill.studentCount,
    monthlyAmount:     bill.monthlyAmount,
    status:            bill.status,

    // ── Dashboard Numbers ──
    summary: {
      totalSessionAmount:  bill.totalSessionAmount,
      totalPaid:           bill.totalPaid,
      totalDue:            bill.totalDue,
      paidMonths:          paidMonths.length,
      overdueMonths:       overdueMonths.length,
      pendingMonths:       pendingMonths.length,
      partialMonths:       partialMonths.length,
    },

    // ── Month-wise breakdown ──
    monthlyDues: bill.monthlyDues,

    // ── Overdue list ──
    overdueMonths,

    // ── Alerts ──
    alerts,

    // ── Restrictions ──
    restrictions: {
      newAdmissionsDisabled:       bill.restrictNewAdmissions,
      studentRegistrationDisabled: bill.restrictStudentRegistration,
      overdueThresholdMonths:      bill.overdueRestrictionMonths,
      overdueMonthCount:           overdueMonths.length,
    },

    // ── Last 5 receipts ──
    recentReceipts: (bill.receipts || []).slice(-5).reverse(),
  }, "Session dashboard fetched"));
});

/* ═══════════════════════════════════════════════════════════════
   4. GET ALL SESSION BILLS (Admin list)
   GET /api/session-billing?tenantId=&sessionYear=&status=&page=&limit=
═══════════════════════════════════════════════════════════════ */
export const getAllSessionBills = asyncHandler(async (req, res) => {
  const {
    tenantId, sessionYear, status,
    page = 1, limit = 10, isPagination = "true", search = "",
  } = req.query;

  const match = {};
  if (tenantId && isValidId(tenantId))
    match.tenantId = new mongoose.Types.ObjectId(tenantId);
  if (sessionYear) match.sessionYear = sessionYear;
  if (status)      match.status      = status;

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "tenants", localField: "tenantId",
        foreignField: "_id", as: "tenantDetails",
      },
    },
    { $unwind: { path: "$tenantDetails", preserveNullAndEmptyArrays: true } },
  ];

  if (search.trim()) {
    pipeline.push({ $match: { "tenantDetails.schoolName": { $regex: search.trim(), $options: "i" } } });
  }

  pipeline.push({ $sort: { sessionYear: -1, createdAt: -1 } });

  const countResult = await SessionBill.aggregate([...pipeline, { $count: "count" }]);
  const total       = countResult[0]?.count || 0;

  if (isPagination === "true") {
    pipeline.push(
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) }
    );
  }

  // project: exclude large arrays for listing
  pipeline.push({
    $project: {
      tenantId: 1, sessionYear: 1, sessionStart: 1, sessionEnd: 1,
      studentCount: 1, monthlyAmount: 1, totalSessionAmount: 1,
      totalPaid: 1, totalDue: 1, status: 1,
      restrictNewAdmissions: 1, restrictStudentRegistration: 1,
      "tenantDetails.schoolName": 1, "tenantDetails.subdomain": 1,
      createdAt: 1,
      overdueMonthsCount: {
        $size: {
          $filter: {
            input: "$monthlyDues",
            as:    "d",
            cond:  { $eq: ["$$d.status", "OVERDUE"] },
          },
        },
      },
      paidMonthsCount: {
        $size: {
          $filter: {
            input: "$monthlyDues",
            as:    "d",
            cond:  { $eq: ["$$d.status", "PAID"] },
          },
        },
      },
    },
  });

  const bills = await SessionBill.aggregate(pipeline);

  return res.status(200).json(new apiResponse(200, {
    bills, total,
    totalPages:  isPagination === "true" ? Math.ceil(total / Number(limit)) : 1,
    currentPage: isPagination === "true" ? Number(page) : null,
  }, "Session bills fetched"));
});

/* ═══════════════════════════════════════════════════════════════
   5. GET SINGLE SESSION BILL (full detail)
   GET /api/session-billing/:tenantId/detail?sessionYear=2025-26
═══════════════════════════════════════════════════════════════ */
export const getSessionBillDetail = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  let { sessionYear } = req.query;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  const bill = await SessionBill.findOne({ tenantId, sessionYear });
  if (!bill)
    return res.status(404).json(new apiResponse(404, null, "Session bill not found"));

  // Auto-mark overdue & save
  let changed = false;
  const now = new Date();
  bill.monthlyDues.forEach((d) => {
    if (d.status !== "PAID" && d.status !== "PARTIALLY_PAID" && new Date(d.dueDate) < now) {
      if (d.status !== "OVERDUE") { d.status = "OVERDUE"; changed = true; }
    }
  });
  if (changed) {
    recalcTotals(bill);
    await bill.save();
  }

  return res.status(200).json(new apiResponse(200, bill, "Session bill detail fetched"));
});

/* ═══════════════════════════════════════════════════════════════
   6. GET RECEIPTS for a session
   GET /api/session-billing/:tenantId/receipts?sessionYear=2025-26
═══════════════════════════════════════════════════════════════ */
export const getReceipts = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  let { sessionYear } = req.query;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  const bill = await SessionBill.findOne({ tenantId, sessionYear })
    .select("sessionYear receipts totalPaid totalSessionAmount");
  if (!bill)
    return res.status(404).json(new apiResponse(404, null, "Session bill not found"));

  return res.status(200).json(new apiResponse(200, {
    sessionYear: bill.sessionYear,
    totalPaid:   bill.totalPaid,
    totalSessionAmount: bill.totalSessionAmount,
    receipts:    bill.receipts.slice().reverse(),
  }, "Receipts fetched"));
});

/* ═══════════════════════════════════════════════════════════════
   7. BULK GENERATE — All active tenants ke liye session bill
   POST /api/session-billing/generate-bulk
   Body: { sessionYear? }
   (Typically called at session start — April 1 — via cron)
═══════════════════════════════════════════════════════════════ */
export const generateBulkSessionBills = asyncHandler(async (req, res) => {
  let { sessionYear } = req.body;

  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  const startYear    = parseInt(sessionYear.split("-")[0]);
  const sessionStart = new Date(startYear, 3, 1);
  const sessionEnd   = new Date(startYear + 1, 2, 31);

  const cfg = await getActiveConfig();
  const snap = {
    baseStudentLimit: cfg.baseStudentLimit,
    basePrice: cfg.basePrice,
    addonSlotSize: cfg.addonSlotSize,
    addonSlotPrice: cfg.addonSlotPrice,
  };

  const tenants = await Tenant.find({ isActive: true }).select("_id");
  const results = { created: 0, skipped: 0, errors: [] };

  for (const tenant of tenants) {
    try {
      const exists = await SessionBill.findOne({ tenantId: tenant._id, sessionYear });
      if (exists) { results.skipped++; continue; }

      const sub = await TenantSubscription.findOne({ tenantId: tenant._id });
      const studentCount = sub?.usedStudents ?? 0;
      const { monthlyAmount } = calcMonthlyAmount(studentCount, cfg);

      const monthlyDues = [];
      for (let i = 0; i < 12; i++) {
        const mIndex   = (3 + i) % 12;
        const mYear    = mIndex >= 3 ? startYear : startYear + 1;
        const ym       = `${mYear}-${String(mIndex + 1).padStart(2, "0")}`;
        const dueDate  = new Date(mYear, mIndex, 7);
        monthlyDues.push({
          monthNo: i + 1, billingMonth: ym,
          monthName: `${MONTH_NAMES[mIndex]} ${mYear}`,
          dueDate, amount: monthlyAmount, studentCount,
          status: "PENDING", paidAmount: 0, balanceAmount: monthlyAmount,
        });
      }

      await SessionBill.create({
        tenantId: tenant._id, sessionYear, sessionStart, sessionEnd,
        pricingSnapshot: snap, studentCount, monthlyAmount,
        totalSessionAmount: monthlyAmount * 12, totalPaid: 0,
        totalDue: monthlyAmount * 12, monthlyDues,
        receipts: [], status: "ACTIVE", generatedBy: "bulk-cron",
      });
      results.created++;
    } catch (err) {
      results.errors.push({ tenantId: tenant._id, error: err.message });
    }
  }

  return res.status(200).json(new apiResponse(200, results, `Bulk session bills generated for ${sessionYear}`));
});

/* ═══════════════════════════════════════════════════════════════
   8. MARK OVERDUE — Cron job (daily)
   PATCH /api/session-billing/mark-overdue
   Auto-marks all past-due months and updates restrictions
═══════════════════════════════════════════════════════════════ */
export const markOverdueMonths = asyncHandler(async (req, res) => {
  const now   = new Date();
  const bills = await SessionBill.find({ status: { $in: ["ACTIVE", "OVERDUE"] } });

  let updatedBills = 0;
  let updatedMonths = 0;

  for (const bill of bills) {
    let changed = false;
    bill.monthlyDues.forEach((d) => {
      if (d.status !== "PAID" && d.status !== "PARTIALLY_PAID" && new Date(d.dueDate) < now) {
        if (d.status !== "OVERDUE") { d.status = "OVERDUE"; changed = true; updatedMonths++; }
      }
    });
    if (changed) {
      recalcTotals(bill);
      await bill.save();
      updatedBills++;
    }
  }

  return res.status(200).json(new apiResponse(200, { updatedBills, updatedMonths },
    `Overdue check done: ${updatedMonths} months marked overdue across ${updatedBills} bills`));
});

/* ═══════════════════════════════════════════════════════════════
   9. UPDATE SESSION BILL (Admin: adjust student count / overdue threshold)
   PATCH /api/session-billing/:tenantId/update
   Body: { sessionYear?, studentCount?, overdueRestrictionMonths?, recalcAmounts? }
═══════════════════════════════════════════════════════════════ */
export const updateSessionBill = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  let { sessionYear, studentCount, overdueRestrictionMonths, recalcAmounts = false } = req.body;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid tenantId"));

  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  const bill = await SessionBill.findOne({ tenantId, sessionYear });
  if (!bill)
    return res.status(404).json(new apiResponse(404, null, "Session bill not found"));

  if (overdueRestrictionMonths !== undefined)
    bill.overdueRestrictionMonths = Number(overdueRestrictionMonths);

  // If student count changes and recalcAmounts=true → recalculate unpaid months
  if (studentCount !== undefined && recalcAmounts) {
    studentCount = Number(studentCount);
    const cfg    = await getActiveConfig();
    const { monthlyAmount } = calcMonthlyAmount(studentCount, cfg);
    bill.studentCount  = studentCount;
    bill.monthlyAmount = monthlyAmount;
    bill.totalSessionAmount = monthlyAmount * 12;

    // Recalculate only PENDING/OVERDUE months (don't touch paid)
    bill.monthlyDues.forEach((d) => {
      if (d.status !== "PAID") {
        d.amount        = monthlyAmount;
        d.studentCount  = studentCount;
        d.balanceAmount = monthlyAmount - d.paidAmount;
      }
    });
  } else if (studentCount !== undefined) {
    bill.studentCount = Number(studentCount);
  }

  recalcTotals(bill);
  await bill.save();

  return res.status(200).json(new apiResponse(200, bill, "Session bill updated"));
});

/* ═══════════════════════════════════════════════════════════════
   10. PROCESS ALERTS (called by cron or on-demand)
   POST /api/session-billing/process-alerts
   Sets alert flags on monthly dues for 7-before / due-day / 7-after
   Returns list of alerts to send (email/SMS integration point)
═══════════════════════════════════════════════════════════════ */
export const processAlerts = asyncHandler(async (req, res) => {
  const now   = new Date();
  const bills = await SessionBill.find({ status: { $in: ["ACTIVE", "OVERDUE"] } })
    .populate("tenantId", "schoolName schoolEmail schoolContact subdomain");

  const alertsToSend = [];

  for (const bill of bills) {
    let changed = false;
    for (const due of bill.monthlyDues) {
      if (due.status === "PAID") continue;

      const dueDate  = new Date(due.dueDate);
      const diffMs   = dueDate - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const base = {
        tenantId:     bill.tenantId._id,
        schoolName:   bill.tenantId.schoolName,
        schoolEmail:  bill.tenantId.schoolEmail,
        sessionYear:  bill.sessionYear,
        billingMonth: due.billingMonth,
        monthName:    due.monthName,
        dueDate:      due.dueDate,
        amountDue:    due.balanceAmount,
      };

      if (diffDays > 0 && diffDays <= 7 && !due.alert7DaysBefore) {
        due.alert7DaysBefore = true; changed = true;
        alertsToSend.push({ ...base, alertType: "7_DAYS_BEFORE",
          message: `Your ${due.monthName} subscription payment of ₹${due.balanceAmount} is due in ${diffDays} day(s)` });
      } else if (diffDays === 0 && !due.alertOnDueDate) {
        due.alertOnDueDate = true; changed = true;
        alertsToSend.push({ ...base, alertType: "DUE_TODAY",
          message: `Your ${due.monthName} subscription payment of ₹${due.balanceAmount} is due today` });
      } else if (diffDays < 0 && diffDays >= -7 && !due.alert7DaysAfter) {
        due.alert7DaysAfter = true; changed = true;
        alertsToSend.push({ ...base, alertType: "7_DAYS_AFTER",
          message: `Your ${due.monthName} subscription payment of ₹${due.balanceAmount} is ${Math.abs(diffDays)} day(s) overdue` });
      }
    }
    if (changed) await bill.save();
  }

  return res.status(200).json(new apiResponse(200, {
    alertsGenerated: alertsToSend.length,
    alerts: alertsToSend,
  }, "Alerts processed"));
});

/* ═══════════════════════════════════════════════════════════════
   11. SUBSCRIPTION REPORT (Admin)
   GET /api/session-billing/report?sessionYear=2025-26
   Returns aggregated stats across all tenants for a session
═══════════════════════════════════════════════════════════════ */
export const getSubscriptionReport = asyncHandler(async (req, res) => {
  let { sessionYear } = req.query;

  if (!sessionYear) {
    const now = new Date();
    const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    sessionYear = `${y}-${String(y + 1).slice(-2)}`;
  }

  const bills = await SessionBill.find({ sessionYear })
    .populate("tenantId", "schoolName subdomain")
    .lean();

  const totalSchools      = bills.length;
  const totalBilledAmount = bills.reduce((s, b) => s + b.totalSessionAmount, 0);
  const totalCollected    = bills.reduce((s, b) => s + b.totalPaid, 0);
  const totalDue          = bills.reduce((s, b) => s + b.totalDue, 0);

  const fullyPaid  = bills.filter((b) => b.status === "FULLY_PAID").length;
  const overdue    = bills.filter((b) => b.status === "OVERDUE").length;
  const active     = bills.filter((b) => b.status === "ACTIVE").length;
  const restricted = bills.filter((b) => b.restrictNewAdmissions).length;

  const collectionPercent = totalBilledAmount > 0
    ? Math.round((totalCollected / totalBilledAmount) * 100) : 0;

  // Per-school breakdown
  const schoolBreakdown = bills.map((b) => {
    const overdueMonths = b.monthlyDues.filter((d) => d.status === "OVERDUE").length;
    return {
      tenantId:          b.tenantId._id,
      schoolName:        b.tenantId.schoolName,
      subdomain:         b.tenantId.subdomain,
      studentCount:      b.studentCount,
      monthlyAmount:     b.monthlyAmount,
      totalAmount:       b.totalSessionAmount,
      paid:              b.totalPaid,
      due:               b.totalDue,
      status:            b.status,
      overdueMonths,
      restricted:        b.restrictNewAdmissions,
    };
  });

  return res.status(200).json(new apiResponse(200, {
    sessionYear,
    summary: {
      totalSchools, totalBilledAmount, totalCollected, totalDue,
      collectionPercent, fullyPaid, overdue, active, restricted,
    },
    schoolBreakdown,
  }, "Subscription report fetched"));
});

/* ═══════════════════════════════════════════════════════════════
   12. TENANT PORTAL — My Session Bill
   GET /api/session-billing/portal/my-bill
   Auth: verifyPortalJWT (req.tenantId set by portal middleware)
═══════════════════════════════════════════════════════════════ */
export const getPortalSessionBill = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;  // from verifyPortalJWT
  const now = new Date();
  const y   = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const sessionYear = `${y}-${String(y + 1).slice(-2)}`;

  if (!isValidId(tenantId))
    return res.status(400).json(new apiResponse(400, null, "Invalid portal session"));

  const bill = await SessionBill.findOne({ tenantId, sessionYear });
  if (!bill) {
    return res.status(200).json(new apiResponse(200, {
      hasSessionBill: false,
      sessionYear,
      message: "No subscription bill found for current session.",
    }, "No session bill"));
  }

  // Auto-mark overdue
  let changed = false;
  bill.monthlyDues.forEach((d) => {
    if (d.status !== "PAID" && d.status !== "PARTIALLY_PAID" && new Date(d.dueDate) < now) {
      if (d.status !== "OVERDUE") { d.status = "OVERDUE"; changed = true; }
    }
  });
  if (changed) { recalcTotals(bill); await bill.save(); }

  const overdueMonths = bill.monthlyDues.filter((d) => d.status === "OVERDUE");

  return res.status(200).json(new apiResponse(200, {
    hasSessionBill: true,
    sessionYear:    bill.sessionYear,
    sessionStart:   bill.sessionStart,
    sessionEnd:     bill.sessionEnd,
    summary: {
      totalSessionAmount: bill.totalSessionAmount,
      totalPaid:          bill.totalPaid,
      totalDue:           bill.totalDue,
      status:             bill.status,
    },
    monthlyDues:  bill.monthlyDues,
    overdueMonths: overdueMonths.map((d) => ({
      billingMonth: d.billingMonth,
      monthName:    d.monthName,
      dueDate:      d.dueDate,
      balance:      d.balanceAmount,
    })),
    restrictions: {
      newAdmissionsDisabled:       bill.restrictNewAdmissions,
      studentRegistrationDisabled: bill.restrictStudentRegistration,
    },
    recentReceipts: (bill.receipts || []).slice(-3).reverse(),
  }, "Portal session bill fetched"));
});

/* ─────────────────────────────────────────────────────────────────
   FIX RESTRICTION FLAGS
   POST /api/session-billing/fix-restrictions

   Ek-baar run karo: DB mein jo FULLY_PAID bills hain unke
   restrictNewAdmissions aur restrictStudentRegistration flags
   false kar do. (Data migration / one-time fix)
───────────────────────────────────────────────────────────────── */
export const fixRestrictionFlags = asyncHandler(async (req, res) => {
  // All FULLY_PAID bills — restrictions false karo
  const result = await SessionBill.updateMany(
    { status: "FULLY_PAID" },
    {
      $set: {
        restrictNewAdmissions:       false,
        restrictStudentRegistration: false,
      },
    }
  );

  // Also fix bills where totalPaid >= totalSessionAmount but status was not updated
  const bills = await SessionBill.find({
    $expr: { $gte: ["$totalPaid", "$totalSessionAmount"] },
    $or: [
      { restrictNewAdmissions: true },
      { restrictStudentRegistration: true },
    ],
  });

  let extraFixed = 0;
  for (const bill of bills) {
    bill.status                    = "FULLY_PAID";
    bill.restrictNewAdmissions     = false;
    bill.restrictStudentRegistration = false;
    bill.monthlyDues.forEach((d) => { if (d.status !== "PAID") d.status = "PAID"; });
    await bill.save();
    extraFixed++;
  }

  return res.status(200).json(
    new apiResponse(200, {
      fullyPaidFixed: result.modifiedCount,
      amountMismatchFixed: extraFixed,
    }, `Fixed ${result.modifiedCount + extraFixed} session bill(s). Restrictions cleared.`)
  );
});
