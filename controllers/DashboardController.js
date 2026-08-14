import Tenant from "../models/tenant.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getTenantDashboard = asyncHandler(async (req, res) => {

    const stats = await Tenant.aggregate([
        {
            $group: {
                _id: null,
                totalTenants: { $sum: 1 },
                activeTenants: {
                    $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
                },
                inactiveTenants: {
                    $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] },
                },
            },
        },
    ]);

    const result = stats[0] || { totalTenants: 0, activeTenants: 0, inactiveTenants: 0 };

    // Recent 5 schools
    const recentSchools = await Tenant.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("schoolName subdomain isActive logo createdAt");

    // Subscription stats
    const now = new Date();
    const subStats = await TenantSubscription.aggregate([
        {
            $group: {
                _id: null,
                totalSubscriptions: { $sum: 1 },
                activeSubscriptions: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$status", "ACTIVE"] },
                                    { $lte: ["$currentPlan.startDate", now] },
                                    { $gte: ["$currentPlan.endDate", now] },
                                ],
                            },
                            1, 0,
                        ],
                    },
                },
                totalRevenue: { $sum: "$currentPlan.price" },
                totalStudentLimit: { $sum: "$totalStudentLimit" },
                totalUsedStudents: { $sum: "$usedStudents" },
            },
        },
    ]);

    const subResult = subStats[0] || {
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        totalRevenue: 0,
        totalStudentLimit: 0,
        totalUsedStudents: 0,
    };

    return res.status(200).json(
        new apiResponse(
            200,
            {
                ...result,
                recentSchools,
                subscriptions: subResult,
            },
            "Dashboard stats fetched successfully 🚀"
        )
    );
});