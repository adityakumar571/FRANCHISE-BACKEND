import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import Tenant from "../models/tenant.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import User from "../models/user.modal.js";

/* ─────────────────────────────────────────────────────────────
   GET /api/superadmin/dashboard — Get dashboard KPIs and data
───────────────────────────────────────────────────────────── */
export const getDashboardData = asyncHandler(async (req, res) => {
    try {
        // Get all tenants
        const tenants = await Tenant.find().lean();
        const subscriptions = await TenantSubscription.find().lean();

        // Get all users (Super Admin main users)
        const users = await User.find({ role: "Super Admin" }).lean();

        // Calculate KPIs
        const totalFranchises = tenants.length;
        const activeFranchises = tenants.filter(t => t.isActive).length;
        const expiredFranchises = tenants.filter(t => !t.isActive).length;
        const totalUsers = users.length;

        // Calculate revenue (sum of all subscription revenues)
        const totalRevenue = subscriptions.reduce((sum, s) => {
            return sum + (s.totalAmount || 0);
        }, 0);

        const pendingPayments = subscriptions
            .filter(s => s.paidStatus !== "PAID")
            .reduce((sum, s) => sum + (s.totalAmount || 0), 0);

        // Revenue trend data from subscriptions (by month)
        const revenueByMonth = {};
        subscriptions.forEach(s => {
            const month = new Date(s.createdAt).toLocaleString('en-IN', { month: 'short', year: '2-digit' });
            revenueByMonth[month] = (revenueByMonth[month] || 0) + (s.totalAmount || 0);
        });
        
        const revenueData = Object.entries(revenueByMonth).map(([month, revenue]) => ({
            d: month,
            v: revenue
        }));

        // Franchise status distribution
        const franchiseStatusDistribution = [
            { 
                name: 'Active', 
                value: activeFranchises, 
                pct: ((activeFranchises / totalFranchises) * 100).toFixed(1) + '%', 
                color: '#10b981' 
            },
            { 
                name: 'Expired', 
                value: expiredFranchises, 
                pct: ((expiredFranchises / totalFranchises) * 100).toFixed(1) + '%', 
                color: '#f59e0b' 
            },
            { 
                name: 'Pending', 
                value: Math.max(0, totalFranchises - activeFranchises - expiredFranchises), 
                pct: '0%', 
                color: '#f43f5e' 
            },
        ];

        // Top performing franchises (by revenue)
        const topFranchises = await Tenant.aggregate([
            {
                $lookup: {
                    from: "tenantsubscriptions",
                    localField: "_id",
                    foreignField: "tenantId",
                    as: "subscription"
                }
            },
            { $unwind: { path: "$subscription", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    name: "$schoolName",
                    sales: { $ifNull: ["$subscription.totalAmount", 0] },
                    orders: { $ceil: { $multiply: [{ $ifNull: ["$subscription.totalAmount", 0] }, 0.01] } },
                    growth: "+10%"
                }
            },
            { $sort: { sales: -1 } },
            { $limit: 5 }
        ]);

        // Format top franchises
        const formattedTopFranchises = topFranchises.map(f => ({
            name: f.name,
            sales: `₹ ${f.sales.toLocaleString('en-IN')}`,
            orders: f.orders || 0,
            users: 0,
            growth: '0%'
        }));

        // Recent registrations
        const recentRegistrations = await Tenant.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const formattedRecentRegs = recentRegistrations.map((t, idx) => ({
            name: t.schoolName,
            time: new Date(t.createdAt).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            active: t.isActive
        }));

        // Subscription plans overview (real data)
        const planStats = await TenantSubscription.aggregate([
            {
                $group: {
                    _id: "$currentPlan.name",
                    count: { $sum: 1 },
                    totalRevenue: { $sum: "$totalAmount" }
                }
            }
        ]);

        const subPlans = planStats.map(plan => ({
            name: plan._id || 'Basic Plan',
            franchises: plan.count,
            revenue: `₹ ${(plan.totalRevenue || 0).toLocaleString('en-IN')}`,
            status: 'Active'
        }));

        // Recent invoices (mock data with actual subscription info)
        const recentInvoices = subscriptions
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5)
            .map((sub, idx) => {
                const tenant = tenants.find(t => t._id.toString() === sub.tenantId.toString());
                return {
                    no: `INV-2025-${3460 - idx}`,
                    name: tenant?.schoolName || 'Unknown',
                    plan: sub.currentPlan?.name || 'Basic',
                    amount: `₹ ${sub.totalAmount?.toLocaleString('en-IN') || 0}`,
                    status: sub.paidStatus === 'PAID' ? 'Paid' : 'Pending',
                    date: new Date(sub.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    })
                };
            });

        // Recent activities - real data from franchises and payments
        const recentActivities = [
            {
                text: `${totalFranchises} franchises registered in system`,
                time: new Date().toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                color: '#10b981',
            },
            {
                text: `Total revenue collected: ₹${totalRevenue.toLocaleString('en-IN')}`,
                time: new Date().toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                color: '#3b82f6',
            },
            {
                text: `Pending payments: ₹${pendingPayments.toLocaleString('en-IN')}`,
                time: new Date().toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                color: '#f59e0b',
            },
        ];

        // KPI Cards - remove random trends, use calculated data
        const kpiCards = [
            {
                title: 'Total Franchises',
                value: totalFranchises.toLocaleString(),
                trend: '+0%',
                up: true,
                icon: 'Store',
                theme: { bg: '#e8f1ff', ic: '#1a73e8', bd: '#c5d8ff' },
            },
            {
                title: 'Active Franchises',
                value: activeFranchises.toLocaleString(),
                trend: `+${activeFranchises > 0 ? Math.floor((activeFranchises / totalFranchises) * 100) : 0}%`,
                up: true,
                icon: 'CheckCircle',
                theme: { bg: '#e8f8f0', ic: '#16a34a', bd: '#bbf0d0' },
            },
            {
                title: 'Expired Franchises',
                value: expiredFranchises.toLocaleString(),
                trend: `${expiredFranchises > 0 ? Math.floor((expiredFranchises / totalFranchises) * 100) : 0}%`,
                up: false,
                icon: 'XCircle',
                theme: { bg: '#fff4e6', ic: '#ea7c1e', bd: '#ffd9a8' },
            },
            {
                title: 'Total Users',
                value: totalUsers.toLocaleString(),
                trend: '+0%',
                up: true,
                icon: 'Users',
                theme: { bg: '#f0ecff', ic: '#7c3aed', bd: '#d4c8ff' },
            },
            {
                title: 'Monthly Revenue',
                value: `₹ ${totalRevenue.toLocaleString('en-IN')}`,
                trend: '+0%',
                up: true,
                icon: 'IndianRupee',
                theme: { bg: '#e8f8f0', ic: '#16a34a', bd: '#bbf0d0' },
            },
            {
                title: 'Pending Payments',
                value: `₹ ${pendingPayments.toLocaleString('en-IN')}`,
                trend: `${pendingPayments > 0 ? '-' : '+'}0%`,
                up: false,
                icon: 'Clock',
                theme: { bg: '#fff1f1', ic: '#dc2626', bd: '#ffc5c5' },
            },
        ];

        return res.status(200).json(
            new apiResponse(200, {
                kpiCards,
                revenueData,
                franchiseStatusDistribution,
                topFranchises: formattedTopFranchises,
                subPlans,
                recentInvoices,
                recentRegistrations: formattedRecentRegs,
                recentActivities,
                stats: {
                    totalFranchises,
                    activeFranchises,
                    expiredFranchises,
                    totalUsers,
                    totalRevenue,
                    pendingPayments,
                }
            }, "Dashboard data fetched successfully 🚀")
        );
    } catch (error) {
        console.error("Dashboard error:", error);
        return res.status(500).json(new apiResponse(500, null, error.message));
    }
});
