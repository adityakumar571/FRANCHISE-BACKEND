import express from "express";
import {
    // ── NEW 2-STEP FLOW ─────────────────────────────────────
    checkSubdomain,
    createLead,
    resendLeadOtp,
    verifyLeadOtp,
    createSchoolFromLead,
    // ── LEGACY FLOW ─────────────────────────────────────────
    registerSchool,
    verifyOtp,
    registerFree,
    getPublicPlans,
    calculatePlanPrice,
    createOnboardingOrder,
    verifyOnboardingPayment,
    startTrial,
    getAllRegistrations,
    deleteRegistration,
    sendMyPlanOtp,
    getMyPlan,
} from "../controllers/SchoolOnboarding.controller.js";
import { verifyMainJWT } from "../middleware/authTypeMiddlewareMain.js";

const router = express.Router();

// ── NEW 2-STEP PUBLIC ROUTES ──────────────────────────────────
router.post("/check-subdomain",   checkSubdomain);      // Step 0: subdomain availability
router.post("/create-lead",       createLead);           // Step 1: lead + OTP
router.post("/resend-otp",        resendLeadOtp);        // Step 1c: resend OTP
router.post("/verify-lead-otp",   verifyLeadOtp);        // Step 1b: verify OTP → LEAD
router.post("/create-school",     createSchoolFromLead); // Step 2: school details → tenant

// ── LEGACY PUBLIC ROUTES (no auth) ────────────────────────────
router.post("/register",          registerSchool);
router.post("/verify-otp",        verifyOtp);
router.post("/register-free",     registerFree);
router.get("/plans",              getPublicPlans);
router.post("/calculate-price",   calculatePlanPrice);
router.post("/create-order",      createOnboardingOrder);
router.post("/verify-payment",    verifyOnboardingPayment);
router.post("/start-trial",       startTrial);

// My Plan
router.post("/my-plan/send-otp",  sendMyPlanOtp);
router.post("/my-plan",           getMyPlan);

// ── ADMIN ROUTES (auth required) ─────────────────────────────
router.get("/registrations",       verifyMainJWT, getAllRegistrations);
router.delete("/registrations/:id", verifyMainJWT, deleteRegistration);

export default router;
