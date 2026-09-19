import ActivityLog from "../models/ActivityLog.model.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* ─────────────────────────────────────────────────────────────
   GET /api/activity-logs
   Query params:
     page      (default 1)
     limit     (default 20)
     search    (matches user or action, case-insensitive)
     type      (Create | Update | Delete | Login | System | Other)
     module    (Auth | Franchise | Billing | Users | System …)
     from      (ISO date string — filter createdAt >= from)
     to        (ISO date string — filter createdAt <= to)
─────────────────────────────────────────────────────────────── */
export const getActivityLogs = asyncHandler(async (req, res) => {
  let { page = 1, limit = 20, search = "", type, module: mod, from, to } = req.query;

  page  = Math.max(1, parseInt(page));
  limit = Math.min(100, Math.max(1, parseInt(limit)));

  const query = {};

  if (search) {
    query.$or = [
      { user:   { $regex: search, $options: "i" } },
      { action: { $regex: search, $options: "i" } },
      { target: { $regex: search, $options: "i" } },
    ];
  }

  if (type   && type   !== "All") query.type   = type;
  if (mod    && mod    !== "All") query.module  = mod;

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query.createdAt.$lte = toDate;
    }
  }

  const [total, logs] = await Promise.all([
    ActivityLog.countDocuments(query),
    ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return res.status(200).json(
    new apiResponse(200, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: logs,
    }, "Activity logs fetched ✅")
  );
});

/* ─────────────────────────────────────────────────────────────
   POST /api/activity-logs  — Manually create a log entry
   (Used by the frontend or other services if needed)
─────────────────────────────────────────────────────────────── */
export const createActivityLog = asyncHandler(async (req, res) => {
  const { user, action, target, module: mod, type, ip, meta } = req.body;

  if (!action) {
    return res.status(400).json(new apiResponse(400, null, "action is required"));
  }

  const log = await ActivityLog.create({
    user:   user   || req.user?.name || "System",
    userId: req.user?._id || null,
    action,
    target: target || "System",
    module: mod    || "Other",
    type:   type   || "Other",
    ip:     ip     || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "Unknown",
    meta:   meta   || {},
  });

  return res.status(201).json(new apiResponse(201, log, "Activity log created ✅"));
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/activity-logs/:id
─────────────────────────────────────────────────────────────── */
export const deleteActivityLog = asyncHandler(async (req, res) => {
  const deleted = await ActivityLog.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json(new apiResponse(404, null, "Log not found"));
  }
  return res.status(200).json(new apiResponse(200, null, "Log deleted ✅"));
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/activity-logs/clear-all  — Clear all logs
   (Protected — only SuperAdmin should call this)
─────────────────────────────────────────────────────────────── */
export const clearAllLogs = asyncHandler(async (req, res) => {
  const result = await ActivityLog.deleteMany({});
  return res.status(200).json(
    new apiResponse(200, { deletedCount: result.deletedCount }, "All logs cleared ✅")
  );
});
