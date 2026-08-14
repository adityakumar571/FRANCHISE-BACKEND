import { getPayrollModel }         from "../../../models/tenant/hr/Payroll.model.js";
import { getSalaryPaymentModel }   from "../../../models/tenant/hr/SalaryPayment.model.js";
import { getSalaryStructureModel } from "../../../models/tenant/hr/SalaryStructure.model.js";
import { getStaffModel }           from "../../../models/tenant/hr/Staff.model.js";
import { getAttendanceHRModel }    from "../../../models/tenant/hr/Attendance.model.js";
import { getVoucherModel }         from "../../../models/tenant/hr/Voucher.model.js";
import { getAccountHeadModel }     from "../../../models/tenant/hr/AccountHead.model.js";
import { apiResponse }             from "../../../utils/apiResponse.js";
import { asyncHandler }            from "../../../utils/asyncHandler.js";
import { apiError }                from "../../../utils/apiError.js";

// ── PAYROLL DASHBOARD ─────────────────────────────────────────────────────────
export const getPayrollDashboard = asyncHandler(async (req, res) => {
  const Payroll = getPayrollModel(req.db);
  const Staff   = getStaffModel(req.db);

  const now   = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [totalStaff, payrollThisMonth] = await Promise.all([
    Staff.countDocuments({ isActive: true }),
    Payroll.find({ salaryMonth: month }).lean(),
  ]);

  const totalSalary  = payrollThisMonth.reduce((s, p) => s + (p.netSalary || 0), 0);
  const paidSalary   = payrollThisMonth
    .filter((p) => p.paymentStatus === "Paid")
    .reduce((s, p) => s + (p.netSalary || 0), 0);
  const unpaidSalary = payrollThisMonth
    .filter((p) => p.paymentStatus === "Unpaid")
    .reduce((s, p) => s + (p.netSalary || 0), 0);
  const onHold       = payrollThisMonth.filter((p) => p.paymentStatus === "On Hold").length;
  const paidCount    = payrollThisMonth.filter((p) => p.paymentStatus === "Paid").length;
  const unpaidCount  = payrollThisMonth.filter((p) => p.paymentStatus === "Unpaid").length;

  return res.status(200).json(new apiResponse(200, {
    month,
    totalStaff,
    payrollGenerated: payrollThisMonth.length,
    totalSalary,
    paidSalary,
    unpaidSalary,
    onHold,
    paidCount,
    unpaidCount,
  }, "Payroll dashboard fetched"));
});

// ── GENERATE MONTHLY PAYROLL ──────────────────────────────────────────────────
// POST /payroll/generate
// Body: { salaryMonth: "2026-07", staffIds?: [...] }
export const generatePayroll = asyncHandler(async (req, res) => {
  const Payroll    = getPayrollModel(req.db);
  const Staff      = getStaffModel(req.db);
  const Attendance = getAttendanceHRModel(req.db);

  const { salaryMonth, staffIds } = req.body;
  if (!salaryMonth) return apiError(res, 400, false, "salaryMonth is required (YYYY-MM)");
  if (!/^\d{4}-\d{2}$/.test(salaryMonth))
    return apiError(res, 400, false, "salaryMonth must be YYYY-MM format");

  const [year, mon] = salaryMonth.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const staffFilter = { isActive: true };
  if (staffIds?.length) staffFilter._id = { $in: staffIds };

  const staffList = await Staff.find(staffFilter).lean();
  if (!staffList.length) return apiError(res, 404, false, "No active staff found");

  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end   = new Date(Date.UTC(year, mon, 1));

  const allAtt = await Attendance.find({
    staff: { $in: staffList.map((s) => s._id) },
    date:  { $gte: start, $lt: end },
  }).lean();

  const attMap = {};
  allAtt.forEach(({ staff, status }) => {
    const id = staff.toString();
    if (!attMap[id]) attMap[id] = { present: 0, absent: 0, paidLeave: 0, unpaidLeave: 0 };
    if      (status === "Present")       attMap[id].present++;
    else if (status === "Half Day")      attMap[id].present += 0.5;
    else if (status === "Absent")        attMap[id].absent++;
    else if (status === "Paid Leave")    attMap[id].paidLeave++;
    else if (status === "Unpaid Leave")  attMap[id].unpaidLeave++;
  });

  const created = [], skipped = [], errors = [];

  for (const s of staffList) {
    const sid = s._id.toString();
    const att = attMap[sid] || { present: 0, absent: 0, paidLeave: 0, unpaidLeave: 0 };
    const monthlySalary = s.monthlySalary || 0;

    const perDay          = daysInMonth > 0 ? monthlySalary / daysInMonth : 0;
    const absentDeduction = Math.round(att.absent * perDay);
    const leaveDeduction  = Math.round(att.unpaidLeave * perDay);
    const totalDeduction  = absentDeduction + leaveDeduction;
    const netSalary       = Math.max(0, monthlySalary - totalDeduction);

    try {
      const doc = await Payroll.create({
        salaryMonth,
        staff:            s._id,
        monthlySalary,
        presentDays:      Math.round(att.present),
        absentDays:       att.absent,
        paidLeave:        att.paidLeave,
        unpaidLeave:      att.unpaidLeave,
        absentDeduction,
        leaveDeduction,
        totalDeduction,
        netSalary,
        paymentStatus:    "Unpaid",
        generatedBy:      req.user?._id,
      });
      created.push(doc._id);
    } catch (err) {
      if (err.code === 11000) {
        skipped.push({ staff: s.employeeName, reason: "Already generated" });
      } else {
        errors.push({ staff: s.employeeName, reason: err.message });
      }
    }
  }

  return res.status(201).json(new apiResponse(201, {
    created:     created.length,
    skipped:     skipped.length,
    errors:      errors.length,
    skippedList: skipped,
    errorsList:  errors,
  }, `Payroll generated: ${created.length} records created`));
});

// ── GET PAYROLL LIST ──────────────────────────────────────────────────────────
export const getPayroll = asyncHandler(async (req, res) => {
  const Payroll = getPayrollModel(req.db);
  const { salaryMonth, department, paymentStatus, page = 1, limit = 50 } = req.query;

  if (!salaryMonth) return apiError(res, 400, false, "salaryMonth is required");

  const filter = { salaryMonth };
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  const skip = (Number(page) - 1) * Number(limit);

  const [payrolls, total] = await Promise.all([
    Payroll.find(filter)
      .populate({
        path:    "staff",
        select:  "employeeName employeeCode staffType monthlySalary department designation",
        populate: [
          { path: "department",  select: "name" },
          { path: "designation", select: "name" },
        ],
      })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Payroll.countDocuments(filter),
  ]);

  // department filter after populate
  const filtered = department
    ? payrolls.filter((p) => p.staff?.department?._id?.toString() === department)
    : payrolls;

  return res.status(200).json(new apiResponse(200, {
    payrolls: filtered,
    total:    department ? filtered.length : total,
    page:     Number(page),
    limit:    Number(limit),
  }, "Payroll fetched"));
});

// ── GET SINGLE PAYROLL ────────────────────────────────────────────────────────
export const getPayrollById = asyncHandler(async (req, res) => {
  const Payroll = getPayrollModel(req.db);

  const p = await Payroll.findById(req.params.id)
    .populate({
      path:    "staff",
      select:  "employeeName employeeCode monthlySalary department designation bankName accountNumber ifscCode",
      populate: [
        { path: "department",  select: "name" },
        { path: "designation", select: "name" },
      ],
    })
    .lean();

  if (!p) return apiError(res, 404, false, "Payroll record not found");
  return res.status(200).json(new apiResponse(200, p, "Payroll fetched"));
});

// ── UPDATE PAYROLL (manual adjustment) ───────────────────────────────────────
export const updatePayroll = asyncHandler(async (req, res) => {
  const Payroll = getPayrollModel(req.db);

  const {
    extraEarning, absentDeduction, leaveDeduction,
    advanceDeduction, otherDeduction, remarks, paymentStatus,
  } = req.body;

  const p = await Payroll.findById(req.params.id);
  if (!p) return apiError(res, 404, false, "Payroll record not found");
  if (p.paymentStatus === "Paid") return apiError(res, 409, false, "Cannot edit a Paid payroll");

  if (extraEarning     !== undefined) p.extraEarning     = Number(extraEarning)     || 0;
  if (absentDeduction  !== undefined) p.absentDeduction  = Number(absentDeduction)  || 0;
  if (leaveDeduction   !== undefined) p.leaveDeduction   = Number(leaveDeduction)   || 0;
  if (advanceDeduction !== undefined) p.advanceDeduction = Number(advanceDeduction) || 0;
  if (otherDeduction   !== undefined) p.otherDeduction   = Number(otherDeduction)   || 0;
  if (remarks          !== undefined) p.remarks          = remarks;
  if (paymentStatus    !== undefined) p.paymentStatus    = paymentStatus;

  p.totalDeduction = (p.absentDeduction  || 0)
                   + (p.leaveDeduction   || 0)
                   + (p.advanceDeduction || 0)
                   + (p.otherDeduction   || 0);
  p.netSalary = Math.max(0,
    (p.monthlySalary || 0) + (p.extraEarning || 0) - p.totalDeduction
  );

  await p.save();
  return res.status(200).json(new apiResponse(200, p, "Payroll updated successfully"));
});

// ── DELETE PAYROLL ────────────────────────────────────────────────────────────
export const deletePayroll = asyncHandler(async (req, res) => {
  const Payroll = getPayrollModel(req.db);

  const p = await Payroll.findById(req.params.id);
  if (!p) return apiError(res, 404, false, "Payroll record not found");
  if (p.paymentStatus === "Paid")
    return apiError(res, 409, false, "Cannot delete a Paid payroll");

  await p.deleteOne();
  return res.status(200).json(new apiResponse(200, null, "Payroll deleted"));
});

// ── RECORD SALARY PAYMENT ─────────────────────────────────────────────────────
export const recordPayment = asyncHandler(async (req, res) => {
  const Payroll       = getPayrollModel(req.db);
  const SalaryPayment = getSalaryPaymentModel(req.db);
  const Voucher       = getVoucherModel(req.db);
  const AccountHead   = getAccountHeadModel(req.db);

  const { payrollId, paymentDate, paymentMode, paidAmount, transactionReference, remarks } = req.body;

  if (!payrollId)   return apiError(res, 400, false, "payrollId is required");
  if (!paymentDate) return apiError(res, 400, false, "paymentDate is required");
  if (!paymentMode) return apiError(res, 400, false, "paymentMode is required");
  if (!paidAmount || Number(paidAmount) <= 0)
    return apiError(res, 400, false, "paidAmount must be > 0");

  const payroll = await Payroll.findById(payrollId)
    .populate({ path: "staff", select: "employeeName employeeCode" });
  if (!payroll) return apiError(res, 404, false, "Payroll not found");

  if (Number(paidAmount) > payroll.netSalary)
    return apiError(res, 400, false,
      `paidAmount (${paidAmount}) cannot exceed netSalary (${payroll.netSalary})`
    );

  // Record payment
  const payment = await SalaryPayment.create({
    payroll:              payrollId,
    staff:                payroll.staff,
    salaryMonth:          payroll.salaryMonth,
    paymentDate,
    paymentMode,
    paidAmount:           Number(paidAmount),
    transactionReference: transactionReference || "",
    remarks:              remarks || "",
  });

  // Update payroll status
  payroll.paymentStatus = Number(paidAmount) >= payroll.netSalary ? "Paid" : "Partially Paid";
  await payroll.save();

  // ── Auto-create Expense Voucher ───────────────────────────
  try {
    // Find "Staff Salary" expense head
    let salaryHead = await AccountHead.findOne({
      accountType: "Expense",
      accountName: { $regex: /staff.?salary/i },
    }).lean();
    if (!salaryHead) {
      salaryHead = await AccountHead.findOne({
        accountType: "Expense",
        accountName: { $regex: /salary/i },
      }).lean();
    }

    if (salaryHead) {
      const dupCheck = await Voucher.findOne({
        sourceReferenceId: payment._id.toString(),
        status: "Active",
      });

      if (!dupCheck) {
        const year   = new Date().getFullYear();
        const count  = await Voucher.countDocuments({ voucherType: "Expense" }) + 1;
        const vNum   = `EXP-${year}-${String(count).padStart(4, "0")}`;

        await Voucher.create({
          voucherNumber:     vNum,
          voucherDate:       new Date(paymentDate),
          voucherType:       "Expense",
          paymentMode,
          referenceNumber:   transactionReference || "",
          remarks:           `Salary — ${payroll.staff?.employeeName || ""} — ${payroll.salaryMonth}`,
          totalAmount:       Number(paidAmount),
          sourceModule:      "Payroll",
          sourceReferenceId: payment._id.toString(),
          status:            "Active",
          transactions: [{
            accountHead: salaryHead._id,
            amount:      Number(paidAmount),
            remarks:     `Salary: ${payroll.staff?.employeeName || ""} (${payroll.salaryMonth})`,
          }],
          createdBy: req.user?._id,
        });
      }
    }
  } catch (vErr) {
    // Never fail the payment if voucher creation breaks
    console.error("[Payroll] Auto-voucher failed:", vErr?.message);
  }

  return res.status(201).json(new apiResponse(201, payment, "Salary payment recorded"));
});

// ── GET PAYMENTS ──────────────────────────────────────────────────────────────
export const getPayments = asyncHandler(async (req, res) => {
  const SalaryPayment = getSalaryPaymentModel(req.db);
  const { salaryMonth, staffId, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (salaryMonth) filter.salaryMonth = salaryMonth;
  if (staffId)     filter.staff       = staffId;

  const skip = (Number(page) - 1) * Number(limit);

  const [payments, total] = await Promise.all([
    SalaryPayment.find(filter)
      .populate({
        path:    "staff",
        select:  "employeeName employeeCode department",
        populate: { path: "department", select: "name" },
      })
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    SalaryPayment.countDocuments(filter),
  ]);

  return res.status(200).json(new apiResponse(200, {
    payments, total, page: Number(page), limit: Number(limit),
  }, "Payments fetched"));
});

// ── GET SALARY SLIP ───────────────────────────────────────────────────────────
export const getSalarySlip = asyncHandler(async (req, res) => {
  const Payroll       = getPayrollModel(req.db);
  const SalaryPayment = getSalaryPaymentModel(req.db);

  const p = await Payroll.findById(req.params.id)
    .populate({
      path:    "staff",
      select:  "employeeName employeeCode staffType monthlySalary department designation dateOfJoining bankName accountNumber ifscCode",
      populate: [
        { path: "department",  select: "name" },
        { path: "designation", select: "name" },
      ],
    })
    .lean();

  if (!p) return apiError(res, 404, false, "Payroll not found");

  const payments = await SalaryPayment.find({ payroll: req.params.id })
    .sort({ paymentDate: 1 })
    .lean();

  const totalPaid = payments.reduce((s, pay) => s + (pay.paidAmount || 0), 0);

  return res.status(200).json(new apiResponse(200, {
    ...p,
    payments,
    totalPaid,
    schoolName: req.tenant?.schoolName || "School",
    schoolLogo: req.tenant?.logo       || "",
  }, "Salary slip fetched"));
});
