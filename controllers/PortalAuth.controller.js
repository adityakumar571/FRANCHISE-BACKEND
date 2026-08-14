/**
 * PortalAuth.controller.js
 *
 * Website portal login — school apna account dekhe
 *
 * Routes:
 *  POST /portal/send-otp          → Email OTP bhejo (passwordless)
 *  POST /portal/verify-otp        → OTP verify → JWT token
 *  POST /portal/login             → Email + Password login → JWT token
 *  POST /portal/set-password      → Pehli baar ya reset password set karo (auth required)
 *  GET  /portal/dashboard         → Current plan + all plans (auth required)
 *  POST /portal/logout            → Token clear
 */

import jwt from "jsonwebtoken";
import Tenant from "../models/tenant.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import SubscriptionPlan from "../models/subscription.modal.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { sendOtpEmail } from "../utils/sendOtpEmail.js";

// ── helpers ──────────────────────────────────────────────────
const generateOtp = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

const issueToken = (tenantId) =>
    jwt.sign({ tenantId, type: "portal" }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ─────────────────────────────────────────────────────────────
// 1. Send OTP (passwordless login)
// ─────────────────────────────────────────────────────────────
export const portalSendOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res.status(400).json(new apiResponse(400, null, "email required"));

    const tenant = await Tenant.findOne({ schoolEmail: email.toLowerCase().trim() });
    if (!tenant)
        return res.status(404).json(new apiResponse(404, null, "Is email se koi school nahi mila"));

    if (!tenant.isActive)
        return res.status(403).json(new apiResponse(403, null, "School account inactive hai. Admin se contact karo."));

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // findOneAndUpdate — pre-save hook trigger nahi hoga, sirf ye 2 fields update hongi
    await Tenant.findByIdAndUpdate(tenant._id, {
        portalOtp: otp,
        portalOtpExpiry: otpExpiry,
    });

    try {
        await sendOtpEmail({ to: email, schoolName: tenant.schoolName, otp });
    } catch (e) {
        console.error("Portal OTP email failed:", e.message);
        // Email fail hone pe bhi 200 return karo — OTP DB mein save hai
        // (dev mein console mein OTP dikhega)
        console.log(`[DEV] OTP for ${email}: ${otp}`);
    }

    return res.status(200).json(new apiResponse(200, null, `OTP bheja gaya: ${email}`));
});

// ─────────────────────────────────────────────────────────────
// 2. Verify OTP → issue JWT
// ─────────────────────────────────────────────────────────────
export const portalVerifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp)
        return res.status(400).json(new apiResponse(400, null, "email aur otp required"));

    const tenant = await Tenant.findOne({ schoolEmail: email.toLowerCase().trim() });
    if (!tenant)
        return res.status(404).json(new apiResponse(404, null, "School nahi mila"));

    if (!tenant.portalOtp || tenant.portalOtp !== otp)
        return res.status(400).json(new apiResponse(400, null, "Invalid OTP"));

    if (!tenant.portalOtpExpiry || new Date() > tenant.portalOtpExpiry)
        return res.status(400).json(new apiResponse(400, null, "OTP expire ho gaya. Dobara bhejo."));

    // clear OTP using update — pre-save hook avoid karo
    await Tenant.findByIdAndUpdate(tenant._id, {
        $unset: { portalOtp: 1, portalOtpExpiry: 1 },
    });

    const token = issueToken(tenant._id);

    // hasPassword check — separately query karo kyunki portalPassword select:false hai
    const tenantWithPass = await Tenant.findById(tenant._id).select("+portalPassword");

    return res
        .status(200)
        .cookie("portalToken", token, COOKIE_OPTIONS)
        .json(new apiResponse(200, {
            token,
            school: { name: tenant.schoolName, email: tenant.schoolEmail, logo: tenant.logo },
            hasPassword: !!(tenantWithPass?.portalPassword),
        }, "Login successful"));
});

// ─────────────────────────────────────────────────────────────
// 3. Password login → issue JWT
// ─────────────────────────────────────────────────────────────
export const portalLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json(new apiResponse(400, null, "email aur password required"));

    // +portalPassword select karo (select: false hai model mein)
    const tenant = await Tenant.findOne({ schoolEmail: email.toLowerCase().trim() }).select("+portalPassword");
    if (!tenant)
        return res.status(404).json(new apiResponse(404, null, "School nahi mila"));

    if (!tenant.isActive)
        return res.status(403).json(new apiResponse(403, null, "Account inactive hai"));

    if (!tenant.portalPassword)
        return res.status(400).json(new apiResponse(400, null, "Password set nahi hai. OTP se login karo aur password set karo."));

    const isMatch = await tenant.isPasswordCorrect(password);
    if (!isMatch)
        return res.status(401).json(new apiResponse(401, null, "Galat password"));

    const token = issueToken(tenant._id);

    return res
        .status(200)
        .cookie("portalToken", token, COOKIE_OPTIONS)
        .json(new apiResponse(200, {
            token,
            school: { name: tenant.schoolName, email: tenant.schoolEmail, logo: tenant.logo },
            hasPassword: true,
        }, "Login successful"));
});

// ─────────────────────────────────────────────────────────────
// 4. Set / Reset password (auth required)
// ─────────────────────────────────────────────────────────────
export const portalSetPassword = asyncHandler(async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6)
        return res.status(400).json(new apiResponse(400, null, "Password kam se kam 6 characters ka hona chahiye"));

    // +portalPassword explicitly select karo taaki isModified kaam kare
    const tenant = await Tenant.findById(req.tenantId).select("+portalPassword");
    if (!tenant)
        return res.status(404).json(new apiResponse(404, null, "School nahi mila"));

    tenant.portalPassword = password; // pre-save hook hash karega
    await tenant.save();

    return res.status(200).json(new apiResponse(200, null, "Password set ho gaya"));
});

// ─────────────────────────────────────────────────────────────
// 5. Dashboard — current plan + all available plans
// ─────────────────────────────────────────────────────────────
export const portalDashboard = asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant)
        return res.status(404).json(new apiResponse(404, null, "School nahi mila"));

    // Current subscription
    const subscription = await TenantSubscription.findOne({ tenantId: tenant._id })
        .populate("currentPlan.planId", "name description features");

    // All available plans (for upgrade section)
    const allPlans = await SubscriptionPlan.find({ isActive: true, planType: "Plan" })
        .sort({ sortOrder: 1, price: 1 })
        .select("name description price pricingModel pricePerStudent billingCycle trialDays studentLimit features isPopular yearlyDiscountPercent");

    const now = new Date();
    let planInfo = null;

    if (subscription) {
        const endDate       = subscription.currentPlan?.endDate;
        const trialEndDate  = subscription.trialEndDate;
        const isExpired     = endDate ? now > new Date(endDate) : false;
        const daysLeft      = endDate
            ? Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24)))
            : null;
        const trialDaysLeft = trialEndDate
            ? Math.max(0, Math.ceil((new Date(trialEndDate) - now) / (1000 * 60 * 60 * 24)))
            : null;

        // Resolve studentLimit: if totalStudentLimit is 0 (legacy trial), check plan-level,
        // then fallback to 350 for trials — never show "Unlimited" on a free trial.
        const resolvedStudentLimit = (() => {
            const total = subscription.totalStudentLimit || 0;
            if (total > 0) return total;
            const planLimit = subscription.currentPlan?.studentLimit || 0;
            if (planLimit > 0) return planLimit;
            if (subscription.isTrial) return 350;
            return 0; // genuine unlimited (e.g. enterprise PER_STUDENT)
        })();

        planInfo = {
            name:          subscription.currentPlan?.name                 || "—",
            planId:        subscription.currentPlan?.planId?._id          || null,
            description:   subscription.currentPlan?.planId?.description  || null,
            features:      subscription.currentPlan?.planId?.features     || [],
            billingCycle:  subscription.currentPlan?.billingCycle         || "—",
            price:         subscription.currentPlan?.price                || 0,
            studentLimit:  resolvedStudentLimit,
            usedStudents:  subscription.usedStudents                      || 0,
            startDate:     subscription.currentPlan?.startDate            || null,
            endDate:       subscription.currentPlan?.endDate              || null,
            trialEndDate:  subscription.trialEndDate                      || null,
            isTrial:       subscription.isTrial                           || false,
            status:        isExpired ? "EXPIRED" : subscription.status,
            daysLeft,
            trialDaysLeft,
            addons: (subscription.currentAddons || []).map((a) => ({
                name: a.name, price: a.price, studentLimit: a.studentLimit, quantity: a.quantity,
            })),
            history: (subscription.history || [])
                .slice(-10)
                .reverse()
                .map((h) => ({
                    type:      h.type,
                    name:      h.name,
                    price:     h.price,
                    startDate: h.startDate,
                    endDate:   h.endDate,
                    createdAt: h.createdAt,
                    razorpayPaymentId: h.razorpayPaymentId,
                })),
        };
    }

    const tenantWithPass = await Tenant.findById(tenant._id).select("+portalPassword");

    return res.status(200).json(
        new apiResponse(200, {
            school: {
                name:        tenant.schoolName,
                email:       tenant.schoolEmail,
                subdomain:   tenant.subdomain,
                logo:        tenant.logo        || null,
                loginUrl:    `https://${tenant.subdomain}.schoolcloudx.com/login`,
                isActive:    tenant.isActive,
                hasPassword: !!(tenantWithPass?.portalPassword),
            },
            currentPlan: planInfo,
            allPlans,
        }, "Dashboard data fetched")
    );
});

// ─────────────────────────────────────────────────────────────
// 6. Logout
// ─────────────────────────────────────────────────────────────
export const portalLogout = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .clearCookie("portalToken", COOKIE_OPTIONS)
        .json(new apiResponse(200, null, "Logged out successfully"));
});
