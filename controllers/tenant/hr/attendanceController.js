import { getAttendanceHRModel } from "../../../models/tenant/hr/Attendance.model.js";
import { getStaffModel }        from "../../../models/tenant/hr/Staff.model.js";
import { apiResponse }          from "../../../utils/apiResponse.js";
import { asyncHandler }         from "../../../utils/asyncHandler.js";
import { apiError }             from "../../../utils/apiError.js";

// ── Helper: normalise a date to midnight UTC ──────────────────────────────────
const toDateOnly = (d) => {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
};

// ── Helper: map leaveType → attendance status ─────────────────────────────────
const leaveTypeToAttendanceStatus = (leaveType) => {
  const map = {
    "Casual Leave":  "Paid Leave",
    "Sick Leave":    "Paid Leave",
    "Paid Leave":    "Paid Leave",
    "Unpaid Leave":  "Unpaid Leave",
  };
  return map[leaveType] || "Absent";
};

// Shared staff populate config
const STAFF_POPULATE = {
  path:    "staff",
  select:  "employeeName employeeCode department designation",
  populate: [
    { path: "department",  select: "name" },
    { path: "designation", select: "name" },
  ],
};

// ── MARK ATTENDANCE (single, upsert) ──────────────────────────────────────────
export const markAttendance = asyncHandler(async (req, res) => {
  const Attendance = getAttendanceHRModel(req.db);
  const { staff, date, status, remarks } = req.body;

  if (!staff)  return apiError(res, 400, false, "staff is required");
  if (!date)   return apiError(res, 400, false, "date is required");
  if (!status) return apiError(res, 400, false, "status is required");

  const normalizedDate = toDateOnly(date);

  const record = await Attendance.findOneAndUpdate(
    { staff, date: normalizedDate },
    { staff, date: normalizedDate, status, remarks: remarks || "", markedBy: req.user?._id },
    { upsert: true, new: true, runValidators: true }
  );

  return res.status(200).json(new apiResponse(200, record, "Attendance marked successfully"));
});

// ── BULK MARK ATTENDANCE ──────────────────────────────────────────────────────
// Body: { date: "YYYY-MM-DD", records: [{ staff, status, remarks }] }
export const bulkMarkAttendance = asyncHandler(async (req, res) => {
  const Attendance = getAttendanceHRModel(req.db);
  const { date, records } = req.body;

  if (!date) return apiError(res, 400, false, "date is required");
  if (!Array.isArray(records) || records.length === 0)
    return apiError(res, 400, false, "records array is required and must not be empty");

  const normalizedDate = toDateOnly(date);

  const bulkOps = records.map(({ staff, status, remarks }) => ({
    updateOne: {
      filter: { staff, date: normalizedDate },
      update: {
        $set: {
          staff,
          date:     normalizedDate,
          status,
          remarks:  remarks || "",
          markedBy: req.user?._id,
        },
      },
      upsert: true,
    },
  }));

  const result = await Attendance.bulkWrite(bulkOps, { ordered: false });

  return res.status(200).json(new apiResponse(200, {
    matched:  result.matchedCount,
    modified: result.modifiedCount,
    upserted: result.upsertedCount,
  }, `Attendance marked for ${records.length} staff`));
});

// ── GET ATTENDANCE BY DATE ────────────────────────────────────────────────────
// GET /hr/attendance/by-date?date=YYYY-MM-DD
export const getAttendanceByDate = asyncHandler(async (req, res) => {
  const Attendance = getAttendanceHRModel(req.db);
  const { date, department } = req.query;

  if (!date) return apiError(res, 400, false, "date query param is required");

  const normalizedDate = toDateOnly(date);

  let records = await Attendance.find({ date: normalizedDate })
    .populate(STAFF_POPULATE)
    .populate("markedBy", "name")
    .lean();

  // optional department filter
  if (department) {
    records = records.filter(
      (r) => r.staff?.department?._id?.toString() === department
    );
  }

  return res.status(200).json(new apiResponse(200, {
    date:    normalizedDate,
    records,
    total:   records.length,
  }, "Attendance fetched successfully"));
});

// ── GET STAFF ATTENDANCE ──────────────────────────────────────────────────────
// GET /hr/attendance/staff?staffId=xxx&month=YYYY-MM
export const getStaffAttendance = asyncHandler(async (req, res) => {
  const Attendance = getAttendanceHRModel(req.db);
  const Staff      = getStaffModel(req.db);

  const { staffId, month } = req.query;
  if (!staffId) return apiError(res, 400, false, "staffId query param is required");

  const filter = { staff: staffId };

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    if (!year || !mon) return apiError(res, 400, false, "month must be YYYY-MM format");
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end   = new Date(Date.UTC(year, mon, 1));
    filter.date = { $gte: start, $lt: end };
  }

  const [staffInfo, records] = await Promise.all([
    Staff.findById(staffId)
      .populate("department",  "name")
      .populate("designation", "name")
      .lean(),
    Attendance.find(filter).sort({ date: 1 }).lean(),
  ]);

  const summary = {
    present: 0, absent: 0, halfDay: 0,
    paidLeave: 0, unpaidLeave: 0, holiday: 0, weeklyOff: 0,
  };

  records.forEach(({ status }) => {
    if      (status === "Present")       summary.present++;
    else if (status === "Absent")        summary.absent++;
    else if (status === "Half Day")      summary.halfDay++;
    else if (status === "Paid Leave")    summary.paidLeave++;
    else if (status === "Unpaid Leave")  summary.unpaidLeave++;
    else if (status === "Holiday")       summary.holiday++;
    else if (status === "Weekly Off")    summary.weeklyOff++;
  });

  return res.status(200).json(new apiResponse(200, {
    staffId,
    staff:   staffInfo,
    month:   month || null,
    records,
    summary,
    total:   records.length,
  }, "Staff attendance fetched successfully"));
});

// ── GET MONTHLY REGISTER ──────────────────────────────────────────────────────
// GET /hr/attendance/register?month=YYYY-MM&department=xxx
export const getMonthlyRegister = asyncHandler(async (req, res) => {
  const Attendance = getAttendanceHRModel(req.db);
  const Staff      = getStaffModel(req.db);

  const { month, department } = req.query;
  if (!month) return apiError(res, 400, false, "month query param is required (YYYY-MM)");

  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return apiError(res, 400, false, "month must be YYYY-MM format");

  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end   = new Date(Date.UTC(year, mon, 1));

  const staffFilter = { isActive: true };
  if (department) staffFilter.department = department;

  const staffList = await Staff.find(staffFilter)
    .populate("department",  "name")
    .populate("designation", "name")
    .lean();

  if (!staffList.length) {
    return res.status(200).json(
      new apiResponse(200, { month, staff: [], workingDays: 0 }, "No active staff found")
    );
  }

  const staffIds  = staffList.map((s) => s._id);
  const allRecords = await Attendance.find({
    staff: { $in: staffIds },
    date:  { $gte: start, $lt: end },
  }).lean();

  // attendance map: staffId → { dayNum: status }  (dayNum = 1-31)
  const attendanceMap = {};
  allRecords.forEach(({ staff, date, status }) => {
    const sid    = staff.toString();
    const dayNum = new Date(date).getUTCDate();
    if (!attendanceMap[sid]) attendanceMap[sid] = {};
    attendanceMap[sid][dayNum] = status;
  });

  // Working days = all days except Sundays
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(Date.UTC(year, mon - 1, d)).getUTCDay() !== 0) workingDays++;
  }

  const staffData = staffList.map((s) => {
    const sid        = s._id.toString();
    const attendance = attendanceMap[sid] || {};

    const summary = {
      present: 0, absent: 0, halfDay: 0,
      paidLeave: 0, unpaidLeave: 0, holiday: 0, weeklyOff: 0,
    };
    Object.values(attendance).forEach((status) => {
      if      (status === "Present")       summary.present++;
      else if (status === "Absent")        summary.absent++;
      else if (status === "Half Day")      summary.halfDay++;
      else if (status === "Paid Leave")    summary.paidLeave++;
      else if (status === "Unpaid Leave")  summary.unpaidLeave++;
      else if (status === "Holiday")       summary.holiday++;
      else if (status === "Weekly Off")    summary.weeklyOff++;
    });

    return {
      _id:          s._id,
      employeeName: s.employeeName,
      employeeCode: s.employeeCode,
      department:   s.department,
      designation:  s.designation,
      attendance,   // { 1: "Present", 2: "Absent", ... }
      summary,
    };
  });

  return res.status(200).json(new apiResponse(200, {
    month,
    staff: staffData,
    workingDays,
  }, "Monthly attendance register fetched successfully"));
});

// ── Exports for use in leaveController ───────────────────────────────────────
export { toDateOnly, leaveTypeToAttendanceStatus };
