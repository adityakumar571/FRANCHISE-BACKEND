import Tenant from "../models/tenant.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import User from "../models/user.modal.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getTenantDashboard = asyncHandler(async (req, res) => {

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // ── Tenants ──────────────────────────────────────────────
    const tenants = await Tenant.find().lean();
    const totalFranchises   = tenants.length;
    const activeFranchises  = tenants.filter(t => t.isActive).length;
    const inactiveFranchises = tenants.filter(t => !t.isActive).length;
    const thisMonthFranchises = tenants.filter(t => new Date(t.createdAt) >= thisMonthStart).length;

    // ── Subscriptions ─────────────────────────────────────────
    const subscriptions = await TenantSubscription.find().lean();
    const activeSubscriptions = subscriptions.filter(s =>
        s.status === 'ACTIVE' &&
        new Date(s.currentPlan?.endDate) >= now
    ).length;
    const trialSubscriptions = subscriptions.filter(s => s.status === 'TRIAL').length;
    const totalRevenue = subscriptions.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

    // ── Expiring Soon (within 7 days) ─────────────────────────
    const expiringSoon = subscriptions
        .filter(s => {
            const end = new Date(s.currentPlan?.endDate);
            return end >= now && end <= sevenDaysLater;
        })
        .map(s => {
            const tenant = tenants.find(t => t._id.toString() === s.tenantId?.toString());
            const daysLeft = Math.ceil((new Date(s.currentPlan?.endDate) - now) / 86400000);
            return {
                franchiseName: tenant?.schoolName || 'Unknown',
                planName: s.currentPlan?.name || 'Basic',
                daysLeft,
            };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft);

    // ── Admins ────────────────────────────────────────────────
    const admins = await User.find().lean();
    const totalAdmins  = admins.length;
    const activeAdmins = admins.filter(u => u.isActive).length;

    // ── Distributors ──────────────────────────────────────────
    let distributors = [];
    try {
        const { default: Distributor } = await import("../models/distributor.model.js");
        distributors = await Distributor.find().lean();
    } catch { /* model may not exist */ }
    const totalDistributors  = distributors.length;
    const activeDistributors = distributors.filter(d => d.isActive).length;

    // ── Recent Franchises ─────────────────────────────────────
    const recentFranchises = await Tenant.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

    const recentFranchisesFormatted = recentFranchises.map(t => {
        const sub = subscriptions.find(s => s.tenantId?.toString() === t._id.toString());
        return {
            _id: t._id,
            schoolName: t.schoolName || t.name,
            city: t.city || '—',
            state: t.state || '—',
            planName: sub?.currentPlan?.name || 'Trial',
            isActive: t.isActive,
            subdomain: t.subdomain,
            createdAt: t.createdAt,
        };
    });

    // ── State Distribution ────────────────────────────────────
    const stateMap = {};
    tenants.forEach(t => {
        const state = t.state || 'Unknown';
        if (!stateMap[state]) stateMap[state] = { state, total: 0, active: 0, inactive: 0 };
        stateMap[state].total++;
        if (t.isActive) stateMap[state].active++;
        else stateMap[state].inactive++;
    });
    const stateDistribution = Object.values(stateMap).sort((a, b) => b.total - a.total).slice(0, 10);

    return res.status(200).json(
        new apiResponse(200, {
            franchises: {
                total:      totalFranchises,
                active:     activeFranchises,
                inactive:   inactiveFranchises,
                thisMonth:  thisMonthFranchises,
            },
            subscriptions: {
                total:        subscriptions.length,
                active:       activeSubscriptions,
                trial:        trialSubscriptions,
                totalRevenue,
            },
            admins: {
                total:    totalAdmins,
                active:   activeAdmins,
                inactive: totalAdmins - activeAdmins,
            },
            distributors: {
                total:        totalDistributors,
                active:       activeDistributors,
                distributors: totalDistributors,
                wholesalers:  0,
            },
            alerts: {
                expiringSoonCount: expiringSoon.length,
                expiringSoon,
            },
            recentFranchises: recentFranchisesFormatted,
            stateDistribution,
        }, "Dashboard stats fetched successfully 🚀")
    );
});
