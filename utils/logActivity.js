/**
 * logActivity — helper to create an activity log entry from anywhere in the app
 *
 * Usage:
 *   import { logActivity } from '../utils/logActivity.js';
 *   await logActivity({ user: 'Rajesh Kumar', userId: req.user?._id, action: 'Created Franchise',
 *                        target: 'Sharma Medical', module: 'Franchise', type: 'Create', ip: req.ip });
 */
import ActivityLog from "../models/ActivityLog.model.js";

/**
 * @param {object} opts
 * @param {string}   opts.user    - Display name of the actor (e.g. "Rajesh Kumar")
 * @param {object}   [opts.userId]- ObjectId reference to User model
 * @param {string}   opts.action  - What happened (e.g. "Created Franchise")
 * @param {string}   [opts.target]- What was acted upon (e.g. "Sharma Medical Store")
 * @param {string}   [opts.module]- Module name (Auth | Franchise | Billing | Users | System …)
 * @param {string}   [opts.type]  - Action type (Create | Update | Delete | Login | System …)
 * @param {string}   [opts.ip]    - IP address of the requester
 * @param {object}   [opts.meta]  - Any additional metadata
 */
export const logActivity = async (opts = {}) => {
  try {
    await ActivityLog.create({
      user:   opts.user   || "System",
      userId: opts.userId || null,
      action: opts.action || "Unknown Action",
      target: opts.target || "System",
      module: opts.module || "Other",
      type:   opts.type   || "Other",
      ip:     opts.ip     || "System",
      meta:   opts.meta   || {},
    });
  } catch (err) {
    // Never let a logging failure crash the main request
    console.error("[ActivityLog] Failed to write log:", err.message);
  }
};

/** Convenience wrapper — extracts IP and user from an express `req` object */
export const logFromReq = (req, opts = {}) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "Unknown";

  return logActivity({
    ...opts,
    userId: opts.userId ?? req.user?._id ?? null,
    user:   opts.user   ?? req.user?.name ?? "System",
    ip,
  });
};
