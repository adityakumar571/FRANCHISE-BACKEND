
import crypto from "crypto";

import { getRazorpayInstance } from "../../../utils/razorpay.js";


import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getStudentPaymentModel } from "../../../models/tenant/master/StudentPayment.model.js";
import { calculateStudentPayableSummary } from "../../../utils/feeHelper.js";
import { getFeeStructureModel } from "../../../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel } from "../../../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel } from "../../../models/tenant/master/AdditionalFee.model.js";
import { getTransportFeeModel } from "../../../models/tenant/master/TransportFee.model.js";
import { getStudentPaymentAllocationModel } from "../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { getLateFeeModel } from "../../../models/tenant/master/LateFee.model.js";
import { syncLateFees } from "../../../utils/lateFeeHelper.js";
import { generateReceiptNo } from "../../../utils/receiptHelper.js";
import mongoose from "mongoose";

/* ================= CREATE ORDER ================= */
export const createRazorpayOrder = asyncHandler(async (req, res) => {
    const { db, tenant } = req;

    console.log(" tenant", tenant);


    const StudentPayment = getStudentPaymentModel(db);

    const { sessionId, studentId, classId, streamId, amount } = req.body;

    if (!sessionId || !studentId || !classId || !amount) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Required fields missing"));
    }

    const summary = await calculateStudentPayableSummary({
        sessionId,
        studentId,
        classId,
        streamId,
        db,
    });


    console.log("summary", summary);


    if (amount > summary.remainingPayable) {
        return res
            .status(400)
            .json(new apiResponse(400, summary, "Amount exceeds due"));
    }

    const payment = await StudentPayment.create({
        sessionId,
        studentId,
        classId,
        streamId,
        amountPaid: amount,
        paymentStatus: "PENDING",
        paymentMode: "ONLINE",
        gateway: "RAZORPAY",
        receiptNo: await generateReceiptNo(db),
    });

    const razorpay = getRazorpayInstance(tenant);

    const order = await razorpay.orders.create({
        amount: amount * 100,
        currency: "INR",
        receipt: payment.receiptNo,
    });

    payment.gatewayOrderId = order.id;
    await payment.save();

    res.status(200).json(
        new apiResponse(
            200,
            {
                orderId: order.id,
                key: tenant.razorpayKey,
                paymentId: payment._id,
                amount: order.amount,   // paise mein (Razorpay format)
                currency: order.currency,
            },
            "Order created"
        )
    );
});

/* ================= VERIFY + ALLOCATE ================= */
export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
    const { db, tenant } = req;

    const StudentPayment = getStudentPaymentModel(db);
    const FeeStructure = getFeeStructureModel(db);
    const FeeInstallment = getFeeInstallmentModel(db);
    const AdditionalFee = getAdditionalFeeModel(db);
    const TransportFee = getTransportFeeModel(db);
    const Allocation = getStudentPaymentAllocationModel(db);
    const LateFee = getLateFeeModel(db);

    const { gatewayOrderId, gatewayPaymentId, gatewaySignature } = req.body;

    const payment = await StudentPayment.findOne({ gatewayOrderId });

    if (!payment) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Payment not found"));
    }

    // ── Signature verification ──
    const body = `${gatewayOrderId}|${gatewayPaymentId}`;
    const expected = crypto
        .createHmac("sha256", tenant.razorpaySecret)
        .update(body)
        .digest("hex");

    if (expected !== gatewaySignature) {
        payment.paymentStatus = "FAILED";
        await payment.save();
        return res
            .status(400)
            .json(new apiResponse(400, null, "Verification failed"));
    }

    // ── Mark SUCCESS + save signature ──
    payment.paymentStatus = "SUCCESS";
    payment.gatewayPaymentId = gatewayPaymentId;
    payment.gatewaySignature = gatewaySignature;
    await payment.save();

    // ── Fetch summary for concession calculation ──
    const summary = await calculateStudentPayableSummary({
        db,
        sessionId:  payment.sessionId,
        studentId:  payment.studentId,
        classId:    payment.classId,
        streamId:   payment.streamId || null,
    });

    // ── Previous successful payment IDs (excluding current) ──
    const prevPaymentIds = await StudentPayment.find({
        studentId: payment.studentId,
        sessionId: payment.sessionId,
        paymentStatus: "SUCCESS",
        _id: { $ne: payment._id },
    }).distinct("_id");

    // ── Build full previous allocation map (all fee types) ──
    const prevAllocations = prevPaymentIds.length
        ? await Allocation.find({ paymentId: { $in: prevPaymentIds } }).lean()
        : [];

    const prevAllocMap = {};
    for (const a of prevAllocations) {
        const rid = a.referenceId.toString();
        prevAllocMap[rid] = (prevAllocMap[rid] || 0) + Number(a.allocatedAmount || 0);
    }

    // ── Build payable items list ──
    const payableItems = [];

    // 1. TUITION installments
    const feeStructureQuery = payment.streamId
      ? { sessionId: payment.sessionId, classId: payment.classId, streamId: payment.streamId, isActive: true }
      : {
          sessionId: payment.sessionId,
          classId: payment.classId,
          isActive: true,
          $or: [{ streamId: null }, { streamId: { $exists: false } }],
        };

    const feeStructures = await FeeStructure.find(feeStructureQuery);

    const installments = await FeeInstallment.find({
        feeStructureId: { $in: feeStructures.map(f => f._id) },
    }).sort({ installmentNo: 1 });

    installments.forEach(inst => {
        const paid = prevAllocMap[inst._id.toString()] || 0;
        const due = Number(inst.amount) - paid;
        if (due > 0) {
            payableItems.push({
                feeType: "TUITION",
                referenceId: inst._id,
                dueDate: inst.dueDate,
                period: inst.period,
                dueAmount: due,
            });
        }
    });

    // 2. ADDITIONAL fees
    const additionalFees = await AdditionalFee.find({
        sessionId: payment.sessionId,
        isActive: true,
        $or: [
            { classId: null },
            { classId: payment.classId, streamId: null },
            { classId: payment.classId, streamId: payment.streamId || null },
        ],
    });

    for (const fee of additionalFees) {
        const paid = prevAllocMap[fee._id.toString()] || 0;
        const due = Number(fee.amount) - paid;
        if (due > 0) {
            payableItems.push({
                feeType: "ADDITIONAL",
                referenceId: fee._id,
                dueDate: fee.dueDate,
                period: fee.period,
                dueAmount: due,
            });
        }
    }

    // 3. TRANSPORT fees (active, deduplicated by period)
    const transportRaw = await TransportFee.find({
        studentId: payment.studentId,
        sessionId: payment.sessionId,
        isActive: true,
    }).sort({ updatedAt: -1 });

    const seenPeriods = new Set();
    const activeTransport = [];
    for (const f of transportRaw) {
        if (!seenPeriods.has(f.period)) {
            seenPeriods.add(f.period);
            activeTransport.push(f);
        }
    }

    for (const fee of activeTransport) {
        const paid = prevAllocMap[fee._id.toString()] || 0;
        const due = Number(fee.amount) - paid;
        if (due > 0) {
            payableItems.push({
                feeType: "TRANSPORT",
                referenceId: fee._id,
                dueDate: fee.dueDate,
                period: fee.period,
                dueAmount: due,
            });
        }
    }

    // ── Sort by period order first (installmentNo), dueDate is secondary ──
    // This ensures April → May → June order regardless of dueDate values in DB.
    const PERIOD_ORDER = [
        "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
        "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
        "APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR",
    ];
    payableItems.sort((a, b) => {
        const ai = PERIOD_ORDER.indexOf(a.period);
        const bi = PERIOD_ORDER.indexOf(b.period);
        const periodDiff = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        if (periodDiff !== 0) return periodDiff;
        if (a.feeType === "TUITION" && b.feeType !== "TUITION") return -1;
        if (b.feeType === "TUITION" && a.feeType !== "TUITION") return 1;
        return 0;
    });

    // ── Sync late fees before allocation ──
    await syncLateFees({
        db,
        sessionId:     payment.sessionId,
        studentId:     payment.studentId,
        classId:       payment.classId,
        installments:  installments.map(i => i.toObject ? i.toObject() : i),
        allocationMap: prevAllocMap,
    });

    // ── Fetch late fees and interleave with regular payable items ──
    const lateFeeRecords = await LateFee.find({
        sessionId: payment.sessionId,
        studentId: payment.studentId,
        isWaived: false,
    }).lean();

    const lateFeeByInstallment = {};
    for (const lf of lateFeeRecords) {
        const lfPaid = prevAllocMap[lf._id.toString()] || 0;
        const lfDue  = Math.max(0, Number(lf.amount) - lfPaid);
        if (lfDue > 0) {
            lateFeeByInstallment[lf.referenceId.toString()] = { ...lf, lfDue };
        }
    }

    // ── Build per-period concession map — TUITION ONLY, SEQUENTIAL (April first) ──
    const periodFeeMapRZ = {};
    for (const inst of installments) {
        const p = inst.period;
        if (!periodFeeMapRZ[p]) periodFeeMapRZ[p] = { totalFee: 0, paidAmount: 0 };
        periodFeeMapRZ[p].totalFee   += Number(inst.amount || 0);
        periodFeeMapRZ[p].paidAmount += prevAllocMap[inst._id.toString()] || 0;
    }

    const sortedPeriodsRZ = Object.keys(periodFeeMapRZ).sort((a, b) =>
        (PERIOD_ORDER.indexOf(a) === -1 ? 999 : PERIOD_ORDER.indexOf(a)) -
        (PERIOD_ORDER.indexOf(b) === -1 ? 999 : PERIOD_ORDER.indexOf(b))
    );
    const periodConcessionMapRZ = {};
    let concessionRemainingRZ = summary.concessionAmount;
    for (const per of sortedPeriodsRZ) {
        if (concessionRemainingRZ <= 0) break;
        const tuitionInPeriod = periodFeeMapRZ[per].totalFee;
        if (tuitionInPeriod <= 0) continue;
        const apply = parseFloat(Math.min(concessionRemainingRZ, tuitionInPeriod).toFixed(2));
        const rawDue = periodFeeMapRZ[per].totalFee - periodFeeMapRZ[per].paidAmount;
        periodConcessionMapRZ[per] = Math.min(apply, Math.max(0, rawDue));
        concessionRemainingRZ = parseFloat((concessionRemainingRZ - apply).toFixed(2));
    }

    // ── Build payable items — concession only on TUITION, not ADDITIONAL/TRANSPORT ──
    const finalPayableItems = [];
    for (const item of payableItems) {
        if (item.feeType === "LATE_FEE") {
            finalPayableItems.push(item);
            continue;
        }
        // ADDITIONAL and TRANSPORT — no concession, full amount due
        if (item.feeType === "ADDITIONAL" || item.feeType === "TRANSPORT") {
            finalPayableItems.push(item);
            continue;
        }
        // TUITION — apply sequential concession share
        const periodConcession = periodConcessionMapRZ[item.period] || 0;
        const periodTuitionFee = periodFeeMapRZ[item.period]?.totalFee || 0;
        const itemRawFee = installments.find(i => i._id.toString() === item.referenceId.toString())?.amount || 0;
        const itemShare = periodTuitionFee > 0
            ? parseFloat(((periodConcession * Number(itemRawFee)) / periodTuitionFee).toFixed(2))
            : 0;
        const paid = prevAllocMap[item.referenceId.toString()] || 0;
        const rawDue = Number(itemRawFee) - paid;
        const dueAmount = parseFloat(Math.max(rawDue - itemShare, 0).toFixed(2));
        if (dueAmount > 0) finalPayableItems.push({ ...item, dueAmount });

        // Late fee right after tuition
        if (item.feeType === "TUITION") {
            const lf = lateFeeByInstallment[item.referenceId.toString()];
            if (lf) finalPayableItems.push({
                feeType: "LATE_FEE", referenceId: lf._id,
                dueDate: item.dueDate, dueAmount: lf.lfDue, period: item.period,
            });
        }
    }

    // ── Allocate payment across all items ──
    let remaining = Number(payment.amountPaid);

    for (const item of finalPayableItems) {
        if (remaining <= 0) break;
        const apply = Math.min(item.dueAmount, remaining);
        await Allocation.create({
            paymentId:       payment._id,
            feeType:         item.feeType,
            referenceId:     item.referenceId,
            allocatedAmount: apply,
        });
        remaining -= apply;
    }

    res.status(200).json(
        new apiResponse(200, payment, "Payment verified and allocated successfully")
    );
});