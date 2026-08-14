import mongoose from "mongoose";

/**
 * MonthlyBill — Industry-level billing model
 *
 * Har bill mein:
 * - lineItems[]         → Itemized invoice (like Zoho/Stripe)
 * - configSnapshot      → Pricing rules at time of generation
 * - subscriptionAddonsSnapshot → Active addons at time of generation
 * - tax                 → GST breakdown
 * - invoiceNumber       → Unique INV-YYYY-TENANTCODE-NNN format
 *
 * Amount Flow:
 *   subtotal = sum of all lineItems amounts
 *   taxAmount = subtotal × taxRate / 100
 *   totalAmount = subtotal + taxAmount
 */

// ── Line Item Schema ──────────────────────────────────────────────
// Each charge appears as a separate line — like real invoices
const LineItemSchema = new mongoose.Schema(
    {
        // type identifies what this charge is
        type: {
            type: String,
            enum: [
                "BASE_PLAN",        // Flat base subscription charge
                "EXTRA_STUDENTS",   // BillingConfig slot charge (extra beyond base)
                "SUBSCRIPTION_ADDON", // Tenant purchased addon (e.g. "50 Student Pack")
            ],
            required: true,
        },
        description: { type: String, required: true }, // e.g. "Pro Plan — up to 350 students"
        unitPrice:   { type: Number, default: 0 },     // price per unit
        quantity:    { type: Number, default: 1 },     // e.g. number of slots
        amount:      { type: Number, default: 0 },     // unitPrice × quantity

        // Extra metadata per type
        meta: {
            // BASE_PLAN
            planName:         { type: String },
            studentLimit:     { type: Number },
            // EXTRA_STUDENTS
            extraStudents:    { type: Number },
            slotSize:         { type: Number },
            // SUBSCRIPTION_ADDON
            addonId:          { type: mongoose.Schema.Types.ObjectId },
            addonName:        { type: String },
            addonStudents:    { type: Number },
            billingCycle:     { type: String },  // original cycle before conversion
        },
    },
    { _id: false }
);

const MonthlyBillSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
        },

        // ── Invoice Number ───────────────────────────────────────
        // Unique, human-readable: INV-2026-08-0001
        invoiceNumber: {
            type: String,
            unique: true,
            sparse: true,
        },

        // ── Billing Period ───────────────────────────────────────
        billingMonth: { type: String, required: true }, // "YYYY-MM"
        periodStart:  { type: Date,   required: true },
        periodEnd:    { type: Date,   required: true },
        generatedAt:  { type: Date,   default: Date.now },
        dueDate:      { type: Date },

        // ── Student Count Snapshot ───────────────────────────────
        studentCount: { type: Number, required: true, default: 0 },

        // ── Pricing Config Snapshot ──────────────────────────────
        configSnapshot: {
            baseStudentLimit: { type: Number },
            basePrice:        { type: Number },
            addonSlotSize:    { type: Number },
            addonSlotPrice:   { type: Number },
        },

        // ── Addons Snapshot ──────────────────────────────────────
        subscriptionAddonsSnapshot: [
            {
                addonId:      { type: mongoose.Schema.Types.ObjectId },
                name:         { type: String },
                price:        { type: Number },
                monthlyPrice: { type: Number },
                studentLimit: { type: Number },
                billingCycle: { type: String },
                quantity:     { type: Number, default: 1 },
            },
        ],

        // ── LINE ITEMS (Industry Standard) ───────────────────────
        // Itemized breakdown — each charge as a separate line
        lineItems: [LineItemSchema],

        // ── Amount Summary ───────────────────────────────────────
        baseAmount:              { type: Number, default: 0 },
        slotAddonAmount:         { type: Number, default: 0 },
        addonSlots:              { type: Number, default: 0 },
        subscriptionAddonAmount: { type: Number, default: 0 },
        addonAmount:             { type: Number, default: 0 }, // slotAddon + subscriptionAddon
        subtotal:                { type: Number, default: 0 }, // before tax

        // ── Tax ─────────────────────────────────────────────────
        taxRate:   { type: Number, default: 0 },   // e.g. 18 for 18% GST
        taxAmount: { type: Number, default: 0 },   // subtotal × taxRate / 100
        taxLabel:  { type: String, default: "" },  // e.g. "GST (18%)"

        totalAmount: { type: Number, required: true }, // subtotal + taxAmount

        // ── Payment Status ───────────────────────────────────────
        status: {
            type: String,
            enum: ["PENDING", "PAID", "OVERDUE"],
            default: "PENDING",
        },
        paidAt:     { type: Date },
        paidBy:     { type: String },
        paymentRef: { type: String },
        remarks:    { type: String },
    },
    { timestamps: true }
);

// Unique bill per tenant per month
MonthlyBillSchema.index({ tenantId: 1, billingMonth: 1 }, { unique: true });

export default mongoose.model("MonthlyBill", MonthlyBillSchema);
