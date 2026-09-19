import Tenant from "../models/tenant.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import User from "../models/user.modal.js";
import Distributor from "../models/Distributor.model.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* ─────────────────────────────────────────────────────────────
   GET /api/saas/dashboard
   SuperAdmin dashboard — aggregated stats across entire network
───────────────────────────────────────────────────────────── */
export const getTenantDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo  = new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAhead  = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000);

  // ── 1. Franchise stats ────────────────────────────────────────
  const [franchiseStats] = await Tenant.aggregate([
    {
      $group: {
        _id:             null,
        total:           { $sum: 1 },
        active:          { $sum: { $cond: [{ $eq: ["$isActive", true]  }, 1, 0] } },
        inactive:        { $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] } },
        thisMonth:       { $sum: { $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0] } },
      },
    },
  ]);

  // ── 2. Subscription stats ─────────────────────────────────────
  const [subStats] = await TenantSubscription.aggregate([
    {
      $group: {
        _id:               null,
        totalSubscriptions:{ $sum: 1 },
        active: {
          $sum: {
            $cond: [
              { $and: [
                { $eq:  ["$status", "ACTIVE"] },
                { $gte: ["$currentPlan.endDate", now] },
              ]},
              1, 0,
            ],
          },
        },
        trial:      { $sum: { $cond: [{ $eq: ["$isTrial", true]  }, 1, 0] } },
        totalRevenue: { $sum: "$currentPlan.price" },
      },
    },
  ]);

  // ── 3. Expiring soon (within 7 days) ─────────────────────────
  const expiringSoon = await TenantSubscription.aggregate([
    {
      $match: {
        "currentPlan.endDate": { $gte: now, $lte: sevenDaysAhead },
        status: "ACTIVE",
      },
    },
    {
      $lookup: {
        from:         "tenants",
        localField:   "tenantId",
        foreignField: "_id",
        as:           "franchise",
      },
    },
    { $unwind: { path: "$franchise", preserveNullAndEmpty: true } },
    {
      $project: {
        _id: 1,
        franchiseName: "$franchise.schoolName",
        planName:      "$currentPlan.name",
        endDate:       "$currentPlan.endDate",
        daysLeft: {
          $ceil: {
            $divide: [
              { $subtract: ["$currentPlan.endDate", now] },
              86400000,
            ],
          },
        },
      },
    },
    { $sort: { endDate: 1 } },
  ]);

  // ── 4. Expiring within 30 days (alerts count) ─────────────────
  const expiringCount = await TenantSubscription.countDocuments({
    "currentPlan.endDate": { $gte: now, $lte: thirtyDaysAhead },
    status: "ACTIVE",
  });

  // ── 5. Admin stats ────────────────────────────────────────────
  const [adminStats] = await User.aggregate([
    { $match: { role: { $in: ["Admin", "SuperAdmin"] } } },
    {
      $group: {
        _id:      null,
        total:    { $sum: 1 },
        active:   { $sum: { $cond: [{ $eq: ["$isActive", true]  }, 1, 0] } },
        inactive: { $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] } },
      },
    },
  ]);

  // ── 6. Distributor stats ──────────────────────────────────────
  const [distStats] = await Distributor.aggregate([
    {
      $group: {
        _id:          null,
        total:        { $sum: 1 },
        active:       { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
        distributors: { $sum: { $cond: [{ $eq: ["$type", "Distributor"] }, 1, 0] } },
        wholesalers:  { $sum: { $cond: [{ $eq: ["$type", "Wholesaler"]  }, 1, 0] } },
      },
    },
  ]);

  // ── 7. Recent 5 franchises ────────────────────────────────────
  const recentFranchises = await Tenant.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select("schoolName subdomain isActive logo createdAt city state franchiseAdminName");

  // ── 8. State distribution ─────────────────────────────────────
  const stateDistribution = await Tenant.aggregate([
    {
      $group: {
        _id:      "$state",
        total:    { $sum: 1 },
        active:   { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
        inactive: { $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] } },
      },
    },
    { $match: { _id: { $ne: null } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
    {
      $project: {
        state:    "$_id",
        total:    1,
        active:   1,
        inactive: 1,
        _id: 0,
      },
    },
  ]);

  // ── 9. Subscription plan distribution ────────────────────────
  const planDistribution = await TenantSubscription.aggregate([
    {
      $group: {
        _id:   "$currentPlan.name",
        count: { $sum: 1 },
      },
    },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 } },
  ]);

  return res.status(200).json(
    new apiResponse(200, {
      franchises: {
        total:     franchiseStats?.total     || 0,
        active:    franchiseStats?.active    || 0,
        inactive:  franchiseStats?.inactive  || 0,
        thisMonth: franchiseStats?.thisMonth || 0,
      },
      subscriptions: {
        total:        subStats?.totalSubscriptions || 0,
        active:       subStats?.active             || 0,
        trial:        subStats?.trial              || 0,
        totalRevenue: subStats?.totalRevenue       || 0,
      },
      admins: {
        total:    adminStats?.total    || 0,
        active:   adminStats?.active   || 0,
        inactive: adminStats?.inactive || 0,
      },
      distributors: {
        total:        distStats?.total        || 0,
        active:       distStats?.active       || 0,
        distributors: distStats?.distributors || 0,
        wholesalers:  distStats?.wholesalers  || 0,
      },
      alerts: {
        expiringSoonCount: expiringCount,
        expiringSoon,
      },
      recentFranchises,
      stateDistribution,
      planDistribution,
    }, "Dashboard stats fetched successfully 🚀")
  );
});
