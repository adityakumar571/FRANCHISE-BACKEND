import mongoose from "mongoose";

const PlanSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        planType: {
            type: String,
            enum: ["Plan", "Addon"],
            default: "Plan",
            required: true,
        },

        description: String,

        // Fixed price
        price: {
            type: Number,
            default: 0,
        },

        billingCycle: {
            type: String,
            enum: ["Monthly", "Yearly"],
            default: "Monthly",
        },

        // Hard cap on student count
        studentLimit: {
            type: Number,
            default: 0,   // 0 means unlimited
        },

        // ── School Size Target ──────────────────────────────────
        // Just for display / filtering on pricing page
        targetSchoolSize: {
            type: String,
            enum: ["Small", "Medium", "Large", "Enterprise", "Any"],
            default: "Any",
        },

        // ── One-Time Setup Fee ──────────────────────────────────
        setupFee: {
            type: Number,
            default: 0,
        },

        // ── Trial ───────────────────────────────────────────────
        trialDays: {
            type: Number,
            default: 0,           // 0 = no trial
        },

        // ── Yearly Discount ─────────────────────────────────────
        yearlyDiscountPercent: {
            type: Number,
            default: 0,           // e.g. 15 means 15% off yearly
        },

        // ── Display ─────────────────────────────────────────────
        features: [String],

        isPopular: {
            type: Boolean,
            default: false,
        },

        sortOrder: {
            type: Number,
            default: 0,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

export default mongoose.model("SubscriptionPlan", PlanSchema);

