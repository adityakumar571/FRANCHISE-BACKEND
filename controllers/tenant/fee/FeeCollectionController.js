import { getStudentPaymentModel } from "../../../models/tenant/master/StudentPayment.model.js";
import { getStudentPaymentAllocationModel } from "../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { getFeeInstallmentModel } from "../../../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel } from "../../../models/tenant/master/AdditionalFee.model.js";
import { getAdditionalFeeWaiverModel } from "../../../models/tenant/master/AdditionalFeeWaiver.model.js";
import { getTransportFeeModel } from "../../../models/tenant/master/TransportFee.model.js";
import { getTransportFeeWaiverModel } from "../../../models/tenant/master/TransportFeeWaiver.model.js";
import { getFeeStructureModel } from "../../../models/tenant/master/FeeStructure.model.js";
import { getLateFeeModel } from "../../../models/tenant/master/LateFee.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { calculateStudentPayableSummary } from "../../../utils/feeHelper.js";
import { syncLateFees } from "../../../utils/lateFeeHelper.js";
import { generateReceiptNo } from "../../../utils/receiptHelper.js";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

/* ================================================================
   COLLECT STUDENT FEE
   Allocation order (by dueDate, earliest first):
     1. TUITION
     2. ADDITIONAL
     3. TRANSPORT
     4. LATE_FEE  (after regular fees are cleared)
================================================================ */
const collectStudentFee = asyncHandler(async (req, res) => {

  const StudentPayment = getStudentPaymentModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const FeeInstallment = getFeeInstallmentModel(req.db);
  const AdditionalFee = getAdditionalFeeModel(req.db);
  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(req.db);
  const TransportFee = getTransportFeeModel(req.db);
  const TransportFeeWaiver = getTransportFeeWaiverModel(req.db);
  const FeeStructure = getFeeStructureModel(req.db);
  const LateFee = getLateFeeModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const {
    clerkId,
    sessionId,
    studentId,
    classId,
    streamId: rawStreamId,
    amountPaid,
    paymentMode,
    referenceNo,
    remarks,
  } = req.body;

  // Normalize streamId — reject invalid/object values
  const streamId = mongoose.Types.ObjectId.isValid(rawStreamId) ? rawStreamId : null;

  if (!sessionId || !studentId || !classId || !amountPaid || !paymentMode) {
    return res.status(400).json(new apiResponse(400, null, "Required fields missing"));
  }

  // ── 1. Validate payment amount ──
  const summary = await calculateStudentPayableSummary({
    db: req.db,
    sessionId,
    studentId,
    classId,
    streamId,
  });

  if (Number(amountPaid) > summary.remainingPayable) {
    return res.status(400).json(
      new apiResponse(400, summary, "Payment exceeds total payable fees for this session")
    );
  }

  // ── 2. Create payment record ──
  const payment = await StudentPayment.create({
    clerkId,
    sessionId,
    studentId,
    classId,
    streamId: streamId || null,
    amountPaid,
    paymentMode,
    referenceNo,
    receiptNo: await generateReceiptNo(req.db),
    remarks,
    paymentStatus: "SUCCESS",
  });

  let remaining = Number(amountPaid);

  // ── 3. Previous payment IDs (for already-paid calculation) ──
  const prevPaymentIds = await StudentPayment.find({
    studentId,
    sessionId,
    paymentStatus: "SUCCESS",
    _id: { $ne: payment._id },
  }).distinct("_id");

  // ── 4. Fee structures & installments ──
  // If streamId provided, match exact; otherwise fetch non-stream fee structures
  const feeStructureQuery = streamId
    ? { sessionId, classId, streamId, isActive: true }
    : {
      sessionId,
      classId,
      isActive: true,
      $or: [{ streamId: null }, { streamId: { $exists: false } }],
    };

  const feeStructures = await FeeStructure.find(feeStructureQuery);
  const feeStructureIds = feeStructures.map(fs => fs._id);

  const tuitionInstallments = await FeeInstallment.find({
    feeStructureId: { $in: feeStructureIds },
  }).sort({ installmentNo: 1 });

  // ── 5. Additional fees ──
  const classObjId = mongoose.Types.ObjectId.isValid(classId) ? new mongoose.Types.ObjectId(classId) : null;
  const streamObjId = mongoose.Types.ObjectId.isValid(streamId) ? new mongoose.Types.ObjectId(streamId) : null;

  const additionalOrClauses = [
    { classId: null },
    { classId: { $exists: false } },
  ];
  if (classObjId) {
    additionalOrClauses.push({ classId: classObjId, streamId: null });
    additionalOrClauses.push({ classId: classObjId, streamId: { $exists: false } });
    if (streamObjId) {
      additionalOrClauses.push({ classId: classObjId, streamId: streamObjId });
    }
  }

  const additionalFees = await AdditionalFee.find({
    sessionId,
    isActive: true,
    $or: additionalOrClauses,
  });

  // ── 6. Transport fees (deduplicated by period) ──
  const activeTransportRaw = await TransportFee.find({
    studentId,
    sessionId,
    isActive: true,
  }).sort({ updatedAt: -1 });

  const transportPaidAllocations = await StudentPaymentAllocation.find({
    feeType: "TRANSPORT",
    referenceId: { $in: activeTransportRaw.map(f => f._id) },
    paymentId: { $in: prevPaymentIds },
    allocatedAmount: { $gt: 0 },
  });
  const transportPaidRefIds = new Set(
    transportPaidAllocations.map(a => a.referenceId.toString())
  );

  const transportByPeriod = {};
  for (const f of activeTransportRaw) {
    const p = f.period;
    if (!transportByPeriod[p]) { transportByPeriod[p] = f; continue; }
    const existing = transportByPeriod[p];
    const fIsPaid = transportPaidRefIds.has(f._id.toString());
    const existingIsPaid = transportPaidRefIds.has(existing._id.toString());
    if (fIsPaid && !existingIsPaid) { transportByPeriod[p] = f; continue; }
    if (!fIsPaid && existingIsPaid) continue;
    if (f.isActive && !existing.isActive) { transportByPeriod[p] = f; continue; }
    if (!f.isActive && existing.isActive) continue;
    if (new Date(f.updatedAt) > new Date(existing.updatedAt)) transportByPeriod[p] = f;
  }
  const activeTransportFees = Object.values(transportByPeriod);

  // ── 7. Build allocation map for previous payments ──
  const prevAllocations = prevPaymentIds.length
    ? await StudentPaymentAllocation.find({ paymentId: { $in: prevPaymentIds } }).lean()
    : [];

  const prevAllocMap = {};
  for (const a of prevAllocations) {
    const rid = a.referenceId.toString();
    prevAllocMap[rid] = (prevAllocMap[rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // ── 8. Sync late fees to DB before allocation ──
  await syncLateFees({
    db: req.db,
    sessionId,
    studentId,
    classId,
    installments: tuitionInstallments.map(i => i.toObject ? i.toObject() : i),
    allocationMap: prevAllocMap,
  });

  // ── 9. Fetch late fees from DB (after sync) ──
  // Fetch ALL non-waived late fees regardless of tuition paid status.
  // syncLateFees only creates/updates records for unpaid tuition,
  // but existing late fee records must still be collected even if tuition was paid later.
  const lateFeeRecords = await LateFee.find({
    sessionId,
    studentId,
    isWaived: false,
    amount: { $gt: 0 },
  }).lean();

  // Map: installment referenceId → lateFee doc
  const lateFeeByInstallment = {};
  for (const lf of lateFeeRecords) {
    // Only include if there is still an outstanding due amount (after paid + waivedAmount)
    const lfPaid   = prevAllocMap[lf._id.toString()] || 0;
    const lfWaived = Number(lf.waivedAmount || 0);
    const lfDue    = Math.max(0, Number(lf.amount) - lfPaid - lfWaived);
    if (lfDue > 0) {
      lateFeeByInstallment[lf.referenceId.toString()] = lf;
    }
  }

  // ── 9b. Concession distribution — TUITION ONLY, SEQUENTIAL (April first) ──
  // Concession fills periods one by one: April → May → June...
  // e.g. ₹2500 concession, ₹1000/month → April ₹1000, May ₹1000, June ₹500
  const enrolment = await StudentEnrolment.findById(studentId).lean();

  // Build period tuition map (amount per period)
  const periodFeeMap = {};
  for (const inst of tuitionInstallments) {
    const p = inst.period;
    if (!periodFeeMap[p]) periodFeeMap[p] = { totalFee: 0, paidAmount: 0 };
    periodFeeMap[p].totalFee   += Number(inst.amount || 0);
    periodFeeMap[p].paidAmount += prevAllocMap[inst._id.toString()] || 0;
  }

  // Sequential concession: fill from April downwards
  const PERIOD_ORDER_C = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH","APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR"];
  const sortedTuitionPeriods = Object.keys(periodFeeMap).sort((a, b) =>
    (PERIOD_ORDER_C.indexOf(a) === -1 ? 999 : PERIOD_ORDER_C.indexOf(a)) -
    (PERIOD_ORDER_C.indexOf(b) === -1 ? 999 : PERIOD_ORDER_C.indexOf(b))
  );

  const periodConcessionMap = {};
  let concessionRemaining = summary.concessionAmount;
  for (const per of sortedTuitionPeriods) {
    if (concessionRemaining <= 0) break;
    const tuitionInPeriod = periodFeeMap[per].totalFee;
    if (tuitionInPeriod <= 0) continue;
    const apply = parseFloat(Math.min(concessionRemaining, tuitionInPeriod).toFixed(2));
    // Cap to what is still due (not already paid)
    const rawDue = periodFeeMap[per].totalFee - periodFeeMap[per].paidAmount;
    periodConcessionMap[per] = Math.min(apply, Math.max(0, rawDue));
    concessionRemaining = parseFloat((concessionRemaining - apply).toFixed(2));
  }

  // ── 10. Build payable items list (regular fees + late fees interleaved by period) ──
  // dueAmount is concession-adjusted so paying exactly one period clears it fully.
  const payableItems = [];

  // Tuition + its associated Late Fee (same period, collected together)
  for (const inst of tuitionInstallments) {
    const paid = prevAllocMap[inst._id.toString()] || 0;
    const rawDue = Number(inst.amount) - paid;
    if (rawDue > 0) {
      // Apply proportional concession share for this installment within its period
      const periodTotalFee = periodFeeMap[inst.period]?.totalFee || 0;
      const periodConcession = periodConcessionMap[inst.period] || 0;
      const instShare = periodTotalFee > 0
        ? parseFloat(((periodConcession * Number(inst.amount)) / periodTotalFee).toFixed(2))
        : 0;
      const dueAmount = parseFloat(Math.max(rawDue - instShare, 0).toFixed(2));
      if (dueAmount > 0) {
        payableItems.push({
          feeType: "TUITION",
          referenceId: inst._id,
          dueDate: inst.dueDate,
          dueAmount,
          period: inst.period,
        });
      }
    }

    // Late fee for this installment — add right after tuition (same dueDate, same period)
    const lf = lateFeeByInstallment[inst._id.toString()];
    if (lf) {
      const lfPaid   = prevAllocMap[lf._id.toString()] || 0;
      const lfWaived = Number(lf.waivedAmount || 0);
      const lfDue    = Math.max(0, Number(lf.amount) - lfPaid - lfWaived);
      if (lfDue > 0) {
        payableItems.push({
          feeType: "LATE_FEE",
          referenceId: lf._id,
          dueDate: inst.dueDate,
          dueAmount: lfDue,
          period: inst.period,
        });
      }
    }
  }

  // Additional fees — no concession (waived via AdditionalFeeWaiver)
  // Fetch waiver records to subtract waivedAmount from dueAmount
  const additionalFeeIds = additionalFees.map(f => f._id);
  const additionalWaiverRecords = additionalFeeIds.length
    ? await AdditionalFeeWaiver.find({
        studentId,
        additionalFeeId: { $in: additionalFeeIds },
      }).lean()
    : [];
  const additionalWaiverMap = {};
  for (const w of additionalWaiverRecords) {
    additionalWaiverMap[w.additionalFeeId.toString()] = w;
  }

  for (const fee of additionalFees) {
    const paid         = prevAllocMap[fee._id.toString()] || 0;
    const waiverRecord = additionalWaiverMap[fee._id.toString()];
    const waivedAmt    = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
    const isFullWaived = waiverRecord ? waiverRecord.isWaived : false;

    if (isFullWaived) continue; // fully waived — skip entirely

    // dueAmount = total - paid - waivedAmount
    const dueAmount = parseFloat(Math.max(Number(fee.amount) - paid - waivedAmt, 0).toFixed(2));
    if (dueAmount > 0) {
      payableItems.push({
        feeType: "ADDITIONAL",
        referenceId: fee._id,
        dueDate: fee.dueDate,
        dueAmount,
        period: fee.period,
      });
    }
  }

  // Transport fees — waiver via TransportFeeWaiver
  // Fetch waiver records for active transport fees
  const activeTransportIds = activeTransportFees.map(f => f._id);
  const transportWaiverRecords = activeTransportIds.length
    ? await TransportFeeWaiver.find({
        studentId,
        transportFeeId: { $in: activeTransportIds },
      }).lean()
    : [];
  const transportWaiverMap = {};
  for (const w of transportWaiverRecords) {
    transportWaiverMap[w.transportFeeId.toString()] = w;
  }

  for (const fee of activeTransportFees) {
    const paid         = prevAllocMap[fee._id.toString()] || 0;
    const waiverRecord = transportWaiverMap[fee._id.toString()];
    const waivedAmt    = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
    const isFullWaived = waiverRecord ? waiverRecord.isWaived : false;

    if (isFullWaived) continue; // fully waived — skip entirely

    const dueAmount = parseFloat(Math.max(Number(fee.amount) - paid - waivedAmt, 0).toFixed(2));
    if (dueAmount > 0) {
      payableItems.push({
        feeType: "TRANSPORT",
        referenceId: fee._id,
        dueDate: fee.dueDate,
        dueAmount,
        period: fee.period,
      });
    }
  }

  // Sort by period order (installmentNo) first — dueDate is secondary.
  // This ensures April → May → June order is always respected regardless of
  // when dueDates were set in the database.
  const PERIOD_ORDER = [
    "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER",
    "OCTOBER", "NOVEMBER", "DECEMBER", "JANUARY", "FEBRUARY", "MARCH",
    "APR-JUN", "JUL-SEP", "OCT-DEC", "JAN-MAR",
  ];
  // LATE_FEE comes LAST within a period — only after TUITION, ADDITIONAL, TRANSPORT are fully paid
  const feeTypeOrder = { TUITION: 0, ADDITIONAL: 1, TRANSPORT: 2, LATE_FEE: 3 };
  payableItems.sort((a, b) => {
    const ai = PERIOD_ORDER.indexOf(a.period);
    const bi = PERIOD_ORDER.indexOf(b.period);
    const periodDiff = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    if (periodDiff !== 0) return periodDiff;
    // Same period — sort by feeType priority
    return (feeTypeOrder[a.feeType] ?? 9) - (feeTypeOrder[b.feeType] ?? 9);
  });

  // ── 10b. No additional concession adjustment needed ──
  // dueAmount in payableItems is already concession-adjusted above.

  // ── 11. Allocate payment across all items ──

  // Track which periods still have unpaid regular fees — Late Fee for a period
  // is only allocated after ALL regular fees (TUITION + ADDITIONAL + TRANSPORT) in that period are fully paid.
  const periodRegularDueTracker = {};
  for (const item of payableItems) {
    if (item.feeType !== "LATE_FEE") {
      const p = item.period;
      periodRegularDueTracker[p] = (periodRegularDueTracker[p] || 0) + item.dueAmount;
    }
  }

  for (const item of payableItems) {
    if (remaining <= 0) break;

    // Skip Late Fee if this period still has unpaid regular fees
    if (item.feeType === "LATE_FEE") {
      const regularStillDue = periodRegularDueTracker[item.period] || 0;
      if (regularStillDue > 0) continue;
    }

    const apply = Math.min(item.dueAmount, remaining);
    if (apply <= 0) continue;

    await StudentPaymentAllocation.create({
      paymentId: payment._id,
      feeType: item.feeType,
      referenceId: item.referenceId,
      allocatedAmount: apply,
    });

    // Reduce the regular due tracker for this period
    if (item.feeType !== "LATE_FEE") {
      periodRegularDueTracker[item.period] = Math.max(
        0,
        (periodRegularDueTracker[item.period] || 0) - apply
      );
    }

    remaining -= apply;
  }

  res.status(200).json(
    new apiResponse(200, payment, "Fee collected and allocated successfully")
  );
});

/* ================================================================
   RECALCULATE ALLOCATIONS FOR A STUDENT
   Fixes corrupted/fractional allocations from old proportional concession logic.
   Deletes all existing allocations and re-runs allocation logic from scratch
   based on total amount paid per payment (amountPaid).

   POST /fee/recalculate-allocations
   Body: { studentId, sessionId, classId, streamId? }
================================================================ */
const recalculateAllocations = asyncHandler(async (req, res) => {
  const StudentPayment           = getStudentPaymentModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const FeeInstallment           = getFeeInstallmentModel(req.db);
  const AdditionalFee            = getAdditionalFeeModel(req.db);
  const AdditionalFeeWaiver      = getAdditionalFeeWaiverModel(req.db);
  const TransportFee             = getTransportFeeModel(req.db);
  const TransportFeeWaiverR      = getTransportFeeWaiverModel(req.db);
  const FeeStructure             = getFeeStructureModel(req.db);
  const LateFee                  = getLateFeeModel(req.db);

  const { studentId, sessionId, classId, streamId: rawStreamId } = req.body;
  const streamId = mongoose.Types.ObjectId.isValid(rawStreamId) ? rawStreamId : null;

  if (!studentId || !sessionId || !classId)
    return res.status(400).json(new apiResponse(400, null, "studentId, sessionId, classId required"));

  // 1. Get all SUCCESS payments in chronological order
  const payments = await StudentPayment.find({
    studentId, sessionId, paymentStatus: "SUCCESS",
  }).sort({ createdAt: 1 }).lean();

  if (!payments.length)
    return res.status(200).json(new apiResponse(200, { fixed: 0 }, "No payments found"));

  // 2. Delete ALL existing allocations for this student's payments
  const paymentIds = payments.map(p => p._id);
  await StudentPaymentAllocation.deleteMany({ paymentId: { $in: paymentIds } });

  // 3. Fetch fee items (same as collectStudentFee)
  const feeStructureQuery = streamId
    ? { sessionId, classId, streamId, isActive: true }
    : { sessionId, classId, isActive: true, $or: [{ streamId: null }, { streamId: { $exists: false } }] };

  const feeStructures = await FeeStructure.find(feeStructureQuery);
  const feeStructureIds = feeStructures.map(fs => fs._id);
  const tuitionInstallments = await FeeInstallment.find({
    feeStructureId: { $in: feeStructureIds },
  }).sort({ installmentNo: 1 }).lean();

  const classObjId  = mongoose.Types.ObjectId.isValid(classId)  ? new mongoose.Types.ObjectId(classId)  : null;
  const streamObjId = mongoose.Types.ObjectId.isValid(streamId) ? new mongoose.Types.ObjectId(streamId) : null;
  const additionalOrClauses = [{ classId: null }, { classId: { $exists: false } }];
  if (classObjId) {
    additionalOrClauses.push({ classId: classObjId, streamId: null });
    additionalOrClauses.push({ classId: classObjId, streamId: { $exists: false } });
    if (streamObjId) additionalOrClauses.push({ classId: classObjId, streamId: streamObjId });
  }
  const additionalFees = await AdditionalFee.find({ sessionId, isActive: true, $or: additionalOrClauses }).lean();

  // Fetch additional fee waiver records — needed for correct dueAmount calculation
  const additionalFeeIds = additionalFees.map(f => f._id);
  const additionalWaiverRecords = additionalFeeIds.length
    ? await AdditionalFeeWaiver.find({
        studentId,
        additionalFeeId: { $in: additionalFeeIds },
      }).lean()
    : [];
  const additionalWaiverMap = {};
  for (const w of additionalWaiverRecords) {
    additionalWaiverMap[w.additionalFeeId.toString()] = w;
  }

  const activeTransportRaw = await TransportFee.find({ studentId, sessionId, isActive: true }).sort({ updatedAt: -1 }).lean();

  // 3b. Transport dedup after allocations — we need running alloc to dedup correctly.
  // Use simple updatedAt dedup here for initial build; paid-based dedup applied per-payment in replay loop.
  const transportByPeriodInit = {};
  for (const f of activeTransportRaw) {
    const p = f.period;
    if (!transportByPeriodInit[p] || new Date(f.updatedAt) > new Date(transportByPeriodInit[p].updatedAt))
      transportByPeriodInit[p] = f;
  }
  const activeTransportFees = Object.values(transportByPeriodInit);

  // Fetch transport fee waiver records once (used in every replay iteration)
  const allTransportIds = activeTransportFees.map(f => f._id);
  const transportWaiverListR = allTransportIds.length
    ? await TransportFeeWaiverR.find({
        studentId,
        transportFeeId: { $in: allTransportIds },
      }).lean()
    : [];
  const transportWaiverMapR = {};
  for (const w of transportWaiverListR) {
    transportWaiverMapR[w.transportFeeId.toString()] = w;
  }

  // 4. Fetch concession info + enrolment (needed for fullFeeExceptTransport check)
  const summary = await calculateStudentPayableSummary({
    db: req.db, sessionId, studentId, classId, streamId,
  });

  const StudentEnrolmentR = getStudentEnrolmentModel(req.db);
  const enrolmentR = await StudentEnrolmentR.findById(studentId).lean();
  const isFullFeeExceptTransportR = !!(enrolmentR && enrolmentR.fullFeeExceptTransport && !enrolmentR.fullFeeConcession);

  // 5. Replay each payment in order
  const runningAllocMap = {}; // referenceId → totalAllocated so far
  let totalFixed = 0;

  const PERIOD_ORDER = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH","APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR"];
  const feeTypeOrder = { TUITION: 0, ADDITIONAL: 1, TRANSPORT: 2, LATE_FEE: 3 };

  for (const payment of payments) {
    let remaining = Number(payment.amountPaid);

    // Sync late fees based on current allocation state
    await syncLateFees({
      db: req.db, sessionId, studentId, classId,
      installments: tuitionInstallments,
      allocationMap: runningAllocMap,
    });

    const lateFeeRecords = await LateFee.find({ sessionId, studentId, isWaived: false, amount: { $gt: 0 } }).lean();
    const lateFeeByInstallment = {};
    for (const lf of lateFeeRecords) {
      const lfPaid   = runningAllocMap[lf._id.toString()] || 0;
      const lfWaived = Number(lf.waivedAmount || 0);
      const lfDue    = Math.max(0, Number(lf.amount) - lfPaid - lfWaived);
      if (lfDue > 0) lateFeeByInstallment[lf.referenceId.toString()] = lf;
    }

    // Re-dedup transport using current runningAllocMap (paid > isActive > updatedAt — same as collectStudentFee)
    const paidTransportRefIds = new Set(
      Object.entries(runningAllocMap)
        .filter(([rid, amt]) => amt > 0 && activeTransportFees.find(t => t._id.toString() === rid))
        .map(([rid]) => rid)
    );
    const transportByPeriodR = {};
    for (const f of activeTransportFees) {
      const p = f.period;
      if (!transportByPeriodR[p]) { transportByPeriodR[p] = f; continue; }
      const existing = transportByPeriodR[p];
      const tPaid = paidTransportRefIds.has(f._id.toString());
      const ePaid = paidTransportRefIds.has(existing._id.toString());
      if (tPaid && !ePaid) { transportByPeriodR[p] = f; continue; }
      if (!tPaid && ePaid) continue;
      if (f.isActive && !existing.isActive) { transportByPeriodR[p] = f; continue; }
      if (!f.isActive && existing.isActive) continue;
      if (new Date(f.updatedAt) > new Date(existing.updatedAt)) transportByPeriodR[p] = f;
    }
    const dedupedTransport = Object.values(transportByPeriodR);

    // Build period fee map (same as collectStudentFee step 9b)
    const periodFeeMap = {};
    for (const inst of tuitionInstallments) {
      const p = inst.period;
      if (!periodFeeMap[p]) periodFeeMap[p] = { totalFee: 0, paidAmount: 0, transportFee: 0 };
      periodFeeMap[p].totalFee   += Number(inst.amount || 0);
      periodFeeMap[p].paidAmount += runningAllocMap[inst._id.toString()] || 0;
    }
    for (const fee of additionalFees) {
      const p = fee.period;
      if (!p) continue;
      if (!periodFeeMap[p]) periodFeeMap[p] = { totalFee: 0, paidAmount: 0, transportFee: 0 };
      periodFeeMap[p].totalFee   += Number(fee.amount || 0);
      periodFeeMap[p].paidAmount += runningAllocMap[fee._id.toString()] || 0;
    }
    for (const fee of dedupedTransport) {
      const p = fee.period;
      if (!periodFeeMap[p]) periodFeeMap[p] = { totalFee: 0, paidAmount: 0, transportFee: 0 };
      periodFeeMap[p].totalFee      += Number(fee.amount || 0);
      periodFeeMap[p].paidAmount    += runningAllocMap[fee._id.toString()] || 0;
      periodFeeMap[p].transportFee  += Number(fee.amount || 0);
    }

    // Concession — TUITION ONLY, SEQUENTIAL (April first)
    const periodTuitionMap = {};
    for (const inst of tuitionInstallments) {
      const p = inst.period;
      if (!periodTuitionMap[p]) periodTuitionMap[p] = { totalFee: 0, paidAmount: 0 };
      periodTuitionMap[p].totalFee   += Number(inst.amount || 0);
      periodTuitionMap[p].paidAmount += runningAllocMap[inst._id.toString()] || 0;
    }
    const sortedTuitionPeriods = Object.keys(periodTuitionMap).sort((a, b) =>
      (PERIOD_ORDER.indexOf(a) === -1 ? 999 : PERIOD_ORDER.indexOf(a)) -
      (PERIOD_ORDER.indexOf(b) === -1 ? 999 : PERIOD_ORDER.indexOf(b))
    );
    const periodConcessionMap = {};
    let concessionRemaining = summary.concessionAmount;
    for (const per of sortedTuitionPeriods) {
      if (concessionRemaining <= 0) break;
      const tuitionInPeriod = periodTuitionMap[per].totalFee;
      if (tuitionInPeriod <= 0) continue;
      const apply = parseFloat(Math.min(concessionRemaining, tuitionInPeriod).toFixed(2));
      const rawDue = periodTuitionMap[per].totalFee - periodTuitionMap[per].paidAmount;
      periodConcessionMap[per] = Math.min(apply, Math.max(0, rawDue));
      concessionRemaining = parseFloat((concessionRemaining - apply).toFixed(2));
    }

    // Build payable items — concession on TUITION only, ADDITIONAL/TRANSPORT full amount
    const payableItems = [];
    for (const inst of tuitionInstallments) {
      const paid = runningAllocMap[inst._id.toString()] || 0;
      const rawDue = Number(inst.amount) - paid;
      if (rawDue > 0) {
        const periodTuition = periodTuitionMap[inst.period]?.totalFee || 0;
        const periodConcession = periodConcessionMap[inst.period] || 0;
        const instShare = periodTuition > 0
          ? parseFloat(((periodConcession * Number(inst.amount)) / periodTuition).toFixed(2))
          : 0;
        const dueAmount = parseFloat(Math.max(rawDue - instShare, 0).toFixed(2));
        if (dueAmount > 0) payableItems.push({ feeType: "TUITION", referenceId: inst._id, dueAmount, period: inst.period });
      }
      const lf = lateFeeByInstallment[inst._id.toString()];
      if (lf) {
        const lfPaid   = runningAllocMap[lf._id.toString()] || 0;
        const lfWaived = Number(lf.waivedAmount || 0);  // FIX: waivedAmount was ignored
        const lfDue    = Math.max(0, Number(lf.amount) - lfPaid - lfWaived);
        if (lfDue > 0) payableItems.push({ feeType: "LATE_FEE", referenceId: lf._id, dueAmount: lfDue, period: inst.period });
      }
    }
    for (const fee of additionalFees) {
      const paid         = runningAllocMap[fee._id.toString()] || 0;
      const waiverRecord = additionalWaiverMap[fee._id.toString()];
      const waivedAmt    = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
      const isFullWaived = waiverRecord ? waiverRecord.isWaived : false;
      if (isFullWaived) continue;
      const dueAmount = parseFloat(Math.max(Number(fee.amount) - paid - waivedAmt, 0).toFixed(2));
      if (dueAmount > 0) payableItems.push({ feeType: "ADDITIONAL", referenceId: fee._id, dueAmount, period: fee.period });
    }
    for (const fee of dedupedTransport) {
      const paid         = runningAllocMap[fee._id.toString()] || 0;
      const waiverRecord = transportWaiverMapR[fee._id.toString()];
      const waivedAmt    = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
      const isFullWaived = waiverRecord ? waiverRecord.isWaived : false;
      if (isFullWaived) continue;
      const dueAmount = parseFloat(Math.max(Number(fee.amount) - paid - waivedAmt, 0).toFixed(2));
      if (dueAmount > 0) payableItems.push({ feeType: "TRANSPORT", referenceId: fee._id, dueAmount, period: fee.period });
    }

    payableItems.sort((a, b) => {
      const pd = (PERIOD_ORDER.indexOf(a.period) === -1 ? 999 : PERIOD_ORDER.indexOf(a.period)) -
                 (PERIOD_ORDER.indexOf(b.period) === -1 ? 999 : PERIOD_ORDER.indexOf(b.period));
      return pd !== 0 ? pd : (feeTypeOrder[a.feeType] ?? 9) - (feeTypeOrder[b.feeType] ?? 9);
    });

    // Allocate with period-regular-due tracker
    const periodRegularDueTracker = {};
    for (const item of payableItems) {
      if (item.feeType !== "LATE_FEE")
        periodRegularDueTracker[item.period] = (periodRegularDueTracker[item.period] || 0) + item.dueAmount;
    }

    for (const item of payableItems) {
      if (remaining <= 0) break;
      if (item.feeType === "LATE_FEE" && (periodRegularDueTracker[item.period] || 0) > 0) continue;
      const apply = Math.min(item.dueAmount, remaining);
      if (apply <= 0) continue;

      await StudentPaymentAllocation.create({
        paymentId: payment._id,
        feeType: item.feeType,
        referenceId: item.referenceId,
        allocatedAmount: apply,
      });

      const rid = item.referenceId.toString();
      runningAllocMap[rid] = (runningAllocMap[rid] || 0) + apply;
      if (item.feeType !== "LATE_FEE")
        periodRegularDueTracker[item.period] = Math.max(0, (periodRegularDueTracker[item.period] || 0) - apply);
      remaining -= apply;
      totalFixed++;
    }
  }

  res.status(200).json(new apiResponse(200, { fixed: totalFixed, payments: payments.length },
    "Allocations recalculated successfully"));
});
const fixTransportFees = asyncHandler(async (req, res) => {
  const TransportFee = getTransportFeeModel(req.db);

  const { studentId, sessionId } = req.body;

  const query = {};
  if (studentId) query.studentId = studentId;
  if (sessionId) query.sessionId = sessionId;

  const allRecords = await TransportFee.find(query).sort({ updatedAt: -1 });

  const seen = new Map();
  const toDeactivate = [];

  for (const rec of allRecords) {
    const key = `${rec.studentId}_${rec.sessionId}_${rec.period}`;
    if (!seen.has(key)) {
      seen.set(key, rec._id);
    } else {
      toDeactivate.push(rec._id);
    }
  }

  if (toDeactivate.length > 0) {
    await TransportFee.updateMany(
      { _id: { $in: toDeactivate } },
      { $set: { isActive: false } }
    );
  }

  res.status(200).json(
    new apiResponse(200, { fixed: toDeactivate.length },
      `Fixed ${toDeactivate.length} duplicate transport fee records`)
  );
});

/* ================================================================
   ⚠️  DANGER: CLEAR ALL PAYMENT DATA
   Deletes StudentPayment, StudentPaymentAllocation, LateFee
   for ALL sessions. Fee structure is NOT touched.

   POST /fee/clear-all-payment-data
   Body: { confirm: "YES_DELETE_ALL" }
================================================================ */
const clearAllPaymentData = asyncHandler(async (req, res) => {
  const { confirm } = req.body;

  if (confirm !== "YES_DELETE_ALL") {
    return res.status(400).json(
      new apiResponse(400, null, 'Send confirm: "YES_DELETE_ALL" to proceed')
    );
  }

  const StudentPayment           = getStudentPaymentModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const LateFee                  = getLateFeeModel(req.db);

  const [payments, allocations, lateFees] = await Promise.all([
    StudentPayment.deleteMany({}),
    StudentPaymentAllocation.deleteMany({}),
    LateFee.deleteMany({}),
  ]);

  res.status(200).json(new apiResponse(200, {
    deletedPayments:    payments.deletedCount,
    deletedAllocations: allocations.deletedCount,
    deletedLateFees:    lateFees.deletedCount,
  }, "All payment data cleared successfully"));
});

/* ================================================================
   CANCEL / REVERSE A PAYMENT
   - Marks the payment as CANCELLED
   - Deletes its allocations
   - Re-runs allocations for remaining active payments (recalculate)

   POST /fee/cancel-payment
   Body: { paymentId, reason }
================================================================ */
const cancelStudentPayment = asyncHandler(async (req, res) => {
  const StudentPayment           = getStudentPaymentModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const FeeInstallment           = getFeeInstallmentModel(req.db);
  const AdditionalFee            = getAdditionalFeeModel(req.db);
  const AdditionalFeeWaiver      = getAdditionalFeeWaiverModel(req.db);
  const TransportFee             = getTransportFeeModel(req.db);
  const TransportFeeWaiver       = getTransportFeeWaiverModel(req.db);
  const FeeStructure             = getFeeStructureModel(req.db);
  const LateFee                  = getLateFeeModel(req.db);

  const { paymentId, reason } = req.body;

  if (!paymentId || !mongoose.Types.ObjectId.isValid(paymentId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid paymentId required"));
  }

  // 1. Find the payment
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) {
    return res.status(404).json(new apiResponse(404, null, "Payment not found"));
  }
  if (payment.paymentStatus === "CANCELLED") {
    return res.status(400).json(new apiResponse(400, null, "Payment is already cancelled"));
  }

  // Online/Razorpay payments cannot be cancelled — real money involved
  if (payment.paymentType === "ONLINE" || payment.gatewayOrderId || payment.gatewayPaymentId) {
    return res.status(400).json(
      new apiResponse(400, null, "Online payments cannot be cancelled here. Please initiate a refund through Razorpay dashboard.")
    );
  }

  const { studentId, sessionId, classId, streamId } = payment;

  // 2. Mark payment as CANCELLED
  payment.paymentStatus = "CANCELLED";
  payment.remarks = reason
    ? `[CANCELLED] ${reason}${payment.remarks ? " | " + payment.remarks : ""}`
    : `[CANCELLED]${payment.remarks ? " | " + payment.remarks : ""}`;
  await payment.save();

  // 3. Delete allocations for this cancelled payment
  await StudentPaymentAllocation.deleteMany({ paymentId: payment._id });

  // 4. Recalculate allocations for remaining active payments
  const activePayments = await StudentPayment.find({
    studentId, sessionId, paymentStatus: "SUCCESS",
  }).sort({ createdAt: 1 }).lean();

  if (activePayments.length === 0) {
    return res.status(200).json(new apiResponse(200, {
      cancelledPayment: payment,
      recalculated: 0,
    }, "Payment cancelled. No remaining payments to recalculate."));
  }

  const activePaymentIds = activePayments.map(p => p._id);
  await StudentPaymentAllocation.deleteMany({ paymentId: { $in: activePaymentIds } });

  // Fetch fee items (same as collectStudentFee)
  const normalizedStreamId = mongoose.Types.ObjectId.isValid(streamId) ? streamId : null;
  const feeStructureQuery = normalizedStreamId
    ? { sessionId, classId, streamId: normalizedStreamId, isActive: true }
    : { sessionId, classId, isActive: true, $or: [{ streamId: null }, { streamId: { $exists: false } }] };

  const feeStructures    = await FeeStructure.find(feeStructureQuery);
  const feeStructureIds  = feeStructures.map(fs => fs._id);
  const tuitionInstallments = await FeeInstallment.find({
    feeStructureId: { $in: feeStructureIds },
  }).sort({ installmentNo: 1 }).lean();

  const classObjId  = mongoose.Types.ObjectId.isValid(classId)             ? new mongoose.Types.ObjectId(classId)             : null;
  const streamObjId = mongoose.Types.ObjectId.isValid(normalizedStreamId)  ? new mongoose.Types.ObjectId(normalizedStreamId)  : null;
  const additionalOrClauses = [{ classId: null }, { classId: { $exists: false } }];
  if (classObjId) {
    additionalOrClauses.push({ classId: classObjId, streamId: null });
    additionalOrClauses.push({ classId: classObjId, streamId: { $exists: false } });
    if (streamObjId) additionalOrClauses.push({ classId: classObjId, streamId: streamObjId });
  }
  const additionalFees = await AdditionalFee.find({ sessionId, isActive: true, $or: additionalOrClauses }).lean();

  const additionalFeeIds = additionalFees.map(f => f._id);
  const additionalWaiverRecords = additionalFeeIds.length
    ? await AdditionalFeeWaiver.find({ studentId, additionalFeeId: { $in: additionalFeeIds } }).lean()
    : [];
  const additionalWaiverMap = {};
  for (const w of additionalWaiverRecords) additionalWaiverMap[w.additionalFeeId.toString()] = w;

  const activeTransportRaw = await TransportFee.find({ studentId, sessionId, isActive: true }).sort({ updatedAt: -1 }).lean();
  const transportByPeriodInit = {};
  for (const f of activeTransportRaw) {
    const p = f.period;
    if (!transportByPeriodInit[p] || new Date(f.updatedAt) > new Date(transportByPeriodInit[p].updatedAt))
      transportByPeriodInit[p] = f;
  }
  const activeTransportFees = Object.values(transportByPeriodInit);
  const allTransportIds = activeTransportFees.map(f => f._id);
  const transportWaiverList = allTransportIds.length
    ? await TransportFeeWaiver.find({ studentId, transportFeeId: { $in: allTransportIds } }).lean()
    : [];
  const transportWaiverMap = {};
  for (const w of transportWaiverList) transportWaiverMap[w.transportFeeId.toString()] = w;

  const summary = await calculateStudentPayableSummary({ db: req.db, sessionId, studentId, classId, streamId: normalizedStreamId });

  // Replay each active payment in order
  const PERIOD_ORDER = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH","APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR"];
  const feeTypeOrder = { TUITION: 0, ADDITIONAL: 1, TRANSPORT: 2, LATE_FEE: 3 };
  const runningAllocMap = {};
  let totalFixed = 0;

  for (const pmt of activePayments) {
    let remaining = Number(pmt.amountPaid);

    await syncLateFees({ db: req.db, sessionId, studentId, classId, installments: tuitionInstallments, allocationMap: runningAllocMap });

    const lateFeeRecords = await LateFee.find({ sessionId, studentId, isWaived: false, amount: { $gt: 0 } }).lean();
    const lateFeeByInstallment = {};
    for (const lf of lateFeeRecords) {
      const lfDue = Math.max(0, Number(lf.amount) - (runningAllocMap[lf._id.toString()] || 0) - Number(lf.waivedAmount || 0));
      if (lfDue > 0) lateFeeByInstallment[lf.referenceId.toString()] = lf;
    }

    const periodTuitionMap = {};
    for (const inst of tuitionInstallments) {
      const p = inst.period;
      if (!periodTuitionMap[p]) periodTuitionMap[p] = { totalFee: 0, paidAmount: 0 };
      periodTuitionMap[p].totalFee   += Number(inst.amount || 0);
      periodTuitionMap[p].paidAmount += runningAllocMap[inst._id.toString()] || 0;
    }
    const sortedPeriods = Object.keys(periodTuitionMap).sort((a, b) =>
      (PERIOD_ORDER.indexOf(a) === -1 ? 999 : PERIOD_ORDER.indexOf(a)) -
      (PERIOD_ORDER.indexOf(b) === -1 ? 999 : PERIOD_ORDER.indexOf(b))
    );
    const periodConcessionMap = {};
    let concessionRemaining = summary.concessionAmount;
    for (const per of sortedPeriods) {
      if (concessionRemaining <= 0) break;
      const tuitionInPeriod = periodTuitionMap[per].totalFee;
      if (tuitionInPeriod <= 0) continue;
      const apply = parseFloat(Math.min(concessionRemaining, tuitionInPeriod).toFixed(2));
      const rawDue = periodTuitionMap[per].totalFee - periodTuitionMap[per].paidAmount;
      periodConcessionMap[per] = Math.min(apply, Math.max(0, rawDue));
      concessionRemaining = parseFloat((concessionRemaining - apply).toFixed(2));
    }

    const payableItems = [];
    for (const inst of tuitionInstallments) {
      const paid = runningAllocMap[inst._id.toString()] || 0;
      const rawDue = Number(inst.amount) - paid;
      if (rawDue > 0) {
        const periodTotal = periodTuitionMap[inst.period]?.totalFee || 0;
        const periodConc  = periodConcessionMap[inst.period] || 0;
        const instShare   = periodTotal > 0 ? parseFloat(((periodConc * Number(inst.amount)) / periodTotal).toFixed(2)) : 0;
        const dueAmount   = parseFloat(Math.max(rawDue - instShare, 0).toFixed(2));
        if (dueAmount > 0) payableItems.push({ feeType: "TUITION", referenceId: inst._id, dueAmount, period: inst.period });
      }
      const lf = lateFeeByInstallment[inst._id.toString()];
      if (lf) {
        const lfDue = Math.max(0, Number(lf.amount) - (runningAllocMap[lf._id.toString()] || 0) - Number(lf.waivedAmount || 0));
        if (lfDue > 0) payableItems.push({ feeType: "LATE_FEE", referenceId: lf._id, dueAmount: lfDue, period: inst.period });
      }
    }
    for (const fee of additionalFees) {
      const waiverRecord = additionalWaiverMap[fee._id.toString()];
      if (waiverRecord?.isWaived) continue;
      const dueAmount = parseFloat(Math.max(Number(fee.amount) - (runningAllocMap[fee._id.toString()] || 0) - Number(waiverRecord?.waivedAmount || 0), 0).toFixed(2));
      if (dueAmount > 0) payableItems.push({ feeType: "ADDITIONAL", referenceId: fee._id, dueAmount, period: fee.period });
    }
    for (const fee of activeTransportFees) {
      const waiverRecord = transportWaiverMap[fee._id.toString()];
      if (waiverRecord?.isWaived) continue;
      const dueAmount = parseFloat(Math.max(Number(fee.amount) - (runningAllocMap[fee._id.toString()] || 0) - Number(waiverRecord?.waivedAmount || 0), 0).toFixed(2));
      if (dueAmount > 0) payableItems.push({ feeType: "TRANSPORT", referenceId: fee._id, dueAmount, period: fee.period });
    }

    payableItems.sort((a, b) => {
      const pd = (PERIOD_ORDER.indexOf(a.period) === -1 ? 999 : PERIOD_ORDER.indexOf(a.period)) -
                 (PERIOD_ORDER.indexOf(b.period) === -1 ? 999 : PERIOD_ORDER.indexOf(b.period));
      return pd !== 0 ? pd : (feeTypeOrder[a.feeType] ?? 9) - (feeTypeOrder[b.feeType] ?? 9);
    });

    const periodRegularDueTracker = {};
    for (const item of payableItems) {
      if (item.feeType !== "LATE_FEE") periodRegularDueTracker[item.period] = (periodRegularDueTracker[item.period] || 0) + item.dueAmount;
    }

    for (const item of payableItems) {
      if (remaining <= 0) break;
      if (item.feeType === "LATE_FEE" && (periodRegularDueTracker[item.period] || 0) > 0) continue;
      const apply = Math.min(item.dueAmount, remaining);
      if (apply <= 0) continue;
      await StudentPaymentAllocation.create({ paymentId: pmt._id, feeType: item.feeType, referenceId: item.referenceId, allocatedAmount: apply });
      runningAllocMap[item.referenceId.toString()] = (runningAllocMap[item.referenceId.toString()] || 0) + apply;
      if (item.feeType !== "LATE_FEE") periodRegularDueTracker[item.period] = Math.max(0, (periodRegularDueTracker[item.period] || 0) - apply);
      remaining -= apply;
      totalFixed++;
    }
  }

  return res.status(200).json(new apiResponse(200, {
    cancelledPayment: { _id: payment._id, receiptNo: payment.receiptNo, amountPaid: payment.amountPaid, paymentStatus: "CANCELLED" },
    recalculated: totalFixed,
    activePaymentsCount: activePayments.length,
  }, "Payment cancelled and allocations recalculated successfully"));
});

export { collectStudentFee, fixTransportFees, recalculateAllocations, clearAllPaymentData, cancelStudentPayment };
