import mongoose from "mongoose";
import MonthlyBill from "../models/MonthlyBill.model.js";
import BillingConfig from "../models/BillingConfig.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import Tenant from "../models/tenant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */

/**
 * Generate unique invoice number: INV-YYYY-MM-NNNN
 * e.g. INV-2026-08-0042
 */
const generateInvoiceNumber = async (billingMonth) => {
    const [year, month] = billingMonth.split("-");
    const prefix = `INV-${year}-${month}-`;
    // Count existing bills this month to get next sequence
    const count = await MonthlyBill.countDocuments({
        billingMonth,
        invoiceNumber: { $regex: `^${prefix}` },
    });
    const seq = String(count + 1).padStart(4, "0");
    return `${prefix}${seq}`;
};

/**
 * Get or create active BillingConfig
 */
const getActiveConfig = async () => {
    let config = await BillingConfig.findOne({ isActive: true });
    if (!config) {
        config = await BillingConfig.create({
            baseStudentLimit: 350,
            basePrice: 1200,
            addonSlotSize: 50,
            addonSlotPrice: 100,
            isActive: true,
        });
    }
    return config;
};

/**
 * Build itemized lineItems[] + full amount breakdown
 *
 * Line item types:
 *  BASE_PLAN          → flat monthly base charge
 *  EXTRA_STUDENTS     → BillingConfig slot charge for students beyond base limit
 *  SUBSCRIPTION_ADDON → tenant's purchased addon monthly charge
 */
const buildBillData = (studentCount, config, currentAddons = [], taxRate = 0) => {
    const { baseStudentLimit, basePrice, addonSlotSize, addonSlotPrice } = config;
    const lineItems = [];

    // ── 1. BASE PLAN line item ──────────────────────────────────
    lineItems.push({
        type:        "BASE_PLAN",
        description: `Base Plan — up to ${baseStudentLimit} students`,
        unitPrice:   basePrice,
        quantity:    1,
        amount:      basePrice,
        meta: {
            planName:     "Base Plan",
            studentLimit: baseStudentLimit,
        },
    });

    // ── 2. EXTRA STUDENTS line item ─────────────────────────────
    let addonSlots = 0;
    let slotAddonAmount = 0;
    if (studentCount > baseStudentLimit) {
        const extraStudents = studentCount - baseStudentLimit;
        addonSlots          = Math.ceil(extraStudents / addonSlotSize);
        slotAddonAmount     = addonSlots * addonSlotPrice;
        lineItems.push({
            type:        "EXTRA_STUDENTS",
            description: `Extra Students — ${extraStudents} students (${addonSlots} slot${addonSlots > 1 ? "s" : ""} × ₹${addonSlotPrice})`,
            unitPrice:   addonSlotPrice,
            quantity:    addonSlots,
            amount:      slotAddonAmount,
            meta: {
                extraStudents,
                slotSize: addonSlotSize,
            },
        });
    }

    // ── 3. SUBSCRIPTION ADDON line items (one per addon) ────────
    let subscriptionAddonAmount = 0;
    const subscriptionAddonsSnapshot = [];

    for (const addon of currentAddons) {
        const qty       = addon.quantity || 1;
        const unitPrice = addon.price    || 0;
        const cycle     = addon.billingCycle || "Monthly";

        // Convert to monthly equivalent
        let monthlyPrice;
        let cycleNote = "";
        if (cycle === "Yearly") {
            monthlyPrice = Math.round((unitPrice * qty) / 12);
            cycleNote    = " (yearly ÷ 12)";
        } else {
            monthlyPrice = unitPrice * qty;
        }

        subscriptionAddonAmount += monthlyPrice;

        const addonStudents = (addon.studentLimit || 0) * qty;

        lineItems.push({
            type:        "SUBSCRIPTION_ADDON",
            description: `${addon.name}${qty > 1 ? ` ×${qty}` : ""} — +${addonStudents} students${cycleNote}`,
            unitPrice:   unitPrice,
            quantity:    qty,
            amount:      monthlyPrice,
            meta: {
                addonId:      addon.addonId,
                addonName:    addon.name,
                addonStudents,
                billingCycle: cycle,
            },
        });

        subscriptionAddonsSnapshot.push({
            addonId:      addon.addonId,
            name:         addon.name,
            price:        unitPrice,
            monthlyPrice,
            studentLimit: addonStudents,
            billingCycle: cycle,
            quantity:     qty,
        });
    }

    // ── Totals ──────────────────────────────────────────────────
    const baseAmount   = basePrice;
    const addonAmount  = slotAddonAmount + subscriptionAddonAmount;
    const subtotal     = baseAmount + addonAmount;
    const taxAmount    = taxRate > 0 ? Math.round(subtotal * taxRate / 100) : 0;
    const totalAmount  = subtotal + taxAmount;

    return {
        lineItems,
        subscriptionAddonsSnapshot,
        baseAmount,
        addonSlots,
        slotAddonAmount,
        subscriptionAddonAmount,
        addonAmount,
        subtotal,
        taxAmount,
        totalAmount,
    };
};

/* ═══════════════════════════════════════════════════════════════════
   1. GET Billing Config
   GET /api/monthly-billing/config
═══════════════════════════════════════════════════════════════════ */
export const getBillingConfig = asyncHandler(async (req, res) => {
    const config = await getActiveConfig();
    return res.status(200).json(new apiResponse(200, config, "Billing config fetched"));
});

/* ═══════════════════════════════════════════════════════════════════
   2. UPDATE Billing Config
   PUT /api/monthly-billing/config
═══════════════════════════════════════════════════════════════════ */
export const updateBillingConfig = asyncHandler(async (req, res) => {
    const { baseStudentLimit, basePrice, addonSlotSize, addonSlotPrice } = req.body;
    const config = await getActiveConfig();
    if (baseStudentLimit !== undefined) config.baseStudentLimit = baseStudentLimit;
    if (basePrice        !== undefined) config.basePrice        = basePrice;
    if (addonSlotSize    !== undefined) config.addonSlotSize    = addonSlotSize;
    if (addonSlotPrice   !== undefined) config.addonSlotPrice   = addonSlotPrice;
    await config.save();
    return res.status(200).json(new apiResponse(200, config, "Billing config updated"));
});

/* ═══════════════════════════════════════════════════════════════════
   3. GENERATE Monthly Bill — Single Tenant
   POST /api/monthly-billing/generate
   Body: { tenantId, billingMonth, studentCount?, taxRate? }
═══════════════════════════════════════════════════════════════════ */
export const generateMonthlyBill = asyncHandler(async (req, res) => {
    const { tenantId, billingMonth, studentCount: manualCount, taxRate = 0 } = req.body;

    if (!tenantId || !billingMonth)
        return res.status(400).json(new apiResponse(400, null, "tenantId and billingMonth are required"));

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth))
        return res.status(400).json(new apiResponse(400, null, "billingMonth format must be YYYY-MM"));

    const existing = await MonthlyBill.findOne({ tenantId, billingMonth });
    if (existing)
        return res.status(409).json(new apiResponse(409, existing, `Bill for ${billingMonth} already exists`));

    const subscription  = await TenantSubscription.findOne({ tenantId });
    const studentCount  = manualCount ?? subscription?.usedStudents ?? 0;
    const currentAddons = subscription?.currentAddons ?? [];

    const config = await getActiveConfig();
    const configSnapshot = {
        baseStudentLimit: config.baseStudentLimit,
        basePrice:        config.basePrice,
        addonSlotSize:    config.addonSlotSize,
        addonSlotPrice:   config.addonSlotPrice,
    };

    const billData = buildBillData(studentCount, configSnapshot, currentAddons, Number(taxRate));

    const [year, month] = billingMonth.split("-").map(Number);
    const periodStart   = new Date(year, month - 1, 1);
    const periodEnd     = new Date(year, month, 0);
    const dueDate       = new Date(year, month - 1, 7);

    const invoiceNumber = await generateInvoiceNumber(billingMonth);

    const bill = await MonthlyBill.create({
        tenantId,
        invoiceNumber,
        billingMonth,
        periodStart,
        periodEnd,
        dueDate,
        studentCount,
        configSnapshot,
        ...billData,
        taxRate:  Number(taxRate),
        taxLabel: taxRate > 0 ? `GST (${taxRate}%)` : "",
        status:   "PENDING",
    });

    return res.status(201).json(new apiResponse(201, bill, `Invoice ${invoiceNumber} generated`));
});

/* ═══════════════════════════════════════════════════════════════════
   4. BULK GENERATE — All Active Tenants
   POST /api/monthly-billing/generate-bulk
   Body: { billingMonth, taxRate? }
═══════════════════════════════════════════════════════════════════ */
export const generateBulkBills = asyncHandler(async (req, res) => {
    const { billingMonth, taxRate = 0 } = req.body;

    if (!billingMonth)
        return res.status(400).json(new apiResponse(400, null, "billingMonth is required"));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth))
        return res.status(400).json(new apiResponse(400, null, "billingMonth format must be YYYY-MM"));

    const config = await getActiveConfig();
    const configSnapshot = {
        baseStudentLimit: config.baseStudentLimit,
        basePrice:        config.basePrice,
        addonSlotSize:    config.addonSlotSize,
        addonSlotPrice:   config.addonSlotPrice,
    };

    const [year, month] = billingMonth.split("-").map(Number);
    const periodStart   = new Date(year, month - 1, 1);
    const periodEnd     = new Date(year, month, 0);
    const dueDate       = new Date(year, month - 1, 7);

    const tenants = await Tenant.find({ isActive: true }).select("_id");
    const results = { created: 0, skipped: 0, errors: [] };

    for (const tenant of tenants) {
        try {
            const exists = await MonthlyBill.findOne({ tenantId: tenant._id, billingMonth });
            if (exists) { results.skipped++; continue; }

            const subscription  = await TenantSubscription.findOne({ tenantId: tenant._id });
            const studentCount  = subscription?.usedStudents  ?? 0;
            const currentAddons = subscription?.currentAddons ?? [];

            const billData      = buildBillData(studentCount, configSnapshot, currentAddons, Number(taxRate));
            const invoiceNumber = await generateInvoiceNumber(billingMonth);

            await MonthlyBill.create({
                tenantId: tenant._id,
                invoiceNumber,
                billingMonth,
                periodStart,
                periodEnd,
                dueDate,
                studentCount,
                configSnapshot,
                ...billData,
                taxRate:  Number(taxRate),
                taxLabel: taxRate > 0 ? `GST (${taxRate}%)` : "",
                status:   "PENDING",
            });
            results.created++;
        } catch (err) {
            results.errors.push({ tenantId: tenant._id, error: err.message });
        }
    }

    return res.status(200).json(new apiResponse(200, results, `Bulk generation done for ${billingMonth}`));
});

/* ═══════════════════════════════════════════════════════════════════
   5. MARK BILL PAID
   PATCH /api/monthly-billing/:id/mark-paid
═══════════════════════════════════════════════════════════════════ */
export const markBillPaid = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { paidAt, paymentRef, paidBy, remarks } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json(new apiResponse(400, null, "Invalid bill ID"));

    const bill = await MonthlyBill.findById(id);
    if (!bill) return res.status(404).json(new apiResponse(404, null, "Bill not found"));
    if (bill.status === "PAID")
        return res.status(400).json(new apiResponse(400, null, "Bill already paid"));

    bill.status    = "PAID";
    bill.paidAt    = paidAt ? new Date(paidAt) : new Date();
    if (paymentRef) bill.paymentRef = paymentRef;
    if (paidBy)     bill.paidBy     = paidBy;
    if (remarks)    bill.remarks    = remarks;
    await bill.save();

    return res.status(200).json(new apiResponse(200, bill, "Bill marked as paid"));
});

/* ═══════════════════════════════════════════════════════════════════
   6. MARK OVERDUE
   PATCH /api/monthly-billing/mark-overdue
═══════════════════════════════════════════════════════════════════ */
export const markOverdueBills = asyncHandler(async (req, res) => {
    const result = await MonthlyBill.updateMany(
        { status: "PENDING", dueDate: { $lt: new Date() } },
        { $set: { status: "OVERDUE" } }
    );
    return res.status(200).json(new apiResponse(200, { updatedCount: result.modifiedCount }, "Overdue bills marked"));
});

/* ═══════════════════════════════════════════════════════════════════
   7. GET BILLS — List with filters
   GET /api/monthly-billing
═══════════════════════════════════════════════════════════════════ */
export const getBills = asyncHandler(async (req, res) => {
    const { tenantId, billingMonth, status, page = 1, limit = 12, isPagination = "true" } = req.query;

    const match = {};
    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId))
        match.tenantId = new mongoose.Types.ObjectId(tenantId);
    if (billingMonth) match.billingMonth = billingMonth;
    if (status)       match.status       = status;

    const pipeline = [
        { $match: match },
        {
            $lookup: {
                from: "tenants", localField: "tenantId",
                foreignField: "_id", as: "tenantDetails",
            },
        },
        { $unwind: { path: "$tenantDetails", preserveNullAndEmptyArrays: true } },
        { $sort: { billingMonth: -1 } },
    ];

    const total = (await MonthlyBill.aggregate([...pipeline, { $count: "c" }]))[0]?.c || 0;

    if (isPagination === "true") {
        pipeline.push(
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) }
        );
    }

    const bills = await MonthlyBill.aggregate(pipeline);
    return res.status(200).json(new apiResponse(200, {
        bills, total,
        totalPages:  isPagination === "true" ? Math.ceil(total / Number(limit)) : 1,
        currentPage: isPagination === "true" ? Number(page) : null,
    }, "Bills fetched"));
});

/* ═══════════════════════════════════════════════════════════════════
   8. GET SINGLE BILL
   GET /api/monthly-billing/:id
═══════════════════════════════════════════════════════════════════ */
export const getBillById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json(new apiResponse(400, null, "Invalid bill ID"));

    const bill = await MonthlyBill.findById(id).populate("tenantId", "schoolName subdomain email phone address");
    if (!bill) return res.status(404).json(new apiResponse(404, null, "Bill not found"));

    return res.status(200).json(new apiResponse(200, bill, "Bill fetched"));
});

/* ═══════════════════════════════════════════════════════════════════
   9. PREVIEW — Calculate without saving
   POST /api/monthly-billing/preview
   Body: { tenantId?, studentCount, taxRate? }
═══════════════════════════════════════════════════════════════════ */
export const previewBill = asyncHandler(async (req, res) => {
    const { studentCount = 0, tenantId, taxRate = 0 } = req.body;

    const config = await getActiveConfig();

    let currentAddons = [];
    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
        const sub = await TenantSubscription.findOne({ tenantId });
        currentAddons = sub?.currentAddons ?? [];
    }

    const billData = buildBillData(Number(studentCount), config, currentAddons, Number(taxRate));

    return res.status(200).json(new apiResponse(200, {
        studentCount,
        ...billData,
        taxRate:  Number(taxRate),
        taxLabel: taxRate > 0 ? `GST (${taxRate}%)` : "",
        config: {
            baseStudentLimit: config.baseStudentLimit,
            basePrice:        config.basePrice,
            addonSlotSize:    config.addonSlotSize,
            addonSlotPrice:   config.addonSlotPrice,
        },
    }, "Bill preview calculated"));
});

/* ═══════════════════════════════════════════════════════════════════
   10. GET INVOICE DATA — Full invoice for a bill
   GET /api/monthly-billing/:id/invoice
   Returns enriched bill with tenant details for invoice rendering
═══════════════════════════════════════════════════════════════════ */
export const getInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json(new apiResponse(400, null, "Invalid bill ID"));

    // Prevent browser caching — invoice data changes (e.g. status PENDING→PAID)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const bill = await MonthlyBill.findById(id)
        .populate("tenantId", "schoolName subdomain schoolEmail schoolContact schoolAddress addressLine1 city state pincode logo");

    if (!bill) return res.status(404).json(new apiResponse(404, null, "Invoice not found"));

    // Debug log — remove after fix confirmed
    console.log("Invoice bill found:", {
        id: bill._id,
        tenantId: bill.tenantId?._id || bill.tenantId,
        billingMonth: bill.billingMonth,
        totalAmount: bill.totalAmount,
        lineItemsCount: bill.lineItems?.length,
    });

    // ── If bill has no lineItems (old bill), build them on the fly ──
    let lineItems = bill.lineItems || [];
    if (!lineItems.length) {
        const cfg = bill.configSnapshot || {};
        // Base plan
        lineItems.push({
            type:        "BASE_PLAN",
            description: `Base Plan — up to ${cfg.baseStudentLimit || 350} students`,
            unitPrice:   cfg.basePrice || bill.baseAmount || 0,
            quantity:    1,
            amount:      cfg.basePrice || bill.baseAmount || 0,
        });
        // Extra student slots
        if ((bill.addonSlots || 0) > 0) {
            lineItems.push({
                type:        "EXTRA_STUDENTS",
                description: `Extra Students — ${bill.addonSlots} slot(s) × ₹${cfg.addonSlotPrice || 100}`,
                unitPrice:   cfg.addonSlotPrice || 100,
                quantity:    bill.addonSlots,
                amount:      bill.slotAddonAmount || (bill.addonSlots * (cfg.addonSlotPrice || 100)),
            });
        }
        // Subscription addons
        for (const a of (bill.subscriptionAddonsSnapshot || [])) {
            lineItems.push({
                type:        "SUBSCRIPTION_ADDON",
                description: `${a.name}${(a.quantity || 1) > 1 ? ` ×${a.quantity}` : ""} — +${a.studentLimit || 0} students`,
                unitPrice:   a.price || 0,
                quantity:    a.quantity || 1,
                amount:      a.monthlyPrice || 0,
            });
        }
        // Old bills that only have addonAmount (no snapshot breakdown)
        if (!lineItems.slice(1).length && (bill.addonAmount || 0) > 0) {
            lineItems.push({
                type:        "EXTRA_STUDENTS",
                description: `Extra charge`,
                unitPrice:   bill.addonAmount,
                quantity:    1,
                amount:      bill.addonAmount,
            });
        }
    }

    const invoiceData = {
        invoiceNumber: bill.invoiceNumber
            || `INV-${bill.billingMonth}-${String(bill._id).slice(-4).toUpperCase()}`,
        invoiceDate:   bill.createdAt,   // createdAt always exists
        dueDate:       bill.dueDate,
        billingMonth:  bill.billingMonth,
        periodStart:   bill.periodStart,
        periodEnd:     bill.periodEnd,
        status:        bill.status,
        paidAt:        bill.paidAt  || null,
        paymentRef:    bill.paymentRef || null,
        paidBy:        bill.paidBy  || null,
        remarks:       bill.remarks || null,

        // School details — map correct tenant field names
        school: {
            name:      bill.tenantId?.schoolName  || "—",
            subdomain: bill.tenantId?.subdomain   || "",
            email:     bill.tenantId?.schoolEmail || bill.tenantId?.contactPerson1?.email || null,
            phone:     bill.tenantId?.schoolContact || bill.tenantId?.contactPerson1?.contactNo || null,
            address:   bill.tenantId?.schoolAddress
                        || [bill.tenantId?.addressLine1, bill.tenantId?.city, bill.tenantId?.state, bill.tenantId?.pincode]
                            .filter(Boolean).join(', ')
                        || null,
            logo:      bill.tenantId?.logo || null,
        },

        // Line items
        lineItems,
        studentCount: bill.studentCount || 0,

        // Amounts
        baseAmount:              bill.baseAmount              || 0,
        slotAddonAmount:         bill.slotAddonAmount         || 0,
        addonSlots:              bill.addonSlots              || 0,
        subscriptionAddonAmount: bill.subscriptionAddonAmount || 0,
        addonAmount:             bill.addonAmount             || 0,
        subtotal:                bill.subtotal  || bill.totalAmount || 0,
        taxRate:                 bill.taxRate   || 0,
        taxLabel:                bill.taxLabel  || "",
        taxAmount:               bill.taxAmount || 0,
        totalAmount:             bill.totalAmount || 0,

        // Config snapshot for fallback rendering
        configSnapshot: bill.configSnapshot || {},
        subscriptionAddonsSnapshot: bill.subscriptionAddonsSnapshot || [],
    };

    return res.status(200).json(new apiResponse(200, invoiceData, "Invoice fetched"));
});
