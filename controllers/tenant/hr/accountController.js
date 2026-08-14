import { getAccountHeadModel } from "../../../models/tenant/hr/AccountHead.model.js";
import { getVoucherModel }     from "../../../models/tenant/hr/Voucher.model.js";
import { apiResponse }         from "../../../utils/apiResponse.js";
import { asyncHandler }        from "../../../utils/asyncHandler.js";
import { apiError }            from "../../../utils/apiError.js";

// ── Auto voucher number ───────────────────────────────────────────────────────
const genVoucherNo = async (Voucher, type) => {
  const prefix = type === "Income" ? "INC" : "EXP";
  const year   = new Date().getFullYear();
  const count  = await Voucher.countDocuments({ voucherType: type }) + 1;
  return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
};

// ════════════════════════════════════════════════════════════════════════════
//  ACCOUNT HEAD
// ════════════════════════════════════════════════════════════════════════════

export const getAccountHeads = asyncHandler(async (req, res) => {
  const AH = getAccountHeadModel(req.db);
  const { accountType, status, search, limit = 500 } = req.query;

  const filter = {};
  if (accountType) filter.accountType = accountType;
  if (status)      filter.status      = status;
  if (search)      filter.accountName = { $regex: search.trim(), $options: "i" };

  const heads = await AH.find(filter)
    .sort({ accountType: 1, accountName: 1 })
    .limit(Number(limit))
    .lean();

  return res.status(200).json(
    new apiResponse(200, { heads, total: heads.length }, "Account heads fetched")
  );
});

export const createAccountHead = asyncHandler(async (req, res) => {
  const AH = getAccountHeadModel(req.db);
  const { accountName, accountType, description } = req.body;

  if (!accountName?.trim()) return apiError(res, 400, false, "Account name is required");
  if (!accountType)         return apiError(res, 400, false, "Account type is required");

  const exists = await AH.findOne({
    accountName: { $regex: `^${accountName.trim()}$`, $options: "i" },
    accountType,
  });
  if (exists) return apiError(res, 409, false, "Account head already exists");

  const head = await AH.create({
    accountName: accountName.trim(),
    accountType,
    description: description || "",
  });
  return res.status(201).json(new apiResponse(201, head, "Account head created"));
});

export const updateAccountHead = asyncHandler(async (req, res) => {
  const AH   = getAccountHeadModel(req.db);
  const head = await AH.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  });
  if (!head) return apiError(res, 404, false, "Account head not found");
  return res.status(200).json(new apiResponse(200, head, "Account head updated"));
});

export const deleteAccountHead = asyncHandler(async (req, res) => {
  const AH   = getAccountHeadModel(req.db);
  const head = await AH.findByIdAndDelete(req.params.id);
  if (!head) return apiError(res, 404, false, "Account head not found");
  return res.status(200).json(new apiResponse(200, null, "Account head deleted"));
});

// ════════════════════════════════════════════════════════════════════════════
//  VOUCHER
// ════════════════════════════════════════════════════════════════════════════

export const createVoucher = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const {
    voucherDate, voucherType, paymentMode, referenceNumber,
    remarks, transactions, sourceModule, sourceReferenceId,
  } = req.body;

  if (!voucherDate)  return apiError(res, 400, false, "voucherDate is required");
  if (!voucherType)  return apiError(res, 400, false, "voucherType is required");
  if (!Array.isArray(transactions) || transactions.length === 0)
    return apiError(res, 400, false, "At least one transaction line is required");

  for (const t of transactions) {
    if (!t.accountHead)           return apiError(res, 400, false, "accountHead is required in each transaction");
    if (!t.amount || t.amount <= 0) return apiError(res, 400, false, "amount must be > 0 in each transaction");
  }

  // Prevent duplicate payroll-sourced voucher
  if (sourceReferenceId) {
    const dup = await Voucher.findOne({ sourceReferenceId, status: "Active" });
    if (dup) return apiError(res, 409, false, `Voucher already exists for reference: ${sourceReferenceId}`);
  }

  const totalAmount   = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const voucherNumber = await genVoucherNo(Voucher, voucherType);

  const voucher = await Voucher.create({
    voucherNumber,
    voucherDate,
    voucherType,
    paymentMode:       paymentMode || "Cash",
    referenceNumber:   referenceNumber || "",
    remarks:           remarks || "",
    totalAmount,
    sourceModule:      sourceModule || "Manual",
    sourceReferenceId: sourceReferenceId || undefined,
    transactions,
    createdBy:         req.user?._id,
    status:            "Active",
  });

  const populated = await Voucher.findById(voucher._id)
    .populate("transactions.accountHead", "accountName accountType");

  return res.status(201).json(new apiResponse(201, populated, "Voucher created successfully"));
});

export const getVouchers = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const {
    voucherType, status, startDate, endDate,
    paymentMode, accountHead,
    page = 1, limit = 20,
  } = req.query;

  const filter = {};
  if (voucherType) filter.voucherType = voucherType;
  if (status)      filter.status      = status;
  if (paymentMode) filter.paymentMode = paymentMode;

  if (startDate || endDate) {
    filter.voucherDate = {};
    if (startDate) filter.voucherDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.voucherDate.$lte = end;
    }
  }

  // Filter by account head inside transactions array
  if (accountHead) {
    filter["transactions.accountHead"] = accountHead;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [vouchers, total] = await Promise.all([
    Voucher.find(filter)
      .populate("transactions.accountHead", "accountName accountType")
      .sort({ voucherDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Voucher.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    vouchers, total, page: Number(page), limit: Number(limit),
  }, "Vouchers fetched"));
});

export const getVoucherById = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const v = await Voucher.findById(req.params.id)
    .populate("transactions.accountHead", "accountName accountType")
    .lean();
  if (!v) return apiError(res, 404, false, "Voucher not found");
  return res.status(200).json(new apiResponse(200, v, "Voucher fetched"));
});

export const cancelVoucher = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const v = await Voucher.findById(req.params.id);
  if (!v) return apiError(res, 404, false, "Voucher not found");
  if (v.status === "Cancelled") return apiError(res, 409, false, "Voucher already cancelled");
  v.status = "Cancelled";
  await v.save();
  return res.status(200).json(new apiResponse(200, v, "Voucher cancelled"));
});

// ════════════════════════════════════════════════════════════════════════════
//  ACCOUNTS REPORTS
// ════════════════════════════════════════════════════════════════════════════

// GET /hr/accounts/dashboard
export const getAccountsDashboard = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const now = new Date();

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const monthEnd   = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

  const [todayVouchers, monthVouchers] = await Promise.all([
    Voucher.find({ voucherDate: { $gte: todayStart, $lte: todayEnd }, status: "Active" }).lean(),
    Voucher.find({ voucherDate: { $gte: monthStart, $lt:  monthEnd  }, status: "Active" }).lean(),
  ]);

  const sum = (arr, type) =>
    arr.filter((v) => v.voucherType === type).reduce((s, v) => s + (v.totalAmount || 0), 0);

  return res.status(200).json(new apiResponse(200, {
    todayIncome:         sum(todayVouchers, "Income"),
    todayExpense:        sum(todayVouchers, "Expense"),
    currentMonthIncome:  sum(monthVouchers, "Income"),
    currentMonthExpense: sum(monthVouchers, "Expense"),
    netBalance:          sum(monthVouchers, "Income") - sum(monthVouchers, "Expense"),
    todayVoucherCount:   todayVouchers.length,
    monthVoucherCount:   monthVouchers.length,
  }, "Accounts dashboard fetched"));
});

// GET /hr/accounts/day-book?date=YYYY-MM-DD
export const getDayBook = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const { date } = req.query;
  if (!date) return apiError(res, 400, false, "date is required");

  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end   = new Date(date); end.setHours(23, 59, 59, 999);

  const vouchers = await Voucher.find({
    voucherDate: { $gte: start, $lte: end },
    status:      "Active",
  })
    .populate("transactions.accountHead", "accountName accountType")
    .sort({ createdAt: 1 })
    .lean();

  const totalIncome  = vouchers
    .filter((v) => v.voucherType === "Income")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);
  const totalExpense = vouchers
    .filter((v) => v.voucherType === "Expense")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);

  return res.status(200).json(new apiResponse(200, {
    date,
    vouchers,
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
  }, "Day book fetched"));
});

// GET /hr/accounts/monthly?month=YYYY-MM
export const getMonthlySummary = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const { month } = req.query;
  if (!month) return apiError(res, 400, false, "month is required (YYYY-MM)");

  const [yr, mo] = month.split("-").map(Number);
  if (!yr || !mo) return apiError(res, 400, false, "month must be YYYY-MM format");

  const start = new Date(Date.UTC(yr, mo - 1, 1));
  const end   = new Date(Date.UTC(yr, mo, 1));

  const vouchers = await Voucher.find({
    voucherDate: { $gte: start, $lt: end },
    status:      "Active",
  })
    .populate("transactions.accountHead", "accountName accountType")
    .lean();

  // Group by account head — use accountHead's own accountType (not voucherType)
  const headMap = {};
  vouchers.forEach((v) => {
    v.transactions.forEach((t) => {
      const headId   = t.accountHead?._id?.toString() || "unknown";
      const headName = t.accountHead?.accountName     || "Unknown";
      const headType = t.accountHead?.accountType     || v.voucherType; // fallback
      if (!headMap[headId]) {
        headMap[headId] = { accountName: headName, accountType: headType, total: 0 };
      }
      headMap[headId].total += Number(t.amount) || 0;
    });
  });

  const totalIncome  = vouchers
    .filter((v) => v.voucherType === "Income")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);
  const totalExpense = vouchers
    .filter((v) => v.voucherType === "Expense")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);

  return res.status(200).json(new apiResponse(200, {
    month,
    totalIncome,
    totalExpense,
    netBalance:   totalIncome - totalExpense,
    breakdown:    Object.values(headMap),
    voucherCount: vouchers.length,
  }, "Monthly summary fetched"));
});

// ════════════════════════════════════════════════════════════════════════════
//  ANNUAL INCOME & EXPENSE REPORT
//  GET /hr/accounts/annual?year=2026
// ════════════════════════════════════════════════════════════════════════════
export const getAnnualReport = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const { year } = req.query;
  const yr = Number(year) || new Date().getFullYear();

  const start = new Date(Date.UTC(yr, 0, 1));   // Jan 1
  const end   = new Date(Date.UTC(yr + 1, 0, 1)); // Jan 1 next year

  const vouchers = await Voucher.find({
    voucherDate: { $gte: start, $lt: end },
    status: "Active",
  })
    .populate("transactions.accountHead", "accountName accountType")
    .lean();

  // ── Month-wise aggregation (12 months) ──────────────────────────────────
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month:      i + 1,
    monthName:  new Date(yr, i, 1).toLocaleString("en-IN", { month: "short" }),
    income:     0,
    expense:    0,
    netBalance: 0,
  }));

  vouchers.forEach((v) => {
    const mo = new Date(v.voucherDate).getMonth(); // 0-based
    if (v.voucherType === "Income")  monthlyData[mo].income  += v.totalAmount || 0;
    if (v.voucherType === "Expense") monthlyData[mo].expense += v.totalAmount || 0;
  });
  monthlyData.forEach((m) => { m.netBalance = m.income - m.expense; });

  // ── Account-head-wise aggregation ──────────────────────────────────────
  const headMap = {};
  vouchers.forEach((v) => {
    v.transactions.forEach((t) => {
      const hId   = t.accountHead?._id?.toString() || "unknown";
      const hName = t.accountHead?.accountName     || "Unknown";
      const hType = t.accountHead?.accountType     || v.voucherType;
      if (!headMap[hId]) headMap[hId] = { accountName: hName, accountType: hType, total: 0 };
      headMap[hId].total += Number(t.amount) || 0;
    });
  });

  const totalIncome  = vouchers
    .filter((v) => v.voucherType === "Income")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);
  const totalExpense = vouchers
    .filter((v) => v.voucherType === "Expense")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);

  return res.status(200).json(new apiResponse(200, {
    year:         yr,
    totalIncome,
    totalExpense,
    netBalance:   totalIncome - totalExpense,
    voucherCount: vouchers.length,
    monthlyData,
    breakdown:    Object.values(headMap),
  }, "Annual report fetched"));
});

// ════════════════════════════════════════════════════════════════════════════
//  PAYMENT MODE REPORT
//  GET /hr/accounts/payment-mode?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ════════════════════════════════════════════════════════════════════════════
export const getPaymentModeReport = asyncHandler(async (req, res) => {
  const Voucher = getVoucherModel(req.db);
  const { startDate, endDate, voucherType } = req.query;

  const filter = { status: "Active" };
  if (voucherType) filter.voucherType = voucherType;

  if (startDate || endDate) {
    filter.voucherDate = {};
    if (startDate) filter.voucherDate.$gte = new Date(startDate);
    if (endDate) {
      const ed = new Date(endDate);
      ed.setHours(23, 59, 59, 999);
      filter.voucherDate.$lte = ed;
    }
  }

  const vouchers = await Voucher.find(filter)
    .populate("transactions.accountHead", "accountName accountType")
    .lean();

  // ── Group by paymentMode ───────────────────────────────────────────────
  const modeMap = {};
  const MODES = ["Cash", "Bank Transfer", "UPI", "Cheque", "Other"];
  MODES.forEach((m) => {
    modeMap[m] = { mode: m, count: 0, totalIncome: 0, totalExpense: 0, total: 0 };
  });

  vouchers.forEach((v) => {
    const mode = v.paymentMode || "Other";
    const key  = MODES.includes(mode) ? mode : "Other";
    modeMap[key].count++;
    if (v.voucherType === "Income")  modeMap[key].totalIncome  += v.totalAmount || 0;
    if (v.voucherType === "Expense") modeMap[key].totalExpense += v.totalAmount || 0;
    modeMap[key].total += v.totalAmount || 0;
  });

  const modeReport = Object.values(modeMap).filter((m) => m.count > 0);

  const totalIncome  = vouchers
    .filter((v) => v.voucherType === "Income")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);
  const totalExpense = vouchers
    .filter((v) => v.voucherType === "Expense")
    .reduce((s, v) => s + (v.totalAmount || 0), 0);

  // ── Recent voucher list (top 50) ──────────────────────────────────────
  const recentVouchers = vouchers
    .sort((a, b) => new Date(b.voucherDate) - new Date(a.voucherDate))
    .slice(0, 50);

  return res.status(200).json(new apiResponse(200, {
    totalIncome,
    totalExpense,
    totalTransactions: vouchers.length,
    modeReport,
    recentVouchers,
  }, "Payment mode report fetched"));
});
