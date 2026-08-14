import mongoose from "mongoose";

/**
 * SessionBill — Academic session ke liye complete subscription billing
 *
 * Session:  April (year) → March (year+1)
 * Example:  Session 2025-26 → April 2025 – March 2026
 *
 * Flow:
 *  1. Admin session start karte waqt generateSessionBill call karta hai
 *  2. 12 monthly dues auto-generate hote hain (April → March)
 *  3. School kisi bhi waqt ek ya zyada months pay kar sakti hai
 *  4. Advance payment supported (future months bhi pay ho sakte hain)
 *  5. Partial payment allowed (ek month ke liye partial bhi)
 *
 * Bill Amount Formula:
 *  basePrice (₹1200) for up to baseStudentLimit (350) students
 *  + ceil((students - baseStudentLimit) / addonSlotSize) × addonSlotPrice
 *    for every 50 extra students
 */

/* ── Per-Month Due ── */
const monthlyDueSchema = new mongoose.Schema(
  {
    monthNo:       { type: Number, required: true },   // 1=April … 12=March
    billingMonth:  { type: String, required: true },   // "YYYY-MM"
    monthName:     { type: String },                   // "April 2025"
    dueDate:       { type: Date,   required: true },   // 7th of that month
    amount:        { type: Number, required: true },   // total due for this month

    // ── Student snapshot (at session start) ──
    studentCount:  { type: Number, default: 0 },

    // ── Payment status ──
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"],
      default: "PENDING",
    },

    paidAmount:    { type: Number, default: 0 },   // total received against this month
    balanceAmount: { type: Number, default: 0 },   // amount - paidAmount

    // ── Alert flags ──
    alert7DaysBefore: { type: Boolean, default: false },
    alertOnDueDate:   { type: Boolean, default: false },
    alert7DaysAfter:  { type: Boolean, default: false },
  },
  { _id: true }
);

/* ── Individual Payment Receipt ── */
const paymentReceiptSchema = new mongoose.Schema(
  {
    receiptNo:    { type: String, required: true },   // auto-generated
    paidAt:       { type: Date,   default: Date.now },
    paidBy:       { type: String },                   // admin name / ID
    paymentRef:   { type: String },                   // UTR / cheque / txn ID
    paymentMode:  {
      type: String,
      enum: ["CASH", "CHEQUE", "NEFT", "RTGS", "UPI", "ONLINE", "OTHER"],
      default: "OTHER",
    },
    totalPaidAmount: { type: Number, required: true }, // this receipt ka total

    // Which months this payment covers (can be multiple / partial)
    monthsApplied: [
      {
        billingMonth: String,   // "YYYY-MM"
        monthName:    String,
        amountApplied: Number,  // how much of this receipt went to this month
      },
    ],

    remarks: { type: String },
  },
  { _id: true, timestamps: true }
);

/* ── Main SessionBill Schema ── */
const SessionBillSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    // ── Session ─────────────────────────────────────────────
    sessionYear:  { type: String, required: true },   // "2025-26"
    sessionStart: { type: Date,   required: true },   // April 1
    sessionEnd:   { type: Date,   required: true },   // March 31

    // ── Pricing snapshot (at session generation time) ────────
    // Taki baad mein config change ho to purani sessions affect na hon
    pricingSnapshot: {
      baseStudentLimit: { type: Number, default: 350 },
      basePrice:        { type: Number, default: 1200 },
      addonSlotSize:    { type: Number, default: 50 },
      addonSlotPrice:   { type: Number, default: 100 },
    },

    // ── Student count at session start ──────────────────────
    studentCount: { type: Number, default: 0 },

    // ── Calculated amounts ───────────────────────────────────
    monthlyAmount:       { type: Number, required: true },  // per month charge
    totalSessionAmount:  { type: Number, required: true },  // monthlyAmount × 12
    totalPaid:           { type: Number, default: 0 },      // sum of all receipts
    totalDue:            { type: Number, default: 0 },      // totalSessionAmount - totalPaid
    advancePaid:         { type: Number, default: 0 },      // paid beyond current dues

    // ── 12 Monthly Dues ─────────────────────────────────────
    monthlyDues: [monthlyDueSchema],

    // ── Payment Receipts ─────────────────────────────────────
    receipts: [paymentReceiptSchema],

    // ── Overall Status ───────────────────────────────────────
    status: {
      type: String,
      enum: ["ACTIVE", "FULLY_PAID", "OVERDUE", "CANCELLED"],
      default: "ACTIVE",
    },

    // ── Restriction flags (from subscriptionGuard) ──────────
    restrictNewAdmissions:       { type: Boolean, default: false },
    restrictStudentRegistration: { type: Boolean, default: false },

    // ── Configurable overdue threshold ──────────────────────
    // Kitne months overdue hone ke baad restrictions lage
    overdueRestrictionMonths: { type: Number, default: 2 },

    // ── Receipt counter (for receipt numbering) ─────────────
    receiptCounter: { type: Number, default: 0 },

    generatedBy: { type: String, default: "system" },
  },
  { timestamps: true }
);

/* Indexes */
SessionBillSchema.index({ tenantId: 1, sessionYear: 1 }, { unique: true });
SessionBillSchema.index({ tenantId: 1, status: 1 });
SessionBillSchema.index({ "monthlyDues.status": 1, "monthlyDues.dueDate": 1 });

export default mongoose.model("SessionBill", SessionBillSchema);
