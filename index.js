
// import 'newrelic'  // disabled — blocks startup in local dev
import "./config/env.js"; // Must be first — loads env before any other imports
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initializeFirebase } from "./config/firebase.js";
import compression from "compression";

/* ================= MAIN DB ================= */
import connectMainDB from "./config/mainDb.js";

/* ================= MAIN ROUTES ================= */
import tenantRoutes from "./routes/tenant.routes.js";
import mainUserRoutes from "./routes/mainUser.routes.js";
import subscriptionPlanRoutes from "./routes/Subscription.routes.js";
import createAdminRoutes from "./routes/adminRoutes.js";
import subscriptionRoutes from "./routes/TenantSubscriptionRoutes.js";
import saasRoutes from "./routes/DashboardRoutes.js";
import monthlyBillingRoutes from "./routes/MonthlyBillingRoutes.js";
import pricingConfigRoutes from "./routes/PricingConfig.routes.js";
import sessionBillingRoutes from "./routes/SessionBillingRoutes.js";
import freeTrialPackageRoutes from "./routes/FreeTrialPackage.routes.js";

/* ================= TENANT MIDDLEWARE ================= */
import { tenantMiddleware } from "./middleware/tenant.middleware.js";
import { dbMiddleware } from "./middleware/db.middleware.js";
import { subscriptionGuard } from "./middleware/subscriptionGuard.js";
import tenantSubscriptionRoutes from "./routes/tenantSelfSubscriptionRoutes.js";

/* ================= DISTRIBUTOR ================= */
import distributorRoutes from "./routes/distributor.routes.js";

/* ================= TENANT AUTH ================= */
import tenantAuthRoutes from "./routes/tenant/auth/tenantUserLoginRoutes.js";

/* ================= USER MANAGEMENT ================= */
import userManagementRoutes from "./routes/tenant/userManagementRoutes.js";

/* ================= UPLOAD ================= */
import uploadRoutes from "./routes/uploadRoutes.js";

/* ================= STUDENT ================= */
import studentRegistrationsRoutes from "./routes/tenant/student/studentRegistrationRoutes.js";
import studentEnrollmentRoutes from "./routes/tenant/student/studentEnrolmentRoutes.js";
import studentsTransferRoutes from "./routes/tenant/student/studentTransferRoutes.js";

/* ================= MASTER ================= */
import sessionRoutes from "./routes/tenant/academics/sessionRoutes.js";
import classRoutes from "./routes/tenant/academics/classRoutes.js";
import sectionRoutes from "./routes/tenant/academics/sectionRoutes.js";
import CategoryMaster from "./routes/tenant/academics/categoryMasterRoutes.js";
import documentsRoutes from "./routes/tenant/academics/documentRoutes.js";
import streamRoutes from "./routes/tenant/academics/streamRoutes.js";
import subjectRoutes from "./routes/tenant/academics/subjectRoutes.js";
import examRoutes from "./routes/tenant/academics/examRoutes.js";
import examListRoutes from "./routes/tenant/academics/examListRoutes.js";
import installmentRoutes from "./routes/tenant/fee/installmentTypeRoutes.js";
import lateFeeRoutes from "./routes/tenant/fee/LateFeeRoutes.js";
import HomeWorkRoutes from "./routes/tenant/academics/HomeWorkRoutes.js";
import dashboardRoutes from "./routes/tenant/dashboard/DashboardRoutes.js";
import razorpayRoutes from "./routes/tenant/payments/razorpayRoutes.js";

/* ================= FEE ================= */
import feeStructureRoutes from "./routes/tenant/fee/feeStructureRoutes.js";
import additionalFeeRoutes from "./routes/tenant/fee/additionalFeeRoutes.js";
import feeInstallmentRoutes from "./routes/tenant/fee/feeInstallmentRoutes.js";
import studentFeeRoutes from "./routes/tenant/fee/studentFeeRoutes.js";
import reportRoutes from "./routes/tenant/fee/reportRoutes.js";

/* ================= TRANSPORT ================= */
import BusRouteRoutes from "./routes/tenant/transport/BusRouteRoutes.js";
import RouteStopRoutes from "./routes/tenant/transport/RouteStopRoutes.js";
import AddBusRoutes from "./routes/tenant/transport/AddBusRoutes.js";
import TransportReportRoutes from "./routes/tenant/transport/TransportReportRoutes.js";
import TransportManageRoutes from "./routes/tenant/transport/TransportManageRoutes.js";
import TransportFeeWaiverRoutes from "./routes/tenant/transport/TransportFeeWaiverRoutes.js";
import TransportVacationRoutes from "./routes/tenant/transport/TransportVacationRoutes.js";

/* ================= ATTENDANCE ================= */
import attendanceRoutes from "./routes/tenant/academics/attendanceRoutes.js";

/* ================= TEACHER ================= */
import teacherRoutes from "./routes/tenant/teacher/teacherRoutes.js";

/* ================= NOTICE / NOTIFICATION ================= */
import noticeRoutes from "./routes/tenant/communication/noticeRoutes.js";
import notificationRoutes from "./routes/tenant/communication/notificationRoutes.js";

/* ================= CONTENT ================= */
import bannerRoutes from "./routes/tenant/content/bannerRoutes.js";
import categoryRoutes from "./routes/tenant/content/categoryRoutes.js";
import galleryRoutes from "./routes/tenant/content/galleryRoutes.js";
import testimonialsRoutes from "./routes/tenant/content/testimonialsRoutes.js";
import servicesRoutes from "./routes/tenant/content/servicesRoutes.js";

/* ================= MARKSHEET ================= */
import marksheetRoutes from "./routes/tenant/academics/marksheetRoutes.js";

/* ================= CERTIFICATES ================= */
import conductCertificateRoutes from "./routes/tenant/academics/conductCertificateRoutes.js";
import certificateRoutes from "./routes/tenant/academics/certificateRoutes.js";

/* ================= HR MODULE ================= */
import hrRoutes               from "./routes/tenant/hr/hrRoutes.js";
import attendanceLeaveRoutes  from "./routes/tenant/hr/attendanceLeaveRoutes.js";
import payrollRoutes          from "./routes/tenant/hr/payrollRoutes.js";
import accountRoutes          from "./routes/tenant/hr/accountRoutes.js";

/* ================= AI ASSISTANT ================= */
import aiChatRoutes from "./routes/tenant/ai/aiChatRoutes.js";

/* ================= OTHER ================= */
import supportRoutes from "./routes/supportRoutes.js";
import onboardingRoutes from "./routes/SchoolOnboarding.routes.js";
import portalRoutes from "./routes/portal.routes.js";
import faqRoutes from "./routes/faqRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import siteSettingsRoutes from "./routes/siteSettingsRoutes.js";

/* ================= APP SETUP ================= */
const app = express();
app.use(compression());
app.use(express.json());
app.use(cookieParser());

/* ================= CORS ================= */
// Allowed origins — comma-separated list in CLIENT_URL env var
// e.g. CLIENT_URL=https://admin.schoolcloudx.com,https://app.schoolcloudx.com
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    // Always allow localhost / 127.0.0.1 on any port (dev convenience)
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https?:\/\/[^.]+\.localhost(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }

    // "*" in CLIENT_URL = allow ALL origins (dev only).
    // We must REFLECT the actual origin back — browsers reject literal "*" with credentials:true
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Allow any origin explicitly listed in CLIENT_URL
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any subdomain of the configured BASE_DOMAIN
    const baseDomain = process.env.BASE_DOMAIN || '';
    if (baseDomain && origin.endsWith(`.${baseDomain}`)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials:    true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'Cache-Control', 'Pragma'],
  exposedHeaders: [
    'X-Subscription-Status', 'X-Subscription-Days-Left', 'X-Subscription-Used',
    'X-Subscription-Limit', 'X-Subscription-Usage-Pct', 'X-Subscription-Paid',
    'X-Subscription-Warnings',
  ],
}));

/* ================= CONNECT MAIN DB ================= */
connectMainDB();

/* ================= FIREBASE ================= */
initializeFirebase();

/* ================= PUBLIC ROUTES (NO TENANT CONTEXT) ================= */
app.use("/api/mainUser",        mainUserRoutes);
app.use("/api/schools",         tenantRoutes);
app.use("/api/distributor",     distributorRoutes);   // ← Distributor portal
app.use("/api/subscriptionPlan", subscriptionPlanRoutes);
app.use("/api/upload",          uploadRoutes);
app.use("/api/saas",            saasRoutes);
app.use("/api/monthly-billing", monthlyBillingRoutes);
app.use("/api/pricing-config",  pricingConfigRoutes);
app.use("/api/support",         supportRoutes);
app.use("/api/onboarding",      onboardingRoutes);
app.use("/api/portal",          portalRoutes);
app.use("/api/faq",             faqRoutes);       /* <- FAQ management (main DB, no tenant) */
app.use("/api/contact",         contactRoutes);   /* <- Website contact form (public) */
app.use("/api/newsletter",      newsletterRoutes); /* <- Newsletter subscription (public) */
app.use("/api/site-settings",   siteSettingsRoutes); /* <- Site contact info (public GET, admin PUT) */
app.use("/api/subscription",         subscriptionRoutes);
app.use("/api/free-trial-packages",  freeTrialPackageRoutes);
app.use("/api/session-billing",      sessionBillingRoutes);

/* ================= MULTI-TENANT MIDDLEWARE ================= */
app.use(tenantMiddleware);
app.use(dbMiddleware);

/* Subscription Guard — blocks EXPIRED/CANCELLED tenants
   Exempts: login/auth, subscription-status, my-subscription */
app.use((req, res, next) => {
    const url = req.originalUrl;
    const exempted = [
        "/api/auth",
        "/api/subscription-status",
        "/api/my-subscription",
    ];
    const isExempt = exempted.some(path => url.startsWith(path));
    if (isExempt) return next();
    return subscriptionGuard(req, res, next);
});

/* Real-time subscription status — used by school LMS frontend */
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
                    ? Math.max(0, sub.totalStudentLimit - (sub.usedStudents || 0))
                    : "unlimited",
                usagePercent:      usagePct,
                paidStatus:        sub.paidStatus,
                dueDate:           sub.dueDate,
                warnings,
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/* ================= TENANT AUTH ================= */
app.use("/api/auth", tenantAuthRoutes);

/* ================= USER MANAGEMENT ================= */
app.use("/api/users", userManagementRoutes);

/* ================= FRANCHISE LOGIN (needs tenant context from middleware) ================= */
/* POST /api/franchise/login  — Body: { userId, password }, Header: x-tenant-id: <subdomain> */
import { franchiseLogin } from "./controllers/tenant.controller.js";
app.post("/api/franchise/login", franchiseLogin);

/* Tenant's own subscription info */
app.use("/api/my-subscription", tenantSubscriptionRoutes);

/* School admin self-update profile */
import schoolSelfUpdateRoutes from "./routes/tenant/schoolSelfUpdateRoutes.js";
app.use("/api/school/profile", schoolSelfUpdateRoutes);

/* ================= ADMIN ================= */
app.use("/api/admins", createAdminRoutes);

/* ================= STUDENT ================= */
app.use("/api/studentRegistrations", studentRegistrationsRoutes);
app.use("/api/studentEnrollment",    studentEnrollmentRoutes);
app.use("/api/studentTransfer",      studentsTransferRoutes);

/* ================= MASTER ================= */
app.use("/api/classes",          classRoutes);
app.use("/api/sections",         sectionRoutes);
app.use("/api/documents",        documentsRoutes);
app.use("/api/sessions",         sessionRoutes);
app.use("/api/subjects",         subjectRoutes);
app.use("/api/streams",          streamRoutes);
app.use("/api/exams",            examRoutes);
app.use("/api/examsList",        examListRoutes);
app.use("/api/installment-type", installmentRoutes);
app.use("/api/late-fee",         lateFeeRoutes);
app.use("/api/categoryMaster",   CategoryMaster);
app.use("/api/homework",         HomeWorkRoutes);
app.use("/api/admin",            dashboardRoutes);
app.use("/api/payments",         razorpayRoutes);

/* ================= FEE ================= */
app.use("/api/fee-structures",   feeStructureRoutes);
app.use("/api/additional-fees",  additionalFeeRoutes);
app.use("/api/fee-installments", feeInstallmentRoutes);
app.use("/api/student-fees",     studentFeeRoutes);
app.use("/api/reports",          reportRoutes);

/* ================= TRANSPORT ================= */
app.use("/api/transport",          BusRouteRoutes);
app.use("/api/transport/stops",    RouteStopRoutes);
app.use("/api/transport/buses",    AddBusRoutes);
app.use("/api/transport/report",   TransportReportRoutes);
app.use("/api/transport-manage",   TransportManageRoutes);
app.use("/api/transport-vacation", TransportVacationRoutes);
app.use("/api/transport-fees",     TransportFeeWaiverRoutes);

/* ================= ATTENDANCE ================= */
app.use("/api/attendance", attendanceRoutes);

/* ================= TEACHER ================= */
app.use("/api/teachers", teacherRoutes);

/* ================= NOTICE / NOTIFICATION ================= */
app.use("/api/notices",       noticeRoutes);
app.use("/api/notifications", notificationRoutes);

/* ================= CONTENT ================= */
app.use("/api/banners",      bannerRoutes);
app.use("/api/category",     categoryRoutes);
app.use("/api/gallery",      galleryRoutes);
app.use("/api/testimonials", testimonialsRoutes);
app.use("/api/services",     servicesRoutes);

/* ================= MARKSHEET ================= */
app.use("/api/marks", marksheetRoutes);

/* ================= CERTIFICATES ================= */
app.use("/api/conduct-certificates", conductCertificateRoutes);
app.use("/api/certificates",         certificateRoutes);

/* ================= HR MODULE ================= */
app.use("/api/hr", hrRoutes);
app.use("/api/hr", attendanceLeaveRoutes);
app.use("/api/hr", payrollRoutes);
app.use("/api/hr", accountRoutes);

/* ================= AI ASSISTANT ================= */
app.use("/api/ai", aiChatRoutes);

/* ================= FALLBACK TEST ================= */
app.use("/api", (_req, res) => {
    res.send("Tenant API working");
});

/* ================= GLOBAL ERROR HANDLER ================= */
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err?.message || err);
    const status = err?.statusCode || err?.status || 500;
    const razorpayDesc = err?.error?.description;
    const message = razorpayDesc
        ? `Payment gateway error: ${razorpayDesc}`
        : (err?.message || "Internal Server Error");

    res.status(typeof status === 'number' ? status : 500).json({
        statusCode: status,
        success:    false,
        message,
        data:       null,
    });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
