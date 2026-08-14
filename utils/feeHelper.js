import { getFeeInstallmentModel } from "../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel } from "../models/tenant/master/AdditionalFee.model.js";
import { getAdditionalFeeWaiverModel } from "../models/tenant/master/AdditionalFeeWaiver.model.js";
import { getStudentPaymentModel } from "../models/tenant/master/StudentPayment.model.js";
import { getStudentPaymentAllocationModel } from "../models/tenant/master/StudentPaymentAllocation.model.js";
import { getTransportFeeModel } from "../models/tenant/master/TransportFee.model.js";
import { getTransportFeeWaiverModel } from "../models/tenant/master/TransportFeeWaiver.model.js";
import { getFeeStructureModel } from "../models/tenant/master/FeeStructure.model.js";
import { getStudentEnrolmentModel } from "../models/tenant/student/StudentEnrolment.model.js";
import { getLateFeeModel } from "../models/tenant/master/LateFee.model.js";
import { syncLateFees } from "./lateFeeHelper.js";
import mongoose from "mongoose";

/* =====================================================
   DEDUPLICATE TRANSPORT FEES BY PERIOD
===================================================== */
const deduplicateTransportByPeriod = async (records, successPaymentIds, db) => {
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  if (!records.length) return [];

  const allIds = records.map(r => r._id);

  const paidAllocations = await StudentPaymentAllocation.find({
    feeType: "TRANSPORT",
    referenceId: { $in: allIds },
    allocatedAmount: { $gt: 0 },
    paymentId: { $in: successPaymentIds },
  });

  const paidRefIds = new Set(paidAllocations.map(a => a.referenceId.toString()));

  const byPeriod = {};
  for (const f of records) {
    const p = f.period;
    if (!byPeriod[p]) { byPeriod[p] = f; continue; }
    const existing = byPeriod[p];
    const fIsPaid = paidRefIds.has(f._id.toString());
    const existingIsPaid = paidRefIds.has(existing._id.toString());

    if (fIsPaid && !existingIsPaid) { byPeriod[p] = f; continue; }
    if (!fIsPaid && existingIsPaid) continue;
    if (f.isActive && !existing.isActive) { byPeriod[p] = f; continue; }
    if (!f.isActive && existing.isActive) continue;
    if (new Date(f.updatedAt) > new Date(existing.updatedAt)) byPeriod[p] = f;
  }

  return Object.values(byPeriod);
};

/* =====================================================
   CALCULATE STUDENT PAYABLE SUMMARY
   Used by FeeCollectionController to validate payment amount.
   Includes late fee due in remainingPayable.
===================================================== */
const calculateStudentPayableSummary = async ({
  db,
  sessionId,
  studentId,
  classId,
  streamId: rawStreamId,
  tillMonth = false,
}) => {
  // Normalize streamId — reject invalid/object values
  const streamId = rawStreamId && mongoose.Types.ObjectId.isValid(rawStreamId) ? rawStreamId : null;
  const FeeStructure = getFeeStructureModel(db);
  const FeeInstallment = getFeeInstallmentModel(db);
  const AdditionalFee = getAdditionalFeeModel(db);
  const StudentPayment = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const TransportFee = getTransportFeeModel(db);
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const LateFee = getLateFeeModel(db);

  /* ── 1. Tuition ── */
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

  // const tuitionInstallments = await FeeInstallment.find({
  //   feeStructureId: { $in: feeStructureIds },
  // });
  // Current month end
  const currentDate = new Date();

  const monthEnd = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const installmentQuery = {
    feeStructureId: {
      $in: feeStructureIds,
    },
  };

  // Dashboard only
  if (tillMonth) {
    installmentQuery.dueDate = {
      $lte: monthEnd,
    };
  }

  const tuitionInstallments =
    await FeeInstallment.find(
      installmentQuery
    );
  let totalBaseFees = 0;
  tuitionInstallments.forEach(i => { totalBaseFees += Number(i.amount || 0); });

  // Full-session installments — needed for syncLateFees so it can zero out
  // late fee records for paid installments that are outside the tillMonth window
  const allSessionInstallments = tillMonth
    ? await FeeInstallment.find({ feeStructureId: { $in: feeStructureIds } })
    : tuitionInstallments;

  /* ── 2. Additional ── */
  // Build robust query — handle string vs ObjectId and null/missing classId
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

  const additionalFeeQuery = {
    sessionId,
    isActive: true,
    $or: additionalOrClauses,
  };

  // Dashboard only — same till-month filter as tuition
  if (tillMonth) {
    additionalFeeQuery.dueDate = { $lte: monthEnd };
  }

  const additionalFees = await AdditionalFee.find(additionalFeeQuery);

  // Fetch AdditionalFeeWaiver records for this student
  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(db);
  const additionalFeeIds = additionalFees.map(f => f._id);
  const additionalWaiverList = additionalFeeIds.length && studentId
    ? await AdditionalFeeWaiver.find({
        studentId,
        additionalFeeId: { $in: additionalFeeIds },
      }).lean()
    : [];

  // Build waiver map: additionalFeeId → waiverRecord
  const additionalWaiverMap = {};
  for (const w of additionalWaiverList) {
    additionalWaiverMap[w.additionalFeeId.toString()] = w;
  }

  let totalAdditionalFees = 0;
  let totalAdditionalWaived = 0;
  additionalFees.forEach(f => {
    const wr = additionalWaiverMap[f._id.toString()];
    const waivedAmt = wr ? Number(wr.waivedAmount || 0) : 0;
    const isFullWaived = wr ? wr.isWaived : false;
    totalAdditionalFees += Number(f.amount || 0);
    totalAdditionalWaived += isFullWaived ? Number(f.amount || 0) : waivedAmt;
  });

  /* ── 3. SUCCESS payment IDs ── */
  const successPaymentIds = await StudentPayment.find({
    studentId,
    sessionId,
    paymentStatus: "SUCCESS",
  }).distinct("_id");

  /* ── 4. Transport ── */
  const transportQuery = { studentId, sessionId, isActive: true };

  // Dashboard only — limit transport to dues up to current month
  if (tillMonth) {
    transportQuery.dueDate = { $lte: monthEnd };
  }

  const activeTransportRaw = studentId
    ? await TransportFee.find(transportQuery).sort({ updatedAt: -1 })
    : [];

  const activeTransportFees = await deduplicateTransportByPeriod(
    activeTransportRaw, successPaymentIds, db
  );

  // Fetch TransportFeeWaiver records for these transport fees
  const TransportFeeWaiver  = getTransportFeeWaiverModel(db);
  const transportFeeIds     = activeTransportFees.map(f => f._id);
  const transportWaiverList = transportFeeIds.length
    ? await TransportFeeWaiver.find({
        studentId,
        transportFeeId: { $in: transportFeeIds },
      }).lean()
    : [];

  // Build waiver map: transportFeeId → waiverRecord
  const transportWaiverMap = {};
  for (const w of transportWaiverList) {
    transportWaiverMap[w.transportFeeId.toString()] = w;
  }

  // Total transport fees after waiver deduction
  let totalTransportFees  = 0;
  let totalTransportWaived = 0;
  activeTransportFees.forEach(f => {
    const wr           = transportWaiverMap[f._id.toString()];
    const waivedAmt    = wr ? Number(wr.waivedAmount || 0) : 0;
    const isFullWaived = wr ? wr.isWaived : false;
    totalTransportFees  += Number(f.amount || 0);
    totalTransportWaived += isFullWaived ? Number(f.amount || 0) : waivedAmt;
  });

  const totalSessionFees = totalBaseFees + totalAdditionalFees + totalTransportFees;

  /* ── 5. Concession — applies ONLY to Tuition Fee ── */
  const enrolment = studentId
    ? await StudentEnrolment.findById(studentId).lean()
    : null;

  let concessionAmount = 0;
  if (enrolment) {
    if (enrolment.fullFeeConcession || enrolment.fullFeeExceptTransport) {
      concessionAmount = totalBaseFees;
    } else if (enrolment.discount) {
      const discountVal = parseFloat(enrolment.discount) || 0;
      if (enrolment.discountType === "%") {
        concessionAmount = parseFloat(((totalBaseFees * discountVal) / 100).toFixed(2));
      } else {
        concessionAmount = Math.min(discountVal, totalBaseFees);
      }
    }
  }

  // netPayable = Gross - Concession(tuition) - AdditionalWaived - TransportWaived
  const netPayable = Math.max(
    parseFloat((totalBaseFees - concessionAmount + totalAdditionalFees - totalAdditionalWaived + totalTransportFees - totalTransportWaived).toFixed(2)),
    0
  );

  /* ── 6. Allocations for regular fees ONLY (tuition + additional + transport) ── */
  // regularRefIds: only tillMonth-filtered fees (for allocationMap used by syncLateFees)
  const regularRefIds = [
    ...tuitionInstallments.map(i => i._id),
    ...additionalFees.map(f => f._id),
    ...activeTransportFees.map(f => f._id),
  ];

  // totalAllocated: ALL regular fee allocations for this student (entire session)
  // This ensures advance payments (e.g. July fee paid in June) are counted,
  // so students who are fully paid don't appear as defaulters.
  const allRegularAllocations = await StudentPaymentAllocation.find({
    paymentId: { $in: successPaymentIds },
    feeType: { $in: ["TUITION", "ADDITIONAL", "TRANSPORT"] },
  });

  // Build per-referenceId allocation map — ALL session allocations
  // syncLateFees needs full-session alloc map to correctly zero out late fees
  // for installments paid outside the tillMonth window
  const regularAllocMap = {};
  allRegularAllocations.forEach(a => {
    const rid = a.referenceId.toString();
    regularAllocMap[rid] = (regularAllocMap[rid] || 0) + Number(a.allocatedAmount || 0);
  });

  // totalAllocated = ALL session allocations (not just tillMonth)
  let totalAllocated = 0;
  allRegularAllocations.forEach(a => { totalAllocated += Number(a.allocatedAmount || 0); });
  /* ── 7. Sync late fees to DB (so fresh records exist before reading) ── */
  if (studentId && classId) {
    await syncLateFees({
      db,
      sessionId,
      studentId,
      classId,
      // Use full-session installments so late fees for paid future-month
      // installments are correctly zeroed out (not just tillMonth ones)
      installments: allSessionInstallments.map(i => i.toObject ? i.toObject() : i),
      allocationMap: regularAllocMap,
    });
  }

  /* ── 8. Late fee due (not waived, not fully paid, not zeroed-out) ── */
  const lateFees = studentId
    ? await LateFee.find({ sessionId, studentId, isWaived: false, amount: { $gt: 0 } }).lean()
    : [];

  let totalLateFeeDue = 0;
  let totalLatePaid = 0;

  if (lateFees.length) {
    const lateFeeIds = lateFees.map(lf => lf._id);
    const lfAllocations = successPaymentIds.length
      ? await StudentPaymentAllocation.find({
        paymentId: { $in: successPaymentIds },
        feeType: "LATE_FEE",
        referenceId: { $in: lateFeeIds },
      }).lean()
      : [];

    const lfPaidMap = {};
    for (const a of lfAllocations) {
      const rid = a.referenceId.toString();
      lfPaidMap[rid] = (lfPaidMap[rid] || 0) + Number(a.allocatedAmount || 0);
    }

    for (const lf of lateFees) {
      const paid = lfPaidMap[lf._id.toString()] || 0;
      totalLatePaid += paid;
      totalLateFeeDue += Math.max(0, Number(lf.amount) - paid);
    }
  }

  const totalPaidAll = totalAllocated + totalLatePaid;

  // ── remainingPayable ──
  // netPayable = totalSessionFees - concessionAmount  (what student owes for regular fees)
  // totalAllocated = how much of regular fees already paid
  // remainingRegular = max(0, netPayable - totalAllocated)
  const remainingRegular = Math.max(0, parseFloat((netPayable - totalAllocated).toFixed(2)));
  const remainingPayable = parseFloat((remainingRegular + totalLateFeeDue).toFixed(2));

  return {
    totalBaseFees,
    totalAdditionalFees,
    totalAdditionalWaived: parseFloat(totalAdditionalWaived.toFixed(2)),
    totalTransportFees,
    totalTransportWaived: parseFloat(totalTransportWaived.toFixed(2)),
    totalSessionFees,
    concessionAmount,
    netPayable,
    totalPaid: totalPaidAll,
    totalLateFeeDue: parseFloat(totalLateFeeDue.toFixed(2)),
    remainingPayable,
  };
};

/* =====================================================
   CALCULATE STUDENT CONCESSION
   Concession applies ONLY to Tuition Fee (totalBaseFees).
   Additional fees → AdditionalFeeWaiver
   Transport fees  → TransportFeeWaiver

   Input:
     student        — enrolment doc
     totalFee       — tuition ONLY
     transportTotal — ignored (kept for signature compatibility)

   Returns: concessionAmount (number)
===================================================== */
const calculateConcession = ({ student, totalFee, transportTotal = 0 }) => {
  if (!student || totalFee <= 0) return 0;

  // Both fullFeeConcession and fullFeeExceptTransport → full tuition waived
  if (student.fullFeeConcession || student.fullFeeExceptTransport) {
    return totalFee;
  }

  if (student.discount) {
    const discountVal = parseFloat(student.discount) || 0;
    if (discountVal <= 0) return 0;

    if (student.discountType === "%") {
      return parseFloat(((totalFee * discountVal) / 100).toFixed(2));
    } else {
      return Math.min(discountVal, totalFee);
    }
  }

  return 0;
};

/* =====================================================
   BUILD STUDENT PERIOD MAP
   Returns: periodMap { [period]: { totalFee, paidAmount } }
   — tuition + additional + transport per period.
   Late fees NOT included (handled separately).
===================================================== */
const buildStudentPeriodMap = ({
  myInsts,
  myAdditional,
  transportByPeriod,
  allocMap,
}) => {
  const periodMap = {};

  for (const inst of myInsts) {
    const per = inst.period;
    if (!periodMap[per]) periodMap[per] = { totalFee: 0, paidAmount: 0 };
    periodMap[per].totalFee += Number(inst.amount || 0);
    periodMap[per].paidAmount += allocMap[inst._id.toString()] || 0;
  }

  for (const f of myAdditional) {
    const per = f.period;
    if (!per) continue;
    if (!periodMap[per]) periodMap[per] = { totalFee: 0, paidAmount: 0 };
    periodMap[per].totalFee += Number(f.amount || 0);
    periodMap[per].paidAmount += allocMap[f._id.toString()] || 0;
  }

  for (const [per, t] of Object.entries(transportByPeriod)) {
    if (!periodMap[per]) periodMap[per] = { totalFee: 0, paidAmount: 0 };
    periodMap[per].totalFee += Number(t.amount || 0);
    periodMap[per].paidAmount += allocMap[t._id.toString()] || 0;
  }

  return periodMap;
};

/* =====================================================
   BUILD SEQUENTIAL CONCESSION MAP
   Matches StudentLedgerController logic exactly:
   Concession fills periods one by one from April onwards
   (sequential, NOT proportional).
   Input:
     periodMap   — { [period]: { totalFee, paidAmount } }
     concession  — total concession amount
     feeBase     — total tuition+additional+transport (full session)
   Returns:
     { [period]: concessionAmount }  — how much concession applies per period
===================================================== */
const REPORT_PERIOD_ORDER = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
  "APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR",
];

const buildSequentialConcessionMap = ({ periodMap, concession }) => {
  if (!concession || concession <= 0) return {};

  const sortedPeriods = Object.keys(periodMap).sort((a, b) => {
    const ai = REPORT_PERIOD_ORDER.indexOf(a);
    const bi = REPORT_PERIOD_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const concessionMap = {};
  let remaining = concession;

  for (const per of sortedPeriods) {
    if (remaining <= 0) break;
    const periodFee = periodMap[per]?.totalFee || 0;
    if (periodFee <= 0) continue;

    // Apply up to periodFee from remaining concession
    const applyHere = parseFloat(Math.min(remaining, periodFee).toFixed(2));
    if (applyHere <= 0) continue;

    concessionMap[per] = applyHere;
    remaining = parseFloat((remaining - applyHere).toFixed(2));
  }

  return concessionMap;
};

export { calculateStudentPayableSummary, calculateConcession, buildStudentPeriodMap, buildSequentialConcessionMap };
