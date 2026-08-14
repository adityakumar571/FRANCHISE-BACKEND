import { getStaffModel }          from "../../../models/tenant/hr/Staff.model.js";
import { getAttendanceHRModel }   from "../../../models/tenant/hr/Attendance.model.js";
import { getLeaveModel }          from "../../../models/tenant/hr/Leave.model.js";
import { getPayrollModel }        from "../../../models/tenant/hr/Payroll.model.js";
import { getSalaryPaymentModel }  from "../../../models/tenant/hr/SalaryPayment.model.js";
import { getVoucherModel }        from "../../../models/tenant/hr/Voucher.model.js";
import { apiResponse }            from "../../../utils/apiResponse.js";
import { asyncHandler }           from "../../../utils/asyncHandler.js";

export const getHRDashboard = asyncHandler(async (req, res) => {
  const Staff      = getStaffModel(req.db);
  const Attendance = getAttendanceHRModel(req.db);
  const Leave      = getLeaveModel(req.db);
  const Payroll    = getPayrollModel(req.db);
  const SalPay     = getSalaryPaymentModel(req.db);
  const Voucher    = getVoucherModel(req.db);

  const today = new Date();

  // ── Today date range (UTC-safe) ─────────────────────────────────────────
  const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
  const endOfDay   = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

  // ── Current month range ─────────────────────────────────────────────────
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd   = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const currentMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  // ── Latest month that has attendance data (fallback for today=0 case) ───
  const latestAttRecord = await Attendance.findOne({}).sort({ date: -1 }).lean();
  const latestDate      = latestAttRecord?.date ? new Date(latestAttRecord.date) : today;
  const latestDayStart  = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), latestDate.getUTCDate(), 0, 0, 0, 0));
  const latestDayEnd    = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), latestDate.getUTCDate(), 23, 59, 59, 999));

  // ── Latest month that has payroll data ──────────────────────────────────
  const latestPayroll   = await Payroll.findOne({}).sort({ salaryMonth: -1 }).lean();
  const latestPayMonth  = latestPayroll?.salaryMonth || currentMonth;

  const [
    totalStaff,
    teachingStaff,
    nonTeachingStaff,
    activeStaff,
    inactiveStaff,
    recentStaff,
    todayAttendance,
    latestDayAttendance,
    pendingLeaves,
    approvedLeavesThisMonth,
    payrollThisMonth,
    salaryPaymentsThisMonth,
    vouchersThisMonth,
    departmentWiseStaff,
  ] = await Promise.all([
    Staff.countDocuments({}),
    Staff.countDocuments({ staffType: "Teaching" }),
    Staff.countDocuments({ staffType: "Non-Teaching" }),
    Staff.countDocuments({ isActive: true }),
    Staff.countDocuments({ isActive: false }),

    // 5 most recently joined staff
    Staff.find({})
      .populate("department",  "name")
      .populate("designation", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .select("employeeName employeeCode staffType department designation photo isActive dateOfJoining monthlySalary")
      .lean(),

    // Attendance for actual today
    Attendance.find({ date: { $gte: startOfDay, $lte: endOfDay } }).lean(),

    // Attendance for latest date that has data (shows real numbers even if today=0)
    Attendance.find({ date: { $gte: latestDayStart, $lte: latestDayEnd } }).lean(),

    // Pending leave requests
    Leave.find({ status: "Pending" })
      .populate({
        path:    "staff",
        select:  "employeeName employeeCode department designation",
        populate: [
          { path: "department",  select: "name" },
          { path: "designation", select: "name" },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    // Approved leaves this month
    Leave.countDocuments({
      status:   "Approved",
      fromDate: { $gte: monthStart, $lt: monthEnd },
    }),

    // Payroll for latest available month
    Payroll.find({ salaryMonth: latestPayMonth })
      .populate({ path: "staff", select: "employeeName employeeCode staffType department", populate: { path: "department", select: "name" } })
      .lean(),

    // Salary payments this month
    SalPay.find({ paymentDate: { $gte: monthStart, $lt: monthEnd } }).lean(),

    // Vouchers this month
    Voucher.find({ voucherDate: { $gte: monthStart, $lt: monthEnd }, status: "Active" }).lean(),

    // Department-wise staff count
    Staff.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
      {
        $lookup: {
          from:         "hrdepartments",
          localField:   "_id",
          foreignField: "_id",
          as:           "dept",
        },
      },
      { $unwind: { path: "$dept", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, name: { $ifNull: ["$dept.name", "Unassigned"] }, count: 1 } },
      { $sort: { count: -1 } },
    ]),
  ]);

  // ── Today's attendance summary ───────────────────────────────────────────
  const attSource      = todayAttendance.length > 0 ? todayAttendance : latestDayAttendance;
  const attDateUsed    = todayAttendance.length > 0 ? today : latestDate;
  const attMarkedToday = todayAttendance.length > 0;

  const presentToday   = attSource.filter((a) => a.status === "Present" || a.status === "Half Day").length;
  const absentToday    = attSource.filter((a) => a.status === "Absent").length;
  const onLeave        = attSource.filter((a) => a.status === "Paid Leave" || a.status === "Unpaid Leave").length;
  const weeklyOff      = attSource.filter((a) => a.status === "Weekly Off" || a.status === "Holiday").length;
  const attendanceTotal = attSource.length;

  // ── Payroll summary ─────────────────────────────────────────────────────
  const totalSalaryBill = payrollThisMonth.reduce((s, p) => s + (p.netSalary || 0), 0);
  const paidSalary      = payrollThisMonth.filter((p) => p.paymentStatus === "Paid").reduce((s, p) => s + (p.netSalary || 0), 0);
  const unpaidSalary    = payrollThisMonth.filter((p) => p.paymentStatus === "Unpaid").reduce((s, p) => s + (p.netSalary || 0), 0);
  const paidCount       = payrollThisMonth.filter((p) => p.paymentStatus === "Paid").length;
  const unpaidCount     = payrollThisMonth.filter((p) => p.paymentStatus === "Unpaid").length;
  const partialCount    = payrollThisMonth.filter((p) => p.paymentStatus === "Partially Paid").length;
  const onHoldCount     = payrollThisMonth.filter((p) => p.paymentStatus === "On Hold").length;

  // Unpaid staff list (for dashboard quick view)
  const unpaidStaffList = payrollThisMonth
    .filter((p) => p.paymentStatus === "Unpaid" || p.paymentStatus === "Partially Paid")
    .slice(0, 5)
    .map((p) => ({
      staffName:     p.staff?.employeeName || "",
      employeeCode:  p.staff?.employeeCode || "",
      department:    p.staff?.department?.name || "",
      netSalary:     p.netSalary,
      paymentStatus: p.paymentStatus,
    }));

  // ── Accounts summary this month ─────────────────────────────────────────
  const totalIncome  = vouchersThisMonth.filter((v) => v.voucherType === "Income").reduce((s, v) => s + (v.totalAmount || 0), 0);
  const totalExpense = vouchersThisMonth.filter((v) => v.voucherType === "Expense").reduce((s, v) => s + (v.totalAmount || 0), 0);

  // ── Total salary disbursed this month via SalaryPayments ────────────────
  const totalDisbursed = salaryPaymentsThisMonth.reduce((s, p) => s + (p.paidAmount || 0), 0);

  return res.status(200).json(
    new apiResponse(200, {

      // ── Staff overview ───────────────────────────────────────────────────
      staffOverview: {
        total:          totalStaff,
        active:         activeStaff,
        inactive:       inactiveStaff,
        teaching:       teachingStaff,
        nonTeaching:    nonTeachingStaff,
      },

      // ── Attendance (latest available day) ──────────────────────────────
      attendance: {
        date:           attDateUsed,
        isToday:        attMarkedToday,
        markedCount:    attendanceTotal,
        present:        presentToday,
        absent:         absentToday,
        onLeave,
        weeklyOff,
        notMarked:      Math.max(0, activeStaff - attendanceTotal),
        attendanceRate: attendanceTotal > 0
          ? Math.round((presentToday / attendanceTotal) * 100)
          : 0,
      },

      // ── Leave summary ───────────────────────────────────────────────────
      leaves: {
        pendingCount:         pendingLeaves.length,
        approvedThisMonth:    approvedLeavesThisMonth,
        pendingList:          pendingLeaves,
      },

      // ── Payroll summary (latest month) ─────────────────────────────────
      payroll: {
        month:            latestPayMonth,
        generated:        payrollThisMonth.length,
        totalSalaryBill,
        paidSalary,
        unpaidSalary,
        totalDisbursed,
        paidCount,
        unpaidCount,
        partialCount,
        onHoldCount,
        unpaidStaffList,
      },

      // ── Accounts this month ─────────────────────────────────────────────
      accounts: {
        month:        currentMonth,
        totalIncome,
        totalExpense,
        netBalance:   totalIncome - totalExpense,
        voucherCount: vouchersThisMonth.length,
      },

      // ── Department breakdown ────────────────────────────────────────────
      departmentWiseStaff,

      // ── Recent joinings ─────────────────────────────────────────────────
      recentStaff,

    }, "HR Dashboard fetched successfully")
  );
});
