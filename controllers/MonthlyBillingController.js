import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import MonthlyBill from "../models/MonthlyBill.model.js";
import TenantSubscription from "../models/TenantSubscription.modal.js";
import Tenant from "../models/tenant.model.js";

/* ═══════════════════════════════════════════════════════════════════
   HELPER: Build Bill Data (No Student Calculation)
   
   Simply takes: plan base price + active addons
═══════════════════════════════════════════════════════════════════ */
const buildBillData = (basePlanPrice, currentAddons = [], taxRate = 0) => {
    const lineItems = [];

    // 1. BASE PLAN LINE
    lineItems.push({
        type:        "BASE_PLAN",
        description: `Base Subscription Plan`,
        unitPrice:   basePlanPrice,
        quantity:    1,
        amount:      basePlanPrice,
        meta: {
            planName: "Base Plan",
        },
    });

    let subscriptionAddonAmount = 0;

    // 2. SUBSCRIPTION ADDONS
    currentAddons.forEach((addon) => {
        const cycle = addon.billingCycle || "Monthly";
        const qty   = addon.quantity || 1;

        // Convert addon price to monthly if needed
        let monthlyPrice = addon.price || 0;
        if (cycle === "Yearly") {
            monthlyPrice = monthlyPrice / 12;
        }

        const unitPrice = monthlyPrice;
        const amount    = unitPrice * qty;
        subscriptionAddonAmount += amount;

        lineItems.push({
            type:        "SUBSCRIPTION_ADDON",
            description: `${addon.name}${qty > 1 ? ` ×${qty}` : ""}`,
            unitPrice,
            quantity:    qty,
            amount,
            meta: {
                addonId:      addon.addonId,
                addonName:    addon.name,
                billingCycle: cycle,
            },
        });
    });

    const baseAmount  = basePlanPrice;
    const addonAmount = subscriptionAddonAmount;
    const subtotal    = baseAmount + addonAmount;
    const taxAmount   = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    return {
        baseAmount,
        subscriptionAddonAmount,
        addonAmount,
        subtotal,
        taxRate,
        taxAmount,
        taxLabel: taxRate > 0 ? `GST (${taxRate}%)` : "",
        totalAmount,
        lineItems,
    };
};

/* ═══════════════════════════════════════════════════════════════════
   GENERATE MONTHLY BILL
   POST /api/monthly-billing/generate
   Body: { tenantId, billingMonth, taxRate? }
═══════════════════════════════════════════════════════════════════ */
export const generateMonthlyBill = asyncHandler(async (req, res) => {
    const { tenantId, billingMonth, taxRate = 0 } = req.body;

    if (!tenantId || !billingMonth) {
        return res.status(400).json(new apiResponse(400, null, "tenantId and billingMonth required"));
    }

    // Check if bill already exists
    const existing = await MonthlyBill.findOne({ tenantId, billingMonth });
    if (existing) {
        return res.status(400).json(new apiResponse(400, null, `Bill for ${billingMonth} already exists`));
    }

    const subscription  = await TenantSubscription.findOne({ tenantId });
    const currentAddons = subscription?.currentAddons ?? [];
    const basePlanPrice = subscription?.currentPlan?.price || 0;

    const billData = buildBillData(basePlanPrice, currentAddons, taxRate);

    // Calculate period dates
    const [year, month] = billingMonth.split("-").map(Number);
    const periodStart   = new Date(year, month - 1, 1);
    const periodEnd     = new Date(year, month, 0, 23, 59, 59);
    const dueDate       = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + 7);

    // Generate invoice number
    const count = await MonthlyBill.countDocuments({ billingMonth });
    const invoiceNumber = `INV-${billingMonth}-${String(count + 1).padStart(4, "0")}`;

    const bill = await MonthlyBill.create({
        tenantId,
        invoiceNumber,
        billingMonth,
        periodStart,
        periodEnd,
        dueDate,
        subscriptionAddonsSnapshot: currentAddons.map((a) => ({
            addonId:      a.addonId,
            name:         a.name,
            price:        a.price,
            monthlyPrice: a.billingCycle === "Yearly" ? a.price / 12 : a.price,
            billingCycle: a.billingCycle,
            quantity:     a.quantity || 1,
        })),
        ...billData,
    });

    return res.status(201).json(new apiResponse(201, bill, "Monthly bill generated successfully"));
});

/* ═══════════════════════════════════════════════════════════════════
   GENERATE BILLS FOR ALL TENANTS
   POST /api/monthly-billing/generate-all
   Body: { billingMonth, taxRate? }
═══════════════════════════════════════════════════════════════════ */
export const generateAllBills = asyncHandler(async (req, res) => {
    const { billingMonth, taxRate = 0 } = req.body;

    if (!billingMonth) {
        return res.status(400).json(new apiResponse(400, null, "billingMonth required (YYYY-MM)"));
    }

    const tenants = await Tenant.find({ isActive: true });
    const results = { created: 0, skipped: 0, failed: 0 };

    for (const tenant of tenants) {
        try {
            const existing = await MonthlyBill.findOne({ tenantId: tenant._id, billingMonth });
            if (existing) {
                results.skipped++;
                continue;
            }

            const subscription  = await TenantSubscription.findOne({ tenantId: tenant._id });
            const currentAddons = subscription?.currentAddons ?? [];
            const basePlanPrice = subscription?.currentPlan?.price || 0;

            const billData = buildBillData(basePlanPrice, currentAddons, taxRate);

            const [year, month] = billingMonth.split("-").map(Number);
            const periodStart   = new Date(year, month - 1, 1);
            const periodEnd     = new Date(year, month, 0, 23, 59, 59);
            const dueDate       = new Date(periodEnd);
            dueDate.setDate(dueDate.getDate() + 7);

            const count = await MonthlyBill.countDocuments({ billingMonth });
            const invoiceNumber = `INV-${billingMonth}-${String(count + 1).padStart(4, "0")}`;

            await MonthlyBill.create({
                tenantId: tenant._id,
                invoiceNumber,
                billingMonth,
                periodStart,
                periodEnd,
                dueDate,
                subscriptionAddonsSnapshot: currentAddons.map((a) => ({
                    addonId:      a.addonId,
                    name:         a.name,
                    price:        a.price,
                    monthlyPrice: a.billingCycle === "Yearly" ? a.price / 12 : a.price,
                    billingCycle: a.billingCycle,
                    quantity:     a.quantity || 1,
                })),
                ...billData,
            });

            results.created++;
        } catch {
            results.failed++;
        }
    }

    return res.status(200).json(
        new apiResponse(200, results, `Bills generated: ${results.created} created, ${results.skipped} skipped, ${results.failed} failed`)
    );
});

/* ═══════════════════════════════════════════════════════════════════
   GET ALL MONTHLY BILLS (with pagination)
   GET /api/monthly-billing?page=1&limit=10&search=&status=
═══════════════════════════════════════════════════════════════════ */
export const getMonthlyBills = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        isPagination = "true",
        search = "",
        status = "",
    } = req.query;

    const match = {};
    if (status && status !== "All") match.status = status;

    const pipeline = [
        { $match: match },
        {
            $lookup: {
                from:         "tenants",
                localField:   "tenantId",
                foreignField: "_id",
                as:           "tenantDetails",
            },
        },
        { $unwind: { path: "$tenantDetails", preserveNullAndEmptyArrays: true } },
    ];

    if (search.trim()) {
        pipeline.push({
            $match: {
                $or: [
                    { "tenantDetails.schoolName": { $regex: search.trim(), $options: "i" } },
                    { invoiceNumber:               { $regex: search.trim(), $options: "i" } },
                ],
            },
        });
    }

    if (isPagination === "false") {
        const bills = await MonthlyBill.aggregate([...pipeline, { $sort: { createdAt: -1 } }]);
        return res.status(200).json(new apiResponse(200, { bills, total: bills.length }, "Bills fetched"));
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await MonthlyBill.aggregate([...pipeline, { $count: "count" }]);
    const count = total[0]?.count || 0;

    const bills = await MonthlyBill.aggregate([
        ...pipeline,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
    ]);

    return res.status(200).json(
        new apiResponse(200, {
            bills,
            total: count,
            page: Number(page),
            totalPages: Math.ceil(count / Number(limit)),
        }, "Bills fetched")
    );
});

/* ═══════════════════════════════════════════════════════════════════
   GET SINGLE BILL DETAIL
   GET /api/monthly-billing/:billId
═══════════════════════════════════════════════════════════════════ */
export const getBillDetail = asyncHandler(async (req, res) => {
    const { billId } = req.params;

    const bill = await MonthlyBill.findById(billId).populate("tenantId", "schoolName subdomain");

    if (!bill) {
        return res.status(404).json(new apiResponse(404, null, "Bill not found"));
    }

    return res.status(200).json(new apiResponse(200, bill, "Bill detail fetched"));
});

/* ═══════════════════════════════════════════════════════════════════
   MARK BILL AS PAID
   PATCH /api/monthly-billing/:billId/mark-paid
   Body: { paidAt?, paymentRef?, remarks? }
═══════════════════════════════════════════════════════════════════ */
export const markBillPaid = asyncHandler(async (req, res) => {
    const { billId } = req.params;
    const { paidAt, paymentRef, remarks } = req.body;

    const bill = await MonthlyBill.findById(billId);
    if (!bill) {
        return res.status(404).json(new apiResponse(404, null, "Bill not found"));
    }

    bill.status     = "PAID";
    bill.paidAt     = paidAt ? new Date(paidAt) : new Date();
    bill.paymentRef = paymentRef || "";
    bill.remarks    = remarks || "";
    bill.paidBy     = req.user?.name || req.user?._id?.toString() || "admin";

    await bill.save();

    return res.status(200).json(new apiResponse(200, bill, "Bill marked as paid"));
});

/* ═══════════════════════════════════════════════════════════════════
   MARK OVERDUE BILLS AUTOMATICALLY
   PATCH /api/monthly-billing/mark-overdue
   Sets status=OVERDUE for all bills past due date and status=PENDING
═══════════════════════════════════════════════════════════════════ */
export const markOverdueBills = asyncHandler(async (req, res) => {
    const now = new Date();

    const result = await MonthlyBill.updateMany(
        {
            status:  "PENDING",
            dueDate: { $lt: now },
        },
        {
            $set: { status: "OVERDUE" },
        }
    );

    return res.status(200).json(
        new apiResponse(200, { updated: result.modifiedCount }, `${result.modifiedCount} bill(s) marked overdue`)
    );
});

/* ═══════════════════════════════════════════════════════════════════
   DELETE BILL (admin utility)
   DELETE /api/monthly-billing/:billId
═══════════════════════════════════════════════════════════════════ */
export const deleteBill = asyncHandler(async (req, res) => {
    const { billId } = req.params;

    const bill = await MonthlyBill.findByIdAndDelete(billId);
    if (!bill) {
        return res.status(404).json(new apiResponse(404, null, "Bill not found"));
    }

    return res.status(200).json(new apiResponse(200, null, "Bill deleted successfully"));
});
