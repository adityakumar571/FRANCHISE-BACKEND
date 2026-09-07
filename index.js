import "./config/env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initializeFirebase } from "./config/firebase.js";
import compression from "compression";

/* ── Main DB ── */
import connectMainDB from "./config/mainDb.js";

/* ── Main/Public Routes ── */
import tenantRoutes              from "./routes/tenant.routes.js";
import mainUserRoutes            from "./routes/mainUser.routes.js";
import subscriptionPlanRoutes    from "./routes/Subscription.routes.js";
import createAdminRoutes         from "./routes/adminRoutes.js";
import subscriptionRoutes        from "./routes/TenantSubscriptionRoutes.js";
import saasRoutes                from "./routes/DashboardRoutes.js";
import monthlyBillingRoutes      from "./routes/MonthlyBillingRoutes.js";
import pricingConfigRoutes       from "./routes/PricingConfig.routes.js";
import sessionBillingRoutes      from "./routes/SessionBillingRoutes.js";
import freeTrialPackageRoutes    from "./routes/FreeTrialPackage.routes.js";
import distributorRoutes         from "./routes/distributor.routes.js";
import faqRoutes                 from "./routes/faqRoutes.js";
import contactRoutes             from "./routes/contactRoutes.js";
import siteSettingsRoutes        from "./routes/siteSettingsRoutes.js";
import uploadRoutes              from "./routes/uploadRoutes.js";

/* ── Tenant Middleware ── */
import { tenantMiddleware }  from "./middleware/tenant.middleware.js";
import { dbMiddleware }      from "./middleware/db.middleware.js";
import { subscriptionGuard } from "./middleware/subscriptionGuard.js";

/* ── Tenant Routes ── */
import tenantAuthRoutes         from "./routes/tenant/auth/tenantUserLoginRoutes.js";
import userManagementRoutes     from "./routes/tenant/userManagementRoutes.js";
import tenantSubscriptionRoutes from "./routes/tenantSelfSubscriptionRoutes.js";
import hrRoutes                 from "./routes/tenant/hr/hrRoutes.js";
import attendanceLeaveRoutes    from "./routes/tenant/hr/attendanceLeaveRoutes.js";
import payrollRoutes            from "./routes/tenant/hr/payrollRoutes.js";
import accountRoutes            from "./routes/tenant/hr/accountRoutes.js";

/* ── Franchise Login controller ── */
import { franchiseLogin } from "./controllers/tenant.controller.js";

/* ─────────────────────────────────────────── */
const app = express();
app.use(compression());
app.use(express.json());
app.use(cookieParser());

/* ── CORS ── */
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',').map(u => u.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https?:\/\/[^.]+\.localhost(:\d+)?$/.test(origin)
    ) return callback(null, true);
    if (allowedOrigins.includes('*')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    const baseDomain = process.env.BASE_DOMAIN || '';
    if (baseDomain && origin.endsWith(`.${baseDomain}`)) return callback(null, true);
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'Cache-Control', 'Pragma'],
  exposedHeaders: [
    'X-Subscription-Status', 'X-Subscription-Days-Left', 'X-Subscription-Used',
    'X-Subscription-Limit', 'X-Subscription-Usage-Pct', 'X-Subscription-Paid',
    'X-Subscription-Warnings',
  ],
}));

/* ── Connect DB + Firebase ── */
connectMainDB();
initializeFirebase();

/* ══════════════════════════════════════════
   PUBLIC ROUTES (no tenant context)
══════════════════════════════════════════ */
app.use("/api/mainUser",            mainUserRoutes);
app.use("/api/schools",             tenantRoutes);
app.use("/api/distributor",         distributorRoutes);
app.use("/api/subscriptionPlan",    subscriptionPlanRoutes);
app.use("/api/upload",              uploadRoutes);
app.use("/api/saas",                saasRoutes);
app.use("/api/monthly-billing",     monthlyBillingRoutes);
app.use("/api/pricing-config",      pricingConfigRoutes);
app.use("/api/faq",                 faqRoutes);
app.use("/api/contact",             contactRoutes);
app.use("/api/site-settings",       siteSettingsRoutes);
app.use("/api/subscription",        subscriptionRoutes);
app.use("/api/free-trial-packages", freeTrialPackageRoutes);
app.use("/api/session-billing",     sessionBillingRoutes);

/* ══════════════════════════════════════════
   MULTI-TENANT MIDDLEWARE
══════════════════════════════════════════ */
app.use(tenantMiddleware);
app.use(dbMiddleware);

/* Subscription Guard */
app.use((req, res, next) => {
  const url = req.originalUrl;
  const exempted = ["/api/auth", "/api/subscription-status", "/api/my-subscription"];
  if (exempted.some(p => url.startsWith(p))) return next();
  return subscriptionGuard(req, res, next);
});

/* Real-time subscription status */
app.get("/api/subscription-status", async (req, res) => {
  if (!req.tenant) return res.status(400).json({ success: false, message: "No tenant context" });
  try {
    const { default: TenantSubscription } = await import("./models/TenantSubscription.modal.js");
    const sub = await TenantSubscription.findOne({ tenantId: req.tenant._id }).lean();
    if (!sub) return res.status(200).json({ success: true, data: { hasSubscription: false } });

    const now      = new Date();
    const endDate  = sub.currentPlan?.endDate;
    const daysLeft = endDate ? Math.ceil((new Date(endDate) - now) / 86400000) : null;
    const usagePct = sub.totalStudentLimit > 0
      ? Math.round(((sub.usedStudents || 0) / sub.totalStudentLimit) * 100) : 0;

    const warnings = [];
    if (daysLeft !== null && daysLeft <= 30 && daysLeft > 0) warnings.push("EXPIRING_SOON");
    if (daysLeft !== null && daysLeft <= 0)                  warnings.push("EXPIRED");
    if (usagePct >= 90)                                       warnings.push("LIMIT_CRITICAL");
    else if (usagePct >= 70)                                  warnings.push("LIMIT_WARNING");
    if (sub.paidStatus === "OVERDUE")                         warnings.push("PAYMENT_OVERDUE");
    if (sub.paidStatus === "UNPAID")                          warnings.push("PAYMENT_UNPAID");

    return res.status(200).json({
      success: true,
      data: {
        hasSubscription:   true,
        status:            sub.status,
        planName:          sub.currentPlan?.name,
        billingCycle:      sub.currentPlan?.billingCycle,
        endDate,
        daysLeft:          daysLeft !== null ? Math.max(0, daysLeft) : null,
        totalStudentLimit: sub.totalStudentLimit,
        usedStudents:      sub.usedStudents || 0,
        remaining:         sub.totalStudentLimit > 0
          ? Math.max(0, sub.totalStudentLimit - (sub.usedStudents || 0)) : "unlimited",
        usagePercent: usagePct,
        paidStatus:   sub.paidStatus,
        dueDate:      sub.dueDate,
        warnings,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ══════════════════════════════════════════
   TENANT ROUTES
══════════════════════════════════════════ */
app.use("/api/auth",            tenantAuthRoutes);
app.use("/api/users",           userManagementRoutes);
app.post("/api/franchise/login", franchiseLogin);

/* ================= FRANCHISE MODULE ROUTES ================= */
import franchiseDashboardRoutes from "./routes/tenant/franchise/dashboardRoutes.js";
import franchiseSalesRoutes     from "./routes/tenant/franchise/salesRoutes.js";
import franchisePurchaseRoutes  from "./routes/tenant/franchise/purchaseRoutes.js";
import franchiseInventoryRoutes from "./routes/tenant/franchise/inventoryRoutes.js";
import franchisePosRoutes       from "./routes/tenant/franchise/posRoutes.js";
import franchiseFullPurchaseRoutes  from "./routes/tenant/franchise/fullPurchaseRoutes.js";
import franchiseFullInventoryRoutes from "./routes/tenant/franchise/fullInventoryRoutes.js";
import franchiseLiveRatesRoutes     from "./routes/tenant/franchise/liveRatesRoutes.js";
import franchiseRemainingRoutes     from "./routes/tenant/franchise/remainingRoutes.js";

app.use("/api/franchise/dashboard",   franchiseDashboardRoutes);
app.use("/api/franchise/sales",       franchiseSalesRoutes);
app.use("/api/franchise/purchase",    franchisePurchaseRoutes);
app.use("/api/franchise/purchase",    franchiseFullPurchaseRoutes);
app.use("/api/franchise/inventory",   franchiseInventoryRoutes);
app.use("/api/franchise/inventory",   franchiseFullInventoryRoutes);
app.use("/api/franchise/pos",         franchisePosRoutes);
app.use("/api/franchise/live-rates",  franchiseLiveRatesRoutes);
app.use("/api/franchise",             franchiseRemainingRoutes);

/* Tenant's own subscription info */
app.use("/api/my-subscription", tenantSubscriptionRoutes);
app.use("/api/admins",          createAdminRoutes);

/* HR Module */
app.use("/api/hr", hrRoutes);
app.use("/api/hr", attendanceLeaveRoutes);
app.use("/api/hr", payrollRoutes);
app.use("/api/hr", accountRoutes);

/* ── Fallback ── */
app.use("/api", (_req, res) => res.send("Franchise API working ✅"));

/* ── Global Error Handler ── */
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err?.message || err);
  const status  = err?.statusCode || err?.status || 500;
  const message = err?.error?.description
    ? `Payment gateway error: ${err.error.description}`
    : (err?.message || "Internal Server Error");
  res.status(typeof status === 'number' ? status : 500).json({
    statusCode: status, success: false, message, data: null,
  });
});

/* ── Server ── */
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Franchise server running on port ${PORT}`));
