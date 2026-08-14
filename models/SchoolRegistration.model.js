import mongoose from "mongoose";

/**
 * SchoolRegistration — Self-service onboarding
 *
 * Flow:
 *  1. School fills form → record created (status: PENDING_VERIFICATION)
 *  2. OTP sent to email/phone → school verifies (status: VERIFIED)
 *  3. School chooses plan + pays → tenant created (status: COMPLETED)
 *  4. OR: Admin manually approves → tenant created
 */
const SchoolRegistrationSchema = new mongoose.Schema(
    {
        // ── School Info ─────────────────────────────────────────
        schoolName: {
            type: String,
            required: true,
            trim: true,
        },
        schoolEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        schoolContact: {
            type: String,
            required: true,
        },
        schoolAddress: String,
        city: String,
        state: String,
        pincode: String,

        // Approx student count (used for per-student pricing)
        expectedStudents: {
            type: Number,
            default: 0,
        },

        contactPersonName: String,
        contactPersonDesignation: String,

        // ── Additional School Details ────────────────────────────
        schoolCode: String,
        estNo: String,
        schoolContactAlt: String,
        description: String,
        logo: String,

        // ── Registration & Accreditations ────────────────────────
        affiliationLine: String,
        affiliationNo: String,
        schoolMedium: String,
        msmeRegNo: String,
        isoRegNo: String,
        regInfo: String,
        registrationNo: String,
        nitiAayog: String,
        managedBy: String,

        // ── Subdomain (chosen or auto-generated) ────────────────
        subdomain: {
            type: String,
            lowercase: true,
            trim: true,
        },

        // ── Plan Interest ────────────────────────────────────────
        interestedPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SubscriptionPlan",
        },

        // ── Lead / Contact Person Info (Step 1) ─────────────────
        contactName: String,       // Person's name who is registering
        mobileNo: String,          // Primary mobile
        whatsappNo: String,        // WhatsApp number (may differ from mobile)

        // ── OTP Verification ────────────────────────────────────
        otp: String,
        otpExpiry: Date,
        isEmailVerified: {
            type: Boolean,
            default: false,
        },

        // ── My-Plan OTP (website plan lookup) ───────────────────
        myPlanOtp: String,
        myPlanOtpExpiry: Date,

        // ── Status ──────────────────────────────────────────────
        status: {
            type: String,
            enum: [
                "LEAD",                   // Step 1 done — OTP verified, school info pending
                "PENDING_VERIFICATION",   // OTP not verified yet
                "VERIFIED",               // Email verified, school info pending
                "PAYMENT_PENDING",        // Plan chosen, payment pending
                "COMPLETED",              // Tenant created, fully onboarded
                "REJECTED",               // Admin rejected
            ],
            default: "PENDING_VERIFICATION",
        },

        // ── After completion ─────────────────────────────────────
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
        },

        rejectionReason: String,

        // ── UTM / Source tracking ────────────────────────────────
        source: {
            type: String,   // "website", "referral", "google-ads" etc.
            default: "website",
        },
        referralCode: String,

        // Razorpay order for initial plan purchase
        razorpayOrderId: String,
        razorpayPaymentId: String,
    },
    { timestamps: true }
);

// Index for fast lookup
SchoolRegistrationSchema.index({ schoolEmail: 1 });
SchoolRegistrationSchema.index({ status: 1 });

export default mongoose.model("SchoolRegistration", SchoolRegistrationSchema);
