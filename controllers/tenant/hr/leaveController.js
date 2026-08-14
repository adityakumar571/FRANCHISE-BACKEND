import { getLeaveModel }                               from "../../../models/tenant/hr/Leave.model.js";
import { getStaffModel }                               from "../../../models/tenant/hr/Staff.model.js";
import { getAttendanceHRModel }                        from "../../../models/tenant/hr/Attendance.model.js";
import { toDateOnly, leaveTypeToAttendanceStatus }     from "./attendanceController.js";
import { apiResponse }                                 from "../../../utils/apiResponse.js";
import { asyncHandler }                                from "../../../utils/asyncHandler.js";
import { apiError }                                    from "../../../utils/apiError.js";

// ── Helper: count days between two dates (inclusive) ─────────────────────────
const countDays = (fromDate, toDate) => {
  const from = toDateOnly(fromDate);
  const to   = toDateOnly(toDate);
  const diff = to - from;
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000) + 1;
};

// ── Helper: generate all dates between fromDate and toDate ───────────────────
// FIX: use `let` instead of `const` so we can call setUTCDate on it
const getDateRange = (fromDate, toDate) => {
  const dates = [];
  let current = toDateOnly(fromDate);   // ← was `const` — caused runtime crash
  const end   = toDateOnly(toDate);
  while (current <= end) {
    dates.push(new Date(current));
    current = new Date(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

// ── APPLY LEAVE ───────────────────────────────────────────────────────────────
export const applyLeave = asyncHandler(async (req, res) => {
  const Leave = getLeaveModel(req.db);
  const Staff = getStaffModel(req.db);

  const { staff, leaveType, fromDate, toDate, reason } = req.body;

  if (!staff)     return apiError(res, 400, false, "staff is required");
  if (!leaveType) return apiError(res, 400, false, "leaveType is required");
  if (!fromDate)  return apiError(res, 400, false, "fromDate is required");
  if (!toDate)    return apiError(res, 400, false, "toDate is required");

  const from = toDateOnly(fromDate);
  const to   = toDateOnly(toDate);

  if (to < from) return apiError(res, 400, false, "toDate must be on or after fromDate");

  const staffExists = await Staff.findById(staff).lean();
  if (!staffExists) return apiError(res, 404, false, "Staff not found");

  const totalDays = countDays(from, to);

  // Check overlapping leave
  const overlap = await Leave.findOne({
    staff,
    status: { $in: ["Pending", "Approved"] },
    $or: [{ fromDate: { $lte: to }, toDate: { $gte: from } }],
  });
  if (overlap) return apiError(res, 409, false, "An overlapping leave already exists for this period");

  const leave = await Leave.create({
    staff,
    leaveType,
    fromDate: from,
    toDate:   to,
    totalDays,
    reason:   reason || "",
    status:   "Pending",
  });

  await leave.populate([
    { path: "staff", select: "employeeName employeeCode department designation" },
  ]);

  return res.status(201).json(new apiResponse(201, leave, "Leave applied successfully"));
});

// ── GET ALL LEAVES ────────────────────────────────────────────────────────────
export const getLeaves = asyncHandler(async (req, res) => {
  const Leave = getLeaveModel(req.db);

  const { staffId, status, month, department, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (staffId) filter.staff  = staffId;
  if (status)  filter.status = status;

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    if (!year || !mon) return apiError(res, 400, false, "month must be in YYYY-MM format");
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end   = new Date(Date.UTC(year, mon, 1));
    filter.$or = [
      { fromDate: { $gte: start, $lt: end } },
      { toDate:   { $gte: start, $lt: end } },
      { fromDate: { $lt: start }, toDate: { $gte: end } },
    ];
  }

  const skip  = (Number(page) - 1) * Number(limit);

  let query = Leave.find(filter)
    .populate({
      path:    "staff",
      select:  "employeeName employeeCode department designation",
      populate: [
        { path: "department",  select: "name" },
        { path: "designation", select: "name" },
      ],
    })
    .populate("approvedBy", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  // department filter — post populate
  const [allLeaves, total] = await Promise.all([
    query.lean(),
    Leave.countDocuments(filter),
  ]);

  const leaves = department
    ? allLeaves.filter((l) => l.staff?.department?._id?.toString() === department)
    : allLeaves;

  return res.status(200).json(
    new apiResponse(200, { leaves, total: department ? leaves.length : total, page: Number(page), limit: Number(limit) }, "Leaves fetched successfully")
  );
});

// ── GET LEAVE BY ID ───────────────────────────────────────────────────────────
export const getLeaveById = asyncHandler(async (req, res) => {
  const Leave = getLeaveModel(req.db);

  const leave = await Leave.findById(req.params.id)
    .populate({
      path:    "staff",
      select:  "employeeName employeeCode department designation",
      populate: [
        { path: "department",  select: "name" },
        { path: "designation", select: "name" },
      ],
    })
    .populate("approvedBy", "name email")
    .lean();

  if (!leave) return apiError(res, 404, false, "Leave not found");
  return res.status(200).json(new apiResponse(200, leave, "Leave fetched successfully"));
});

// ── UPDATE LEAVE STATUS ───────────────────────────────────────────────────────
export const updateLeaveStatus = asyncHandler(async (req, res) => {
  const Leave      = getLeaveModel(req.db);
  const Attendance = getAttendanceHRModel(req.db);

  const { status, remarks } = req.body;

  if (!status) return apiError(res, 400, false, "status is required");
  if (!["Approved", "Rejected"].includes(status))
    return apiError(res, 400, false, 'status must be "Approved" or "Rejected"');

  const leave = await Leave.findById(req.params.id);
  if (!leave) return apiError(res, 404, false, "Leave not found");

  if (leave.status !== "Pending")
    return apiError(res, 409, false, `Leave is already ${leave.status}`);

  leave.status     = status;
  leave.remarks    = remarks || "";
  leave.approvedBy = req.user?._id;
  leave.approvedAt = new Date();

  await leave.save();

  // If approved → auto-mark attendance for each leave day
  if (status === "Approved") {
    const attendanceStatus = leaveTypeToAttendanceStatus(leave.leaveType);
    const dates = getDateRange(leave.fromDate, leave.toDate);

    if (dates.length > 0) {
      const bulkOps = dates.map((date) => ({
        updateOne: {
          filter: { staff: leave.staff, date },
          update: {
            $set: {
              staff:    leave.staff,
              date,
              status:   attendanceStatus,
              remarks:  `Auto: ${leave.leaveType}`,
              markedBy: req.user?._id,
            },
          },
          upsert: true,
        },
      }));
      await Attendance.bulkWrite(bulkOps, { ordered: false });
    }
  }

  await leave.populate([
    { path: "staff",      select: "employeeName employeeCode department designation" },
    { path: "approvedBy", select: "name email" },
  ]);

  return res.status(200).json(
    new apiResponse(200, leave, `Leave ${status.toLowerCase()} successfully`)
  );
});

// ── DELETE LEAVE ──────────────────────────────────────────────────────────────
export const deleteLeave = asyncHandler(async (req, res) => {
  const Leave = getLeaveModel(req.db);

  const leave = await Leave.findById(req.params.id);
  if (!leave) return apiError(res, 404, false, "Leave not found");

  if (leave.status !== "Pending")
    return apiError(res, 409, false, "Only Pending leaves can be deleted");

  await leave.deleteOne();
  return res.status(200).json(new apiResponse(200, null, "Leave deleted successfully"));
});
