/**
 * SchoolOnboarding.controller.js
 *
 * Public-facing APIs ? school khud register kar sake.
 *
 * NEW 2-STEP FLOW:
 *  POST /onboarding/check-subdomain   ? Subdomain availability check
 *  POST /onboarding/create-lead       ? Step 1: Lead info + OTP bhejo
 *  POST /onboarding/verify-lead-otp   ? Step 1b: OTP verify ? lead save (LEAD status)
 *  POST /onboarding/create-school     ? Step 2: School details ? tenant create ? credentials email
 *
 * LEGACY FLOW (preserved):
 *  POST /onboarding/register          ? School fills full form, OTP sent
 *  POST /onboarding/verify-otp        ? OTP verify
 *  GET  /onboarding/plans             ? All active plans (public)
 *  POST /onboarding/calculate-price   ? Price calculate (per-student / fixed)
 *  POST /onboarding/create-order      ? Razorpay order
 *  POST /onboarding/verify-payment    ? Payment verify ? tenant auto-create
 *  POST /onboarding/start-trial       ? Free trial start (no payment)
 */

import crypto from "crypto";
import Razorpay from "razorpay";
import SchoolRegistration from "../models/SchoolRegistration.model.js";
import SubscriptionPlan from "../models/subscription.modal.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import FreeTrialPackage from "../models/FreeTrialPackage.model.js";
import Tenant from "../models/tenant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { getTenantDB } from "../utils/dbManager.js";
import { getUserModel } from "../models/tenant/user.model.js";
import { getSessionModel } from "../models/tenant/master/Session.model.js";
import { setupDefaultMasters } from "../utils/setupDefaultMasters.js";
import { sendSchoolCredentials } from "../utils/sendSchoolCredentials.js";
import { sendOtpEmail } from "../utils/sendOtpEmail.js";
import { sendLeadNotification } from "../utils/sendLeadNotification.js";

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------

const getRazorpay = () => {
    if (!process.env.RAZORPAY_KEY || !process.env.RAZORPAY_SECRET) {
        throw new Error("Razorpay keys missing in .env");
    }
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY,
        key_secret: process.env.RAZORPAY_SECRET,
    });
};

/**
 * Build the school portal login URL.
 * - localhost  ? http://localhost:PORT/subdomain  (dev mode)
 * - production ? https://subdomain.schoolcloudx.com
 */
const buildLoginUrl = (subdomain) => {
    const base = (process.env.SCHOOL_APP_BASE_URL || "").trim();
    if (base.includes("localhost")) {
        return `${base}/${subdomain}/login`;
    }
    return `https://${subdomain}.schoolcloudx.com/login`;
};

const getCurrentSession = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const generateOtp = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

const generateSubdomain = (schoolName) =>
    schoolName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 20) +
    Math.floor(1000 + Math.random() * 9000);

/**
 * Calculate final price based on pricing model
 * Returns { baseAmount, setupFee, total, studentLimit }
 */
const calculatePrice = (plan, committedStudents = 0, billingCycle = "Monthly") => {
    let baseAmount = 0;
    let studentLimit = plan.studentLimit;

    if (plan.pricingModel === "PER_STUDENT") {
        const students = Math.max(committedStudents, plan.minStudents || 0);
        baseAmount = plan.pricePerStudent * students;
        studentLimit = students; // dynamic limit

        // Yearly discount
        if (billingCycle === "Yearly" && plan.yearlyDiscountPercent > 0) {
            const monthly = baseAmount;
            const yearly = monthly * 12;
            const discount = (yearly * plan.yearlyDiscountPercent) / 100;
            baseAmount = yearly - discount;
        }
    } else {
        // FIXED pricing
        baseAmount = plan.price;

        if (billingCycle === "Yearly") {
            // If plan doesn't have yearly variant, apply discount
            if (plan.billingCycle === "Monthly" && plan.yearlyDiscountPercent > 0) {
                const yearly = baseAmount * 12;
                const discount = (yearly * plan.yearlyDiscountPercent) / 100;
                baseAmount = yearly - discount;
            }
        }
    }

    return {
        baseAmount: Math.round(baseAmount),
        setupFee: plan.setupFee || 0,
        total: Math.round(baseAmount) + (plan.setupFee || 0),
        studentLimit,
    };
};

// -------------------------------------------------------------
// NEW FLOW ? STEP 0: Check subdomain availability
// POST /onboarding/check-subdomain
// -------------------------------------------------------------
export const checkSubdomain = asyncHandler(async (req, res) => {
    const { subdomain } = req.body;

    if (!subdomain || subdomain.trim().length < 3) {
        return res.status(400).json(new apiResponse(400, null, "Subdomain must be at least 3 characters"));
    }

    const clean = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, "");

    if (clean.length < 3) {
        return res.status(400).json(new apiResponse(400, null, "Invalid subdomain. Only letters, numbers and hyphens allowed."));
    }

    const existingTenant = await Tenant.findOne({ subdomain: clean });

    // LEAD status registrations expire after 24 hours — don't block others indefinitely
    const LEAD_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
    const existingReg    = await SchoolRegistration.findOne({
        subdomain: clean,
        $or: [
            // Hard-blocked statuses (no expiry): VERIFIED, PAYMENT_PENDING, COMPLETED
            { status: { $in: ["VERIFIED", "PAYMENT_PENDING", "COMPLETED"] } },
            // LEAD: only block if created within last 24 hours
            {
                status: "LEAD",
                updatedAt: { $gte: new Date(Date.now() - LEAD_EXPIRY_MS) },
            },
        ],
    });
    const available = !existingTenant && !existingReg;

    return res.status(200).json(
        new apiResponse(200, { subdomain: clean, available }, available
            ? "Subdomain is available!"
            : "This subdomain is already taken. Please try another."
        )
    );
});

// -------------------------------------------------------------
// NEW FLOW ? STEP 1: Create Lead + Send OTP
// POST /onboarding/create-lead
// Body: { subdomain, contactName, mobileNo, whatsappNo, email }
// -------------------------------------------------------------
export const createLead = asyncHandler(async (req, res) => {
    const { subdomain, contactName, mobileNo, whatsappNo, email } = req.body;

    if (!subdomain || !contactName || !mobileNo || !email) {
        return res.status(400).json(
            new apiResponse(400, null, "subdomain, contactName, mobileNo and email are required")
        );
    }

    const cleanSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, "");

    // Email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json(new apiResponse(400, null, "Please enter a valid email address"));
    }

    // Mobile format check
    if (!/^\d{10}$/.test(mobileNo.replace(/\D/g, ""))) {
        return res.status(400).json(new apiResponse(400, null, "Please enter a valid 10-digit mobile number"));
    }

    // Subdomain already taken? (exclude same email ki registrations ? upsert handle karega)
    const subdomainTaken = await Tenant.findOne({ subdomain: cleanSubdomain }) ||
        await SchoolRegistration.findOne({
            subdomain: cleanSubdomain,
            schoolEmail: { $ne: email.toLowerCase().trim() },   // ignore registrations from the same email ? upsert will handle it
            status: { $in: ["LEAD", "VERIFIED", "PAYMENT_PENDING", "COMPLETED"] },
        });

    if (subdomainTaken) {
        return res.status(400).json(
            new apiResponse(400, null, "This subdomain is already taken. Please try another.")
        );
    }

    // Email already COMPLETED? (sirf tab block karo jab school create ho chuki ho)
    const existingCompleted = await SchoolRegistration.findOne({
        schoolEmail: email.toLowerCase().trim(),
        status: "COMPLETED",
    });
    if (existingCompleted) {
        return res.status(400).json(
            new apiResponse(400, null, "A school with this email already exists. Please login.")
        );
    }

    const otp       = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Upsert logic:
    // - PENDING_VERIFICATION: OTP nahi hua, update karo
    // - LEAD: OTP ho chuka, lekin school info pending ? update karo (user ne data change kiya)
    // - COMPLETED: block (upar check ho chuka)
    const existing = await SchoolRegistration.findOne({
        schoolEmail: email.toLowerCase().trim(),
        status: { $in: ["PENDING_VERIFICATION", "LEAD"] },
    });

    let registration;

    if (existing) {
        existing.subdomain        = cleanSubdomain;
        existing.contactName      = contactName;
        existing.mobileNo         = mobileNo.replace(/\D/g, "");
        existing.whatsappNo       = (whatsappNo || mobileNo).replace(/\D/g, "");
        existing.otp              = otp;
        existing.otpExpiry        = otpExpiry;
        existing.isEmailVerified  = false;   // requires re-verification
        existing.status           = "PENDING_VERIFICATION";
        await existing.save();
        registration = existing;
    } else {
        registration = await SchoolRegistration.create({
            subdomain:       cleanSubdomain,
            contactName,
            schoolEmail:     email.toLowerCase().trim(),
            schoolContact:   mobileNo.replace(/\D/g, ""),
            mobileNo:        mobileNo.replace(/\D/g, ""),
            whatsappNo:      (whatsappNo || mobileNo).replace(/\D/g, ""),
            // schoolName required ? temp value, will be updated in Step 2
            schoolName:      contactName,
            source:          "website",
            otp,
            otpExpiry,
        });
    }

    // Send OTP email
    try {
        await sendOtpEmail({ to: email, schoolName: contactName, otp });
    } catch (emailErr) {
        console.error("?? Lead OTP email failed (non-fatal):", emailErr.message);
        console.log(`[DEV] OTP for ${email}: ${otp}`);
    }

    return res.status(200).json(
        new apiResponse(200,
            { registrationId: registration._id, devOtp: otp },
            `OTP sent to ${email}. Valid for 10 minutes.`
        )
    );
});

// -------------------------------------------------------------
// NEW FLOW ? STEP 1c: Resend OTP (by registrationId)
// POST /onboarding/resend-otp
// Body: { registrationId }
// -------------------------------------------------------------
export const resendLeadOtp = asyncHandler(async (req, res) => {
    const { registrationId } = req.body;

    if (!registrationId) {
        return res.status(400).json(new apiResponse(400, null, "registrationId is required"));
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res.status(404).json(new apiResponse(404, null, "Registration not found"));
    }

    if (registration.status === "COMPLETED") {
        return res.status(400).json(new apiResponse(400, null, "School is already registered."));
    }

    const otp       = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    registration.otp             = otp;
    registration.otpExpiry       = otpExpiry;
    registration.isEmailVerified = false;
    if (registration.status !== "LEAD") {
        registration.status = "PENDING_VERIFICATION";
    }
    await registration.save();

    try {
        await sendOtpEmail({
            to:         registration.schoolEmail,
            schoolName: registration.contactName || registration.schoolName,
            otp,
        });
    } catch (emailErr) {
        console.error("?? Resend OTP email failed (non-fatal):", emailErr.message);
        console.log(`[DEV] Resend OTP for ${registration.schoolEmail}: ${otp}`);
    }

    return res.status(200).json(
        new apiResponse(200,
            { registrationId: registration._id, devOtp: otp },
            `OTP resent to ${registration.schoolEmail}.`
        )
    );
});

// -------------------------------------------------------------
// NEW FLOW ? STEP 1b: Verify Lead OTP ? mark as LEAD
// POST /onboarding/verify-lead-otp
// Body: { registrationId, otp }
// -------------------------------------------------------------
export const verifyLeadOtp = asyncHandler(async (req, res) => {
    const { registrationId, otp } = req.body;

    if (!registrationId || !otp) {
        return res.status(400).json(new apiResponse(400, null, "registrationId and otp are required"));
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res.status(404).json(new apiResponse(404, null, "Registration not found"));
    }

    if (registration.isEmailVerified) {
        return res.status(200).json(
            new apiResponse(200, { registrationId: registration._id }, "Email is already verified")
        );
    }

    if (registration.otp !== otp) {
        return res.status(400).json(new apiResponse(400, null, "Invalid OTP. Please try again."));
    }

    if (!registration.otpExpiry || new Date() > registration.otpExpiry) {
        return res.status(400).json(new apiResponse(400, null, "OTP has expired. Please request a new one."));
    }

    // Mark as LEAD ? OTP verified, school info pending
    registration.otp             = undefined;
    registration.otpExpiry       = undefined;
    registration.isEmailVerified = true;
    registration.status          = "LEAD";
    await registration.save();

    // Notify marketing team — fire-and-forget (never blocks the response)
    sendLeadNotification({
        contactName:    registration.contactName || registration.schoolName,
        email:          registration.schoolEmail,
        mobileNo:       registration.mobileNo   || registration.schoolContact,
        whatsappNo:     registration.whatsappNo || registration.mobileNo || registration.schoolContact,
        subdomain:      registration.subdomain,
        source:         registration.source || "website",
        registrationId: registration._id.toString(),
    }).catch(() => {});

    return res.status(200).json(
        new apiResponse(200, { registrationId: registration._id }, "OTP verified successfully. Please fill in your school details.")
    );
});

// -------------------------------------------------------------
// NEW FLOW ? STEP 2: Create School from Lead
// POST /onboarding/create-school
// Body: { registrationId, schoolName, schoolAddress, logo, affiliationBoard, subdomain? }
// -------------------------------------------------------------
export const createSchoolFromLead = asyncHandler(async (req, res) => {
    const {
        registrationId,
        schoolName,
        schoolAddress,
        logo,
        affiliationBoard,   // = affiliationLine in tenant model
        affiliationNo,
        schoolCode,
        estNo,
        schoolMedium,
        description,
        city,
        state,
        pincode,
    } = req.body;

    if (!registrationId || !schoolName) {
        return res.status(400).json(
            new apiResponse(400, null, "registrationId and schoolName are required")
        );
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res.status(404).json(new apiResponse(404, null, "Registration not found"));
    }

    if (!registration.isEmailVerified) {
        return res.status(400).json(new apiResponse(400, null, "Email not verified. Please verify your OTP first."));
    }

    if (registration.status === "COMPLETED") {
        const existingTenant = await Tenant.findById(registration.tenantId);
        if (existingTenant) {
            return res.status(200).json(
                new apiResponse(200, {
                    subdomain: existingTenant.subdomain,
                    loginUrl: buildLoginUrl(existingTenant.subdomain),
                    schoolName: existingTenant.schoolName,
                    schoolEmail: existingTenant.schoolEmail,
                    alreadyExists: true,
                }, "School is already registered. Please login.")
            );
        }
    }

    // -- Generate / validate subdomain ------------------------
    let subdomain = registration.subdomain ||
        schoolName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

    let attempt = 0;
    while (await Tenant.findOne({ subdomain })) {
        subdomain = `${registration.subdomain || schoolName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15)}${++attempt}`;
    }

    const dbUri = `${process.env.BASE_DB_URI.replace(/\/$/, "")}/${subdomain}`;

    // -- Create Tenant -----------------------------------------
    const tenant = await Tenant.create({
        schoolName,
        schoolEmail:     registration.schoolEmail,
        schoolContact:   registration.mobileNo || registration.schoolContact,
        schoolContactAlt: registration.whatsappNo,
        schoolAddress:   schoolAddress || "",
        city:            city || "",
        state:           state || "",
        pincode:         pincode || "",
        subdomain,
        dbUri,
        isActive:        true,
        logo:            logo || "",
        description:     description || "",
        affiliationLine: affiliationBoard || "",
        affiliationNo:   affiliationNo || "",
        schoolCode:      schoolCode || "",
        estNo:           estNo || "",
        schoolMedium:    schoolMedium || "",
    });

    // -- Setup Tenant DB ---------------------------------------
    const tenantDB = await getTenantDB(dbUri);
    const User     = getUserModel(tenantDB);
    const Session  = getSessionModel(tenantDB);

    const superAdminUserId   = `superadmin_${subdomain}`;
    const superAdminPassword = Math.random().toString(36).slice(-8);
    const adminUserId        = `admin_${subdomain}`;
    const adminPassword      = Math.random().toString(36).slice(-8);

    await User.create({
        userId:   superAdminUserId,
        password: superAdminPassword,
        role:     "SuperAdmin",
        name:     "Super Admin",
        isNew:    false,
    });

    await User.create({
        userId:   adminUserId,
        password: adminPassword,
        role:     "Admin",
        name:     "School Admin",
        isNew:    false,
    });

    await Session.create({
        sessionName: getCurrentSession(),
        isCurrent:   true,
        isActive:    true,
    });

    await setupDefaultMasters(tenantDB);

    // -- Auto-assign Dynamic Free Trial Subscription ---------
    // Admin panel se configured default active trial package use karo.
    // Agar koi default active package nahi hai toh school create hogi
    // lekin bina trial ke (NO_SUBSCRIPTION state mein rahegi).
    // Hardcoded 30-day / 350-student fallback REMOVED.
    let trialPackage = null;
    try {
        trialPackage = await FreeTrialPackage.findOne({
            isDefault: true,
            isActive:  true,
        }).lean();

        // Fallback: agar koi default nahi set to koi bhi active package le lo
        if (!trialPackage) {
            trialPackage = await FreeTrialPackage.findOne({ isActive: true })
                .sort({ createdAt: -1 })
                .lean();
        }
    } catch (_) { /* ignore — no trial will be assigned */ }

    let trialEndDate = null;
    let TRIAL_DAYS   = 0;
    let TRIAL_STUDENT_LIMIT = 0;

    if (trialPackage) {
        TRIAL_DAYS          = trialPackage.durationDays;
        TRIAL_STUDENT_LIMIT = trialPackage.studentLimit;
        trialEndDate        = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DAYS);
    }

    const trialStart = new Date();

    try {
        if (trialPackage) {
            await TenantSubscription.create({
                tenantId: tenant._id,
                currentPlan: {
                    name:         trialPackage.name,
                    price:        0,
                    pricingModel: "FIXED",
                    studentLimit: TRIAL_STUDENT_LIMIT,
                    billingCycle: "Monthly",
                    startDate:    trialStart,
                    endDate:      trialEndDate,
                },
                isTrial:              true,
                trialEndDate,
                totalStudentLimit:    TRIAL_STUDENT_LIMIT,
                totalAmount:          0,
                status:               "TRIAL",
                usedTrialPackageIds:  [trialPackage._id],
                history: [
                    {
                        type:         "TRIAL_START",
                        name:         trialPackage.name,
                        price:        0,
                        studentLimit: TRIAL_STUDENT_LIMIT,
                        startDate:    trialStart,
                        endDate:      trialEndDate,
                    },
                ],
            });
            console.log(`? ${TRIAL_DAYS}-day trial activated for tenant: ${subdomain} | Package: "${trialPackage.name}" | Limit: ${TRIAL_STUDENT_LIMIT} students`);
        } else {
            // No active trial package configured ? create subscription in PENDING state
            // Admin will assign a plan manually later
            await TenantSubscription.create({
                tenantId:          tenant._id,
                isTrial:           false,
                totalStudentLimit: 0,
                totalAmount:       0,
                status:            "PENDING",
                history:           [],
            });
            console.warn(`??  No active free trial package found. Tenant "${subdomain}" created with PENDING subscription. Admin must assign a plan.`);
        }
    } catch (subErr) {
        // Trial/subscription create fail — school creation should NOT be blocked
        console.error("??  Subscription create failed (non-fatal):", subErr.message);
    }

    // -- Update Registration to COMPLETED ---------------------
    registration.schoolName      = schoolName;
    registration.schoolAddress   = schoolAddress || registration.schoolAddress;
    registration.logo            = logo || registration.logo;
    registration.affiliationLine = affiliationBoard || registration.affiliationLine;
    registration.city            = city    || registration.city;
    registration.state           = state   || registration.state;
    registration.pincode         = pincode || registration.pincode;
    registration.status          = "COMPLETED";
    registration.subdomain       = subdomain;
    registration.tenantId        = tenant._id;
    await registration.save();

    // -- Send Credentials (email) ------------------------------
    let emailSent = false;
    try {
        await sendSchoolCredentials({
            to:                 registration.schoolEmail,
            schoolName,
            schoolSubdomain:    subdomain,
            superAdminUserId,
            superAdminPassword,
            adminUserId,
            adminPassword,
        });
        emailSent = true;
        console.log(`? Credentials email sent to ${registration.schoolEmail}`);
    } catch (emailErr) {
        console.error("? Credentials email FAILED:", emailErr.message);
        console.error("   EMAIL_USER:", process.env.EMAIL_USER);
        console.error("   EMAIL_PASS set:", !!process.env.EMAIL_PASS);
    }

    return res.status(200).json(
        new apiResponse(200, {
            subdomain,
            loginUrl: buildLoginUrl(subdomain),
            credentials: {
                superAdmin: { userId: superAdminUserId, password: superAdminPassword },
                admin:      { userId: adminUserId,      password: adminPassword },
            },
            schoolName,
            schoolEmail: registration.schoolEmail,
            emailSent,
            trial: trialPackage ? {
                active:       true,
                days:         TRIAL_DAYS,
                endsOn:       trialEndDate,
                planName:     trialPackage.name,
                studentLimit: TRIAL_STUDENT_LIMIT,
            } : {
                active:   false,
                message:  "No free trial available. Admin will assign a plan.",
            },
        }, trialPackage
            ? `School created successfully! ${TRIAL_DAYS}-day free trial activated. Login credentials have been sent to your email.`
            : `School created successfully! Login credentials have been sent to your email.`
        )
    );
});

// -------------------------------------------------------------
// STEP 1 ? Register School (send OTP) [LEGACY]
// -------------------------------------------------------------
export const registerSchool = asyncHandler(async (req, res) => {
    const {
        schoolName,
        schoolEmail,
        schoolContact,
        schoolAddress,
        city,
        state,
        pincode,
        expectedStudents,
        contactPersonName,
        contactPersonDesignation,
        // New fields matching admin panel
        subdomain: subdomainInput,
        schoolCode,
        estNo,
        schoolContactAlt,
        description,
        logo,
        affiliationLine,
        affiliationNo,
        schoolMedium,
        msmeRegNo,
        isoRegNo,
        regInfo,
        registrationNo,
        nitiAayog,
        managedBy,
        interestedPlanId,
        source,
        referralCode,
    } = req.body;

    if (!schoolName || !schoolEmail || !schoolContact) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "schoolName, schoolEmail & schoolContact are required"));
    }

    // Check if already registered and completed
    const existing = await SchoolRegistration.findOne({ schoolEmail });

    if (existing && existing.status === "COMPLETED") {
        return res
            .status(400)
            .json(new apiResponse(400, null, "School with this email already exists. Please login."));
    }

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    let registration;

    if (existing) {
        // Re-send OTP for existing pending/rejected registration
        existing.otp = otp;
        existing.otpExpiry = otpExpiry;
        existing.isEmailVerified = false;
        existing.status = "PENDING_VERIFICATION";
        existing.schoolName = schoolName;
        existing.schoolContact = schoolContact;
        // Update new fields on re-registration
        if (subdomainInput) existing.subdomain = subdomainInput.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (schoolCode) existing.schoolCode = schoolCode;
        if (estNo) existing.estNo = estNo;
        if (schoolAddress) existing.schoolAddress = schoolAddress;
        if (schoolContactAlt) existing.schoolContactAlt = schoolContactAlt;
        if (description) existing.description = description;
        if (logo) existing.logo = logo;
        if (affiliationLine) existing.affiliationLine = affiliationLine;
        if (affiliationNo) existing.affiliationNo = affiliationNo;
        if (schoolMedium) existing.schoolMedium = schoolMedium;
        if (msmeRegNo) existing.msmeRegNo = msmeRegNo;
        if (isoRegNo) existing.isoRegNo = isoRegNo;
        if (regInfo) existing.regInfo = regInfo;
        if (registrationNo) existing.registrationNo = registrationNo;
        if (nitiAayog) existing.nitiAayog = nitiAayog;
        if (managedBy) existing.managedBy = managedBy;
        await existing.save();
        registration = existing;
    } else {
        registration = await SchoolRegistration.create({
            schoolName,
            schoolEmail,
            schoolContact,
            schoolAddress,
            city,
            state,
            pincode,
            expectedStudents: expectedStudents || 0,
            contactPersonName,
            contactPersonDesignation,
            // New fields
            subdomain: subdomainInput
                ? subdomainInput.toLowerCase().replace(/[^a-z0-9-]/g, '')
                : undefined,
            schoolCode,
            estNo,
            schoolContactAlt,
            description,
            logo,
            affiliationLine,
            affiliationNo,
            schoolMedium,
            msmeRegNo,
            isoRegNo,
            regInfo,
            registrationNo,
            nitiAayog,
            managedBy,
            interestedPlanId,
            source: source || "website",
            referralCode,
            otp,
            otpExpiry,
        });
    }

    // Send OTP email
    try {
        await sendOtpEmail({
            to: schoolEmail,
            schoolName,
            otp,
        });
    } catch (emailErr) {
        console.error("?? OTP email failed (non-fatal):", emailErr.message);
        // Do not block registration if email fails ? OTP is still saved in DB
        // Admin can resend manually or user can request resend
    }

    return res.status(200).json(
        new apiResponse(
            200,
            { registrationId: registration._id, devOtp: otp },
            `OTP sent to ${schoolEmail}. Valid for 10 minutes.`
        )
    );
});

// -------------------------------------------------------------
// STEP 2 ? Verify OTP
// -------------------------------------------------------------
export const verifyOtp = asyncHandler(async (req, res) => {
    const { registrationId, otp } = req.body;

    if (!registrationId || !otp) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "registrationId & otp required"));
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Registration not found"));
    }

    if (registration.isEmailVerified) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Email already verified"));
    }

    if (registration.otp !== otp) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid OTP"));
    }

    if (new Date() > registration.otpExpiry) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "OTP expired. Please request a new one."));
    }

    // Clear OTP, mark verified
    registration.otp = undefined;
    registration.otpExpiry = undefined;
    registration.isEmailVerified = true;
    registration.status = "VERIFIED";
    await registration.save();

    return res.status(200).json(
        new apiResponse(200, { registrationId: registration._id }, "Email verified successfully")
    );
});

// -------------------------------------------------------------
// STEP 3 ? Get Public Plans (for pricing page)
// -------------------------------------------------------------
export const getPublicPlans = asyncHandler(async (req, res) => {
    const plans = await SubscriptionPlan.find({
        isActive: true,
        planType: "Plan",
    }).sort({ sortOrder: 1, price: 1 });

    const addons = await SubscriptionPlan.find({
        isActive: true,
        planType: "Addon",
    }).sort({ sortOrder: 1 });

    return res.status(200).json(
        new apiResponse(200, { plans, addons }, "Plans fetched")
    );
});

// -------------------------------------------------------------
// STEP 3b ? Calculate Price (before order creation)
// -------------------------------------------------------------
export const calculatePlanPrice = asyncHandler(async (req, res) => {
    const { planId, committedStudents = 0, billingCycle = "Monthly" } = req.body;

    if (!planId) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "planId required"));
    }

    const plan = await SubscriptionPlan.findById(planId);

    if (!plan || !plan.isActive) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Plan not found"));
    }

    const breakdown = calculatePrice(plan, committedStudents, billingCycle);

    return res.status(200).json(
        new apiResponse(
            200,
            {
                plan: {
                    _id: plan._id,
                    name: plan.name,
                    pricingModel: plan.pricingModel,
                    billingCycle: plan.billingCycle,
                    yearlyDiscountPercent: plan.yearlyDiscountPercent,
                    trialDays: plan.trialDays,
                },
                committedStudents,
                breakdown,
            },
            "Price calculated"
        )
    );
});

// -------------------------------------------------------------
// STEP 4 ? Create Razorpay Order
// -------------------------------------------------------------
export const createOnboardingOrder = asyncHandler(async (req, res) => {
    const { registrationId, planId, committedStudents = 0, billingCycle: billingCycleBody, billing } = req.body;
    const billingCycle = billingCycleBody || billing || "Monthly";

    if (!registrationId || !planId) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "registrationId & planId required"));
    }

    // Check Razorpay keys early ? give clear error instead of crashing
    if (!process.env.RAZORPAY_KEY || process.env.RAZORPAY_KEY === "your_key" ||
        !process.env.RAZORPAY_SECRET || process.env.RAZORPAY_SECRET === "your_secret") {
        return res
            .status(503)
            .json(new apiResponse(503, null, "Payment gateway not configured. Please contact support."));
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Registration not found"));
    }

    if (!registration.isEmailVerified) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Email not verified. Verify OTP first."));
    }

    const plan = await SubscriptionPlan.findById(planId);

    if (!plan || !plan.isActive) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Plan not found"));
    }

    const breakdown = calculatePrice(plan, committedStudents, billingCycle);

    if (breakdown.total === 0) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Total amount is 0. Use trial endpoint instead."));
    }

    const razorpay = getRazorpay();

    const receipt = `reg_${registration._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`

    const order = await razorpay.orders.create({
        amount: breakdown.total * 100, // paise
        currency: "INR",
        receipt,
        notes: {
            registrationId: registration._id.toString(),
            planId: plan._id.toString(),
            schoolName: registration.schoolName,
        },
    });

    // Save pending order on registration
    registration.interestedPlanId = plan._id;
    registration.razorpayOrderId = order.id;
    registration.status = "PAYMENT_PENDING";
    await registration.save();

    return res.status(200).json(
        new apiResponse(
            200,
            {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                breakdown,
                plan: {
                    _id: plan._id,
                    name: plan.name,
                    trialDays: plan.trialDays,
                },
                razorpayKey: process.env.RAZORPAY_KEY,
            },
            "Order created"
        )
    );
});

// -------------------------------------------------------------
// STEP 5 ? Verify Payment + Auto-Create Tenant
// -------------------------------------------------------------
export const verifyOnboardingPayment = asyncHandler(async (req, res) => {
    const {
        registrationId,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        planId,
        committedStudents = 0,
        billingCycle = "Monthly",
    } = req.body;

    // -- Verify Razorpay signature --------------------------
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET)
        .update(body)
        .digest("hex");

    if (expectedSignature !== razorpay_signature) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Payment verification failed. Invalid signature."));
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Registration not found"));
    }

    if (registration.status === "COMPLETED") {
        return res
            .status(400)
            .json(new apiResponse(400, null, "School already onboarded"));
    }

    const plan = await SubscriptionPlan.findById(planId);

    if (!plan) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Plan not found"));
    }

    const breakdown = calculatePrice(plan, committedStudents, billingCycle);

    // -- Generate subdomain --------------------------------
    let subdomain = registration.subdomain || generateSubdomain(registration.schoolName);

    // Ensure uniqueness
    let attempt = 0;
    while (await Tenant.findOne({ subdomain })) {
        subdomain = generateSubdomain(registration.schoolName) + (++attempt);
    }

    // -- Create Tenant -------------------------------------
    const dbUri = `${process.env.BASE_DB_URI.replace(/\/$/, "")}/${subdomain}`;

    const tenant = await Tenant.create({
        schoolName: registration.schoolName,
        schoolEmail: registration.schoolEmail,
        schoolContact: registration.schoolContact,
        schoolAddress: registration.schoolAddress,
        subdomain,
        dbUri,
        isActive: true,
        // Additional fields from registration
        schoolCode: registration.schoolCode,
        estNo: registration.estNo,
        schoolContactAlt: registration.schoolContactAlt,
        description: registration.description,
        logo: registration.logo,
        affiliationLine: registration.affiliationLine,
        affiliationNo: registration.affiliationNo,
        schoolMedium: registration.schoolMedium,
        msmeRegNo: registration.msmeRegNo,
        isoRegNo: registration.isoRegNo,
        regInfo: registration.regInfo,
        registrationNo: registration.registrationNo,
        nitiAayog: registration.nitiAayog,
        managedBy: registration.managedBy,
    });

    // -- Set up tenant DB ----------------------------------
    const tenantDB = await getTenantDB(dbUri);
    const User = getUserModel(tenantDB);
    const Session = getSessionModel(tenantDB);

    const superAdminUserId = `superadmin_${subdomain}`;
    const superAdminPassword = Math.random().toString(36).slice(-8);

    const adminUserId = `admin_${subdomain}`;
    const adminPassword = Math.random().toString(36).slice(-8);

    await User.create({
        userId: superAdminUserId,
        password: superAdminPassword,
        role: "SuperAdmin",
        name: "Super Admin",
        isNew: false,
    });

    await User.create({
        userId: adminUserId,
        password: adminPassword,
        role: "Admin",
        name: "School Admin",
        isNew: false,
    });

    await Session.create({
        sessionName: getCurrentSession(),
        isCurrent: true,
        isActive: true,
    });

    await setupDefaultMasters(tenantDB);

    // -- Create Subscription -------------------------------
    const startDate = new Date();
    const endDate = new Date();

    if (billingCycle === "Yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 1);
    }

    await TenantSubscription.create({
        tenantId: tenant._id,
        currentPlan: {
            planId: plan._id,
            name: plan.name,
            price: breakdown.baseAmount,
            originalPrice: plan.price,
            pricingModel: plan.pricingModel,
            pricePerStudent: plan.pricePerStudent,
            committedStudents,
            studentLimit: breakdown.studentLimit,
            billingCycle,
            startDate,
            endDate,
            setupFeePaid: breakdown.setupFee,
        },
        totalStudentLimit: breakdown.studentLimit,
        totalAmount: breakdown.total,
        status: "ACTIVE",
        history: [
            {
                type: "PLAN_PURCHASE",
                planId: plan._id,
                name: plan.name,
                price: breakdown.baseAmount,
                pricingModel: plan.pricingModel,
                committedStudents,
                studentLimit: breakdown.studentLimit,
                razorpayPaymentId: razorpay_payment_id,
                startDate,
                endDate,
            },
        ],
    });

    // -- Update Registration -------------------------------
    registration.status = "COMPLETED";
    registration.subdomain = subdomain;
    registration.tenantId = tenant._id;
    registration.razorpayPaymentId = razorpay_payment_id;
    await registration.save();

    // -- Send credentials email ----------------------------
    await sendSchoolCredentials({
        to: registration.schoolEmail,
        schoolName: registration.schoolName,
        schoolSubdomain: subdomain,
        superAdminUserId,
        superAdminPassword,
        adminUserId,
        adminPassword,
    });

    return res.status(200).json(
        new apiResponse(
            200,
            {
                subdomain,
                loginUrl: buildLoginUrl(subdomain),
                credentials: {
                    superAdmin: { userId: superAdminUserId },
                    admin: { userId: adminUserId },
                },
                // Plan info for success page
                plan: plan.name,
                planDescription: plan.description,
                trialDays: plan.trialDays || 0,
                studentLimit: breakdown.studentLimit,
                billingCycle,
                amount: breakdown.total,
                validTill: endDate,
                schoolName: registration.schoolName,
                schoolEmail: registration.schoolEmail,
            },
            "School registered & payment verified. Credentials sent to email."
        )
    );
});

// -------------------------------------------------------------
// STEP 4 (Alt) ? Start Free Trial (no payment)
// -------------------------------------------------------------
export const startTrial = asyncHandler(async (req, res) => {
    const { registrationId, planId } = req.body;

    if (!registrationId || !planId) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "registrationId & planId required"));
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Registration not found"));
    }

    if (!registration.isEmailVerified) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Verify email first"));
    }

    if (registration.status === "COMPLETED") {
        return res
            .status(400)
            .json(new apiResponse(400, null, "School already onboarded"));
    }

    const plan = await SubscriptionPlan.findById(planId);

    if (!plan || !plan.isActive || !plan.trialDays) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Plan not found or no trial available"));
    }

    // -- Generate subdomain --------------------------------
    let subdomain = registration.subdomain || generateSubdomain(registration.schoolName);

    let attempt = 0;
    while (await Tenant.findOne({ subdomain })) {
        subdomain = generateSubdomain(registration.schoolName) + (++attempt);
    }

    const dbUri = `${process.env.BASE_DB_URI.replace(/\/$/, "")}/${subdomain}`;

    // -- Create Tenant -------------------------------------
    const tenant = await Tenant.create({
        schoolName: registration.schoolName,
        schoolEmail: registration.schoolEmail,
        schoolContact: registration.schoolContact,
        schoolAddress: registration.schoolAddress,
        subdomain,
        dbUri,
        isActive: true,
        // Additional fields from registration
        schoolCode: registration.schoolCode,
        estNo: registration.estNo,
        schoolContactAlt: registration.schoolContactAlt,
        description: registration.description,
        logo: registration.logo,
        affiliationLine: registration.affiliationLine,
        affiliationNo: registration.affiliationNo,
        schoolMedium: registration.schoolMedium,
        msmeRegNo: registration.msmeRegNo,
        isoRegNo: registration.isoRegNo,
        regInfo: registration.regInfo,
        registrationNo: registration.registrationNo,
        nitiAayog: registration.nitiAayog,
        managedBy: registration.managedBy,
    });

    const tenantDB = await getTenantDB(dbUri);
    const User = getUserModel(tenantDB);
    const Session = getSessionModel(tenantDB);

    const superAdminUserId = `superadmin_${subdomain}`;
    const superAdminPassword = Math.random().toString(36).slice(-8);

    const adminUserId = `admin_${subdomain}`;
    const adminPassword = Math.random().toString(36).slice(-8);

    await User.create({
        userId: superAdminUserId,
        password: superAdminPassword,
        role: "SuperAdmin",
        name: "Super Admin",
        isNew: false,
    });

    await User.create({
        userId: adminUserId,
        password: adminPassword,
        role: "Admin",
        name: "School Admin",
        isNew: false,
    });

    await Session.create({
        sessionName: getCurrentSession(),
        isCurrent: true,
        isActive: true,
    });

    await setupDefaultMasters(tenantDB);

    // -- Create Trial Subscription -------------------------
    const startDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + plan.trialDays);

    // studentLimit > 0 ? use plan's limit; 0 ? fallback to 350 (prevent unlimited trial)
    const trialStudentLimit = plan.studentLimit > 0 ? plan.studentLimit : 350;

    await TenantSubscription.create({
        tenantId: tenant._id,
        currentPlan: {
            planId: plan._id,
            name: plan.name,
            price: 0,
            studentLimit: trialStudentLimit,
            billingCycle: "Monthly",
            startDate,
            endDate: trialEndDate,
        },
        isTrial: true,
        trialEndDate,
        totalStudentLimit: trialStudentLimit,
        totalAmount: 0,
        status: "TRIAL",
        history: [
            {
                type: "TRIAL_START",
                planId: plan._id,
                name: plan.name,
                price: 0,
                studentLimit: plan.studentLimit,
                startDate,
                endDate: trialEndDate,
            },
        ],
    });

    registration.status = "COMPLETED";
    registration.subdomain = subdomain;
    registration.tenantId = tenant._id;
    await registration.save();

    await sendSchoolCredentials({
        to: registration.schoolEmail,
        schoolName: registration.schoolName,
        schoolSubdomain: subdomain,
        superAdminUserId,
        superAdminPassword,
        adminUserId,
        adminPassword,
    });

    return res.status(200).json(
        new apiResponse(
            200,
            {
                subdomain,
                loginUrl: buildLoginUrl(subdomain),
                trialEndsOn: trialEndDate,
                credentials: {
                    superAdmin: { userId: superAdminUserId },
                    admin: { userId: adminUserId },
                },
                // Plan info for success page
                plan: plan.name,
                planDescription: plan.description,
                trialDays: plan.trialDays,
                studentLimit: plan.studentLimit,
                billingCycle: "Monthly",
                amount: 0,
                schoolName: registration.schoolName,
                schoolEmail: registration.schoolEmail,
            },
            `Trial started. ${plan.trialDays} days free access. Credentials sent to email.`
        )
    );
});

// -------------------------------------------------------------
// NEW FLOW ? Register Free (no plan, no payment)
// POST /onboarding/register-free
// Body: { registrationId }
// OTP must be verified first (via verify-otp endpoint)
// This endpoint directly creates the tenant
// -------------------------------------------------------------
export const registerFree = asyncHandler(async (req, res) => {
    const { registrationId } = req.body;

    if (!registrationId) {
        return res.status(400).json(new apiResponse(400, null, "registrationId required"));
    }

    const registration = await SchoolRegistration.findById(registrationId);

    if (!registration) {
        return res.status(404).json(new apiResponse(404, null, "Registration not found"));
    }

    if (!registration.isEmailVerified) {
        return res.status(400).json(new apiResponse(400, null, "Email not verified. Please verify your OTP first."));
    }

    if (registration.status === "COMPLETED") {
        // Already created ? credentials email bhej do dobara
        const existingTenant = await Tenant.findOne({ schoolEmail: registration.schoolEmail });
        if (existingTenant) {
            return res.status(200).json(
                new apiResponse(200, {
                    subdomain: existingTenant.subdomain,
                    loginUrl: buildLoginUrl(existingTenant.subdomain),
                    schoolName: existingTenant.schoolName,
                    schoolEmail: existingTenant.schoolEmail,
                    alreadyExists: true,
                }, "School already registered. Please login.")
            );
        }
    }

    // -- Generate subdomain --------------------------------
    let subdomain = registration.subdomain || generateSubdomain(registration.schoolName);

    let attempt = 0;
    while (await Tenant.findOne({ subdomain })) {
        subdomain = generateSubdomain(registration.schoolName) + (++attempt);
    }

    const dbUri = `${process.env.BASE_DB_URI.replace(/\/$/, "")}/${subdomain}`;

    // -- Create Tenant -------------------------------------
    const tenant = await Tenant.create({
        schoolName: registration.schoolName,
        schoolEmail: registration.schoolEmail,
        schoolContact: registration.schoolContact,
        schoolAddress: registration.schoolAddress,
        subdomain,
        dbUri,
        isActive: true,
        schoolCode: registration.schoolCode,
        estNo: registration.estNo,
        schoolContactAlt: registration.schoolContactAlt,
        description: registration.description,
        logo: registration.logo,
        city: registration.city,
        state: registration.state,
        pincode: registration.pincode,
        affiliationLine: registration.affiliationLine,
        affiliationNo: registration.affiliationNo,
        schoolMedium: registration.schoolMedium,
        msmeRegNo: registration.msmeRegNo,
        isoRegNo: registration.isoRegNo,
        regInfo: registration.regInfo,
        registrationNo: registration.registrationNo,
        nitiAayog: registration.nitiAayog,
        managedBy: registration.managedBy,
    });

    // -- Setup Tenant DB (users, session, masters) ---------
    const tenantDB = await getTenantDB(dbUri);
    const User = getUserModel(tenantDB);
    const Session = getSessionModel(tenantDB);

    const superAdminUserId = `superadmin_${subdomain}`;
    const superAdminPassword = Math.random().toString(36).slice(-8);

    const adminUserId = `admin_${subdomain}`;
    const adminPassword = Math.random().toString(36).slice(-8);

    await User.create({
        userId: superAdminUserId,
        password: superAdminPassword,
        role: "SuperAdmin",
        name: "Super Admin",
        isNew: false,
    });

    await User.create({
        userId: adminUserId,
        password: adminPassword,
        role: "Admin",
        name: "School Admin",
        isNew: false,
    });

    await Session.create({
        sessionName: getCurrentSession(),
        isCurrent: true,
        isActive: true,
    });

    await setupDefaultMasters(tenantDB);

    // -- Update Registration -------------------------------
    registration.status = "COMPLETED";
    registration.subdomain = subdomain;
    registration.tenantId = tenant._id;
    await registration.save();

    // -- Send credentials email ----------------------------
    try {
        await sendSchoolCredentials({
            to: registration.schoolEmail,
            schoolName: registration.schoolName,
            schoolSubdomain: subdomain,
            superAdminUserId,
            superAdminPassword,
            adminUserId,
            adminPassword,
        });
    } catch (emailErr) {
        console.error("?? Credentials email failed (non-fatal):", emailErr.message);
    }

    return res.status(200).json(
        new apiResponse(200, {
            subdomain,
            loginUrl: buildLoginUrl(subdomain),
            credentials: {
                superAdmin: { userId: superAdminUserId },
                admin: { userId: adminUserId },
            },
            schoolName: registration.schoolName,
            schoolEmail: registration.schoolEmail,
        }, "School registered successfully. Login credentials sent to email.")
    );
});

// -------------------------------------------------------------
// PUBLIC ? My Plan: Step 1 ? Email se OTP bhejo
// -------------------------------------------------------------
export const sendMyPlanOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json(new apiResponse(400, null, "email required"));
    }

    const tenant = await Tenant.findOne({ schoolEmail: email.toLowerCase().trim() });

    if (!tenant) {
        return res.status(404).json(new apiResponse(404, null, "No school found with this email address"));
    }

    const otp        = generateOtp();
    const otpExpiry  = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Reuse SchoolRegistration to store the OTP temporarily (status doesn't matter here)
    await SchoolRegistration.findOneAndUpdate(
        { schoolEmail: email.toLowerCase().trim() },
        { myPlanOtp: otp, myPlanOtpExpiry: otpExpiry },
        { new: true }
    );

    try {
        await sendOtpEmail({ to: email, schoolName: tenant.schoolName, otp });
    } catch (emailErr) {
        console.error("?? My-plan OTP email failed:", emailErr.message);
    }

    return res.status(200).json(
        new apiResponse(200, null, `OTP sent to ${email}. Valid for 10 minutes.`)
    );
});

// -------------------------------------------------------------
// PUBLIC ? My Plan: Step 2 ? Verify OTP and return plan details
// -------------------------------------------------------------
export const getMyPlan = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json(new apiResponse(400, null, "email and otp are required"));
    }

    // Check OTP
    const registration = await SchoolRegistration.findOne({
        schoolEmail: email.toLowerCase().trim(),
    });

    if (!registration) {
        return res.status(404).json(new apiResponse(404, null, "No record found for this email"));
    }

    if (!registration.myPlanOtp || registration.myPlanOtp !== otp) {
        return res.status(400).json(new apiResponse(400, null, "Invalid OTP"));
    }

    if (!registration.myPlanOtpExpiry || new Date() > registration.myPlanOtpExpiry) {
        return res.status(400).json(new apiResponse(400, null, "OTP has expired. Please request a new one."));
    }

    // Clear OTP
    registration.myPlanOtp        = undefined;
    registration.myPlanOtpExpiry  = undefined;
    await registration.save();

    // Find tenant
    const tenant = await Tenant.findOne({ schoolEmail: email.toLowerCase().trim() });

    if (!tenant) {
        return res.status(404).json(new apiResponse(404, null, "School account not found"));
    }

    // Find subscription
    const subscription = await TenantSubscription.findOne({ tenantId: tenant._id })
        .populate("currentPlan.planId", "name description features");

    if (!subscription) {
        return res.status(404).json(new apiResponse(404, null, "No active subscription found"));
    }

    const now      = new Date();
    const endDate  = subscription.currentPlan?.endDate;
    const isExpired = endDate ? now > new Date(endDate) : false;
    const daysLeft  = endDate
        ? Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24)))
        : null;
    const trialDaysLeft = subscription.trialEndDate
        ? Math.max(0, Math.ceil((new Date(subscription.trialEndDate) - now) / (1000 * 60 * 60 * 24)))
        : null;

    return res.status(200).json(
        new apiResponse(200, {
            school: {
                name:      tenant.schoolName,
                email:     tenant.schoolEmail,
                subdomain: tenant.subdomain,
                logo:      tenant.logo || null,
                loginUrl:  buildLoginUrl(tenant.subdomain),
                isActive:  tenant.isActive,
                tenantId:  tenant._id,   // installment fetch ke liye
            },
            plan: {
                name:          subscription.currentPlan?.name                    || "?",
                description:   subscription.currentPlan?.planId?.description     || null,
                features:      subscription.currentPlan?.planId?.features         || [],
                billingCycle:  subscription.currentPlan?.billingCycle             || "?",
                price:         subscription.currentPlan?.price                   || 0,
                // If totalStudentLimit is 0 (legacy/misconfigured trial), resolve properly:
                // 1. Use plan-level studentLimit if > 0
                // 2. For trial subscriptions, default to 350 so it never shows "Unlimited"
                // 3. Non-trial with 0 = genuinely unlimited (e.g. enterprise PER_STUDENT)
                studentLimit: (() => {
                    const total = subscription.totalStudentLimit || 0;
                    if (total > 0) return total;
                    const planLimit = subscription.currentPlan?.studentLimit || 0;
                    if (planLimit > 0) return planLimit;
                    if (subscription.isTrial) return 350;
                    return 0;
                })(),
                usedStudents:  subscription.usedStudents                         || 0,
                startDate:     subscription.currentPlan?.startDate               || null,
                endDate:       subscription.currentPlan?.endDate                 || null,
                trialEndDate:  subscription.trialEndDate                         || null,
                isTrial:       subscription.isTrial                              || false,
                status:        isExpired ? "EXPIRED" : subscription.status,
                daysLeft,
                trialDaysLeft,
                addons: (subscription.currentAddons || []).map((a) => ({
                    name:         a.name,
                    price:        a.price,
                    studentLimit: a.studentLimit,
                    quantity:     a.quantity,
                    addedAt:      a.addedAt,
                })),
            },
        }, "Plan details fetched successfully")
    );
});
export const getAllRegistrations = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        status,
        search = "",
        isPagination = "true",
    } = req.query;

    const match = {};

    if (status) match.status = status;

    if (search.trim()) {
        match.$or = [
            { schoolName: { $regex: search, $options: "i" } },
            { schoolEmail: { $regex: search, $options: "i" } },
        ];
    }

    const total = await SchoolRegistration.countDocuments(match);

    let query = SchoolRegistration.find(match)
        .sort({ createdAt: -1 })
        .populate("interestedPlanId", "name price pricingModel")
        .populate("tenantId", "schoolName subdomain isActive");

    if (isPagination === "true") {
        query = query
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));
    }

    const registrations = await query;

    return res.status(200).json(
        new apiResponse(
            200,
            {
                registrations,
                total,
                totalPages: Math.ceil(total / Number(limit)),
                currentPage: Number(page),
            },
            "Registrations fetched"
        )
    );
});



// -------------------------------------------------------------
// DELETE Registration
// DELETE /onboarding/registrations/:id   (admin only)
// -------------------------------------------------------------
export const deleteRegistration = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json(new apiResponse(400, null, "Registration ID is required"));
    }

    const registration = await SchoolRegistration.findById(id);

    if (!registration) {
        return res.status(404).json(new apiResponse(404, null, "Registration not found"));
    }

    // Block deleting COMPLETED registrations that have an active tenant
    if (registration.status === "COMPLETED" && registration.tenantId) {
        return res.status(400).json(
            new apiResponse(400, null, "Cannot delete a completed registration with an active school. Deactivate the school first.")
        );
    }

    await SchoolRegistration.findByIdAndDelete(id);

    return res.status(200).json(
        new apiResponse(200, { id }, "Registration deleted successfully")
    );
});
