import mongoose from "mongoose";

const installmentSchema = new mongoose.Schema(
    {
        installmentNo: { type: Number, required: true },   // 1–12
        billingMonth: { type: String, required: true },     // "YYYY-MM"
        dueDate: Date,
        amount: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ["PENDING", "PAID", "OVERDUE"],
            default: "PENDING",
        },
        paidDate: Date,
        paymentRef: String,
        remarks: String,
    },
    { _id: false }
);

const TenantSubscriptionSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            unique: true,
        },

        // ── Current Active Plan ─────────────────────────────────
        currentPlan: {
            planId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "SubscriptionPlan",
            },
            name: String,
            price: Number,                  // Final calculated price (after discounts)
            originalPrice: Number,          // Price before discount
            pricingModel: String,           // "FIXED" | "PER_STUDENT"
            pricePerStudent: Number,        // Used when pricingModel = PER_STUDENT
            committedStudents: Number,      // Students committed at purchase time
            studentLimit: Number,
            billingCycle: String,
            startDate: Date,
            endDate: Date,
            setupFeePaid: {
                type: Number,
                default: 0,
            },
        },

        // ── Trial ───────────────────────────────────────────────
        isTrial: {
            type: Boolean,
            default: false,
        },
        trialEndDate: Date,

        // ── Dynamic Trial Tracking ───────────────────────────────
        // Tracks which FreeTrialPackage IDs this tenant has already used.
        // Prevents assigning the same trial package more than once
        // (unless admin resets eligibility via /reset-eligibility/:tenantId).
        usedTrialPackageIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref:  "FreeTrialPackage",
            },
        ],

        // ── Pending Razorpay Order (temp store) ─────────────────
        pendingOrder: {
            orderId: String,
            planId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "SubscriptionPlan",
            },
            committedStudents: Number,
            amountBreakdown: {
                baseAmount: Number,
                setupFee: Number,
                total: Number,
            },
            createdAt: Date,
        },

        // ── Add-ons ─────────────────────────────────────────────
        currentAddons: [
            {
                addonId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "SubscriptionPlan",
                },
                name: String,
                price: Number,
                studentLimit: Number,
                billingCycle: { type: String, default: "Monthly" },  // addon ki billing cycle
                quantity: {
                    type: Number,
                    default: 1,
                },
                addedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        // ── Aggregates ──────────────────────────────────────────
        totalStudentLimit: {
            type: Number,
            default: 0,
        },

        usedStudents: {
            type: Number,
            default: 0,
        },

        totalAmount: {
            type: Number,
            default: 0,
        },

        // ── Payment / Billing ────────────────────────────────────
        paidStatus: {
            type: String,
            enum: ["PAID", "UNPAID", "PENDING", "OVERDUE"],
            default: "PENDING",
        },

        paidDate: Date,

        paymentRef: String,     // UTR / Cheque / Transaction ID

        billingMonth: String,   // "YYYY-MM" e.g. "2025-06"

        dueDate: Date,

        // ── Yearly Installment Schedule ──────────────────────────
        // Only populated when billingCycle = "Yearly"
        // 12 monthly installments auto-generated on plan assignment
        installments: [installmentSchema],

        // ── Status ──────────────────────────────────────────────
        status: {
            type: String,
            enum: ["TRIAL", "ACTIVE", "EXPIRED", "CANCELLED", "PENDING"],
            default: "PENDING",
        },

        // ── Billing History ─────────────────────────────────────
        history: [
            {
                type: {
                    type: String,
                    enum: [
                        "TRIAL_START",
                        "PLAN_PURCHASE",
                        "PLAN_UPGRADE",
                        "ADDON_PURCHASE",
                        "RENEWAL",
                        "SETUP_FEE",
                    ],
                },
                planId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "SubscriptionPlan",
                },
                name: String,
                price: Number,
                pricingModel: String,
                committedStudents: Number,
                studentLimit: Number,
                quantity: Number,
                razorpayPaymentId: String,
                startDate: Date,
                endDate: Date,
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
    },
    { timestamps: true }
);

export default mongoose.model("TenantSubscription", TenantSubscriptionSchema);

