/**
 * studentLedgerService.js
 *
 * Single source of truth for student fee ledger data.
 * Used by:
 *   - StudentLedgerController  (frontend API)
 *   - aiStudentQueries         (AI chat)
 *
 * Returns the EXACT same data shape that the Fee Ledger screen shows.
 *
 * @param {Object} db          - tenant mongoose connection
 * @param {string} sessionId   - session ObjectId string
 * @param {string} studentId   - student enrolment ObjectId string
 * @param {string} classId     - class ObjectId string
 * @param {string} [streamId]  - stream ObjectId string (optional)
 * @returns {Object}  { studentInfo, summary, ledger }  or throws on error
 */

import { getFeeInstallmentModel }          from "../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel }           from "../models/tenant/master/AdditionalFee.model.js";
import { getAdditionalFeeWaiverModel }     from "../models/tenant/master/AdditionalFeeWaiver.model.js";
import { getTransportFeeModel }            from "../models/tenant/master/TransportFee.model.js";
import { getTransportFeeWaiverModel }      from "../models/tenant/master/TransportFeeWaiver.model.js";
import { getStudentPaymentAllocationModel} from "../models/tenant/master/StudentPaymentAllocation.model.js";
import { getFeeStructureModel }            from "../models/tenant/master/FeeStructure.model.js";
import { getStudentPaymentModel }          from "../models/tenant/master/StudentPayment.model.js";
import { getStudentEnrolmentModel }        from "../models/tenant/student/StudentEnrolment.model.js";
import { getLateFeeModel }                 from "../models/tenant/master/LateFee.model.js";
import { syncLateFees }                    from "./lateFeeHelper.js";
import mongoose                            from "mongoose";

/* ── Constants ─────────────────────────────────────────────────── */
const PERIOD_ORDER = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
  "APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR",
];

const QUARTERLY_MONTHS = {
  "APR-JUN": ["APRIL","MAY","JUNE"],
  "JUL-SEP": ["JULY","AUGUST","SEPTEMBER"],
  "OCT-DEC": ["OCTOBER","NOVEMBER","DECEMBER"],
  "JAN-MAR": ["JANUARY","FEBRUARY","MARCH"],
};

/* ── Helpers ────────────────────────────────────────────────────── */
const toObjectId = (id) => {
  if (!id) return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
};

const isPeriodDue = (period) => {
  const months = [
    "JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
    "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER",
  ];
  const currentMonth = months[new Date().getMonth()];
  const MONTHLY_ORDER = PERIOD_ORDER.slice(0, 12);
  const currentIdx   = MONTHLY_ORDER.indexOf(currentMonth);
  if (currentIdx === -1) return true;
  if (QUARTERLY_MONTHS[period]) {
    return QUARTERLY_MONTHS[period].some(m => MONTHLY_ORDER.indexOf(m) <= currentIdx);
  }
  const periodIdx = MONTHLY_ORDER.indexOf(period);
  return periodIdx === -1 ? true : periodIdx <= currentIdx;
};

const deriveGroupStatus = (group) => {
  const regularItems     = group.items.filter(it => it.type !== "CONCESSION");
  const hasConcession    = group.items.some(it => it.type === "CONCESSION");
  const allWaived        = regularItems.length > 0 && regularItems.every(it => it.isWaived);
  const hasPartialWaiver = regularItems.some(it => it.isPartialWaiver || it.status === "PARTIAL_WAIVED");
  const hasConcItem      = regularItems.some(it => it.status === "CONCESSION" || it.status === "PARTIAL_CONCESSION");
  const totalDue         = Number(group.totalDue  || 0);
  const totalPaid        = Number(group.totalPaid || 0);

  if (allWaived)                                          return "WAIVED";
  if (totalDue === 0 && hasConcession && totalPaid === 0) return "CONCESSION";
  if (totalDue === 0)                                     return "PAID";
  if (hasPartialWaiver || hasConcItem)                    return "PARTIAL_WAIVED";
  if (totalPaid > 0)                                      return "PARTIAL";
  return "DUE";
};

/* ════════════════════════════════════════════════════════════════
   MAIN EXPORT
════════════════════════════════════════════════════════════════ */
export async function getStudentLedgerData({ db, sessionId, studentId, classId, streamId: rawStreamId }) {

  // Normalize streamId — reject "[object Object]" or invalid values
  const streamId = mongoose.Types.ObjectId.isValid(rawStreamId) ? rawStreamId : null;

  const FeeInstallment           = getFeeInstallmentModel(db);
  const AdditionalFee            = getAdditionalFeeModel(db);
  const AdditionalFeeWaiver      = getAdditionalFeeWaiverModel(db);
  const TransportFee             = getTransportFeeModel(db);
  const TransportFeeWaiver       = getTransportFeeWaiverModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const FeeStructure             = getFeeStructureModel(db);
  const StudentPayment           = getStudentPaymentModel(db);
  const StudentEnrolment         = getStudentEnrolmentModel(db);
  const LateFee                  = getLateFeeModel(db);

  /* ── 1. Student ─────────────────────────────────────────────── */
  const student = await StudentEnrolment.findById(studentId)
    .populate("currentClass")
    .populate("currentSection")
    .populate("stream")
    .populate("studentRegistrationId");

  if (!student) return null;

  const studentInfo = {
    studentId:  student.studentId,
    name:       `${student.firstName} ${student.lastName || ""}`.trim(),
    fatherName: student.fatherName,
    // phone is required on enrollment — use it directly as parent contact
    phone:      student.phone || student.guardianPhone || "",
    class:      student.currentClass?.name   || "",
    section:    student.currentSection?.name || "",
    stream:     student.stream?.name         || "",
    formNo:     student.formNo || student.registrationNo || student.studentRegistrationId?.formNo || "",
  };

  /* ── 2. Fee Structures & Installments ───────────────────────── */
  const feeStructureQuery = streamId
    ? { sessionId, classId, streamId, isActive: true }
    : { sessionId, classId, isActive: true, $or: [{ streamId: null }, { streamId: { $exists: false } }] };

  const feeStructures    = await FeeStructure.find(feeStructureQuery);
  const feeStructureIds  = feeStructures.map(fs => fs._id);
  const installments     = await FeeInstallment.find({ feeStructureId: { $in: feeStructureIds } }).sort({ installmentNo: 1 });

  /* ── 3. Additional Fees ─────────────────────────────────────── */
  const classObjId  = toObjectId(classId);
  const streamObjId = toObjectId(streamId);

  const additionalOrClauses = [
    { classId: null },
    { classId: { $exists: false } },
  ];
  if (classObjId) {
    additionalOrClauses.push({ classId: classObjId, streamId: null });
    additionalOrClauses.push({ classId: classObjId, streamId: { $exists: false } });
    if (streamObjId) additionalOrClauses.push({ classId: classObjId, streamId: streamObjId });
  }

  const additionalFees = await AdditionalFee.find({ sessionId, isActive: true, $or: additionalOrClauses });

  /* ── 4. Additional Fee Waivers ──────────────────────────────── */
  const additionalFeeIds       = additionalFees.map(f => f._id);
  const additionalFeeWaiverRecs = additionalFeeIds.length
    ? await AdditionalFeeWaiver.find({ studentId, additionalFeeId: { $in: additionalFeeIds } }).lean()
    : [];

  const additionalFeeWaiverMap = {};
  for (const w of additionalFeeWaiverRecs) {
    additionalFeeWaiverMap[w.additionalFeeId.toString()] = w;
  }

  /* ── 5. Payments & Allocations ──────────────────────────────── */
  const successPayments = await StudentPayment.find({ studentId, sessionId, paymentStatus: "SUCCESS" }).lean();
  const paymentIds      = successPayments.map(p => p._id);

  const receiptNoMap = {};
  for (const p of successPayments) receiptNoMap[p._id.toString()] = p.receiptNo || null;

  const allocations = await StudentPaymentAllocation.find({ paymentId: { $in: paymentIds } });

  const allocationMap   = {};
  const receiptNosByRef = {};
  allocations.forEach(a => {
    const key = a.referenceId.toString();
    allocationMap[key] = (allocationMap[key] || 0) + Number(a.allocatedAmount || 0);
    const rno = receiptNoMap[a.paymentId.toString()];
    if (rno) {
      if (!receiptNosByRef[key]) receiptNosByRef[key] = new Set();
      receiptNosByRef[key].add(rno);
    }
  });

  /* ── 6. Sync + Fetch Late Fees ──────────────────────────────── */
  await syncLateFees({
    db, sessionId, studentId, classId,
    installments: installments.map(i => i.toObject ? i.toObject() : i),
    allocationMap,
  });

  const lateFeeRecords = await LateFee.find({
    sessionId, studentId,
    $or: [{ isWaived: true }, { amount: { $gt: 0 } }],
  }).lean();

  const lateFeeByInstallment = {};
  for (const lf of lateFeeRecords) lateFeeByInstallment[lf.referenceId.toString()] = lf;

  const lateFeePaidMap = {};
  for (const a of allocations) {
    if (a.feeType === "LATE_FEE") {
      const rid = a.referenceId.toString();
      lateFeePaidMap[rid] = (lateFeePaidMap[rid] || 0) + Number(a.allocatedAmount || 0);
    }
  }

  /* ── 7. Build Ledger Items ──────────────────────────────────── */
  const ledgerItems = [];

  // Tuition + Late Fee
  installments.forEach(inst => {
    const paid      = allocationMap[inst._id.toString()] || 0;
    const dueAmount = Math.max(0, Number(inst.amount) - paid);

    ledgerItems.push({
      type: "TUITION", referenceId: inst._id,
      feeHead: "Tuition Fee", period: inst.period, dueDate: inst.dueDate,
      totalAmount: Number(inst.amount), paidAmount: Number(paid), dueAmount, isWaived: false,
    });

    const lf = lateFeeByInstallment[inst._id.toString()];
    if (lf) {
      const lfPaid        = lateFeePaidMap[lf._id.toString()] || 0;
      const lfWaived      = Number(lf.waivedAmount || 0);
      const lfTotal       = Number(lf.amount);
      const isFullyWaived = lf.isWaived || lfWaived >= lfTotal;
      const isPartial     = !isFullyWaived && lfWaived > 0;
      const lfDue         = isFullyWaived ? 0 : Math.max(0, lfTotal - lfPaid - lfWaived);

      ledgerItems.push({
        type: "LATE_FEE", referenceId: lf._id, instRefId: inst._id,
        feeHead: isFullyWaived ? "Late Fee (Waived)" : isPartial ? `Late Fee (₹${lfWaived} waived)` : "Late Fee",
        period: inst.period, dueDate: inst.dueDate,
        totalAmount: lfTotal, paidAmount: Number(lfPaid), waivedAmount: lfWaived,
        dueAmount: lfDue, isWaived: isFullyWaived, isPartialWaiver: isPartial,
        waiverReason: lf.waiverReason || null,
      });
    }
  });

  // Additional Fees
  additionalFees.forEach(fee => {
    const paid            = allocationMap[fee._id.toString()] || 0;
    const waiverRecord    = additionalFeeWaiverMap[fee._id.toString()];
    const waivedAmount    = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
    const isFullyWaived   = waiverRecord ? waiverRecord.isWaived : false;
    const isPartialWaiver = !isFullyWaived && waivedAmount > 0;
    const dueAmount       = isFullyWaived ? 0 : Math.max(0, Number(fee.amount) - paid - waivedAmount);

    ledgerItems.push({
      type: "ADDITIONAL", referenceId: fee._id,
      feeHead: isFullyWaived ? `${fee.feeName} (Waived)` : isPartialWaiver ? `${fee.feeName} (₹${waivedAmount} waived)` : fee.feeName,
      period: fee.period, dueDate: fee.dueDate,
      totalAmount: Number(fee.amount), paidAmount: Number(paid), waivedAmount,
      dueAmount, isWaived: isFullyWaived, isPartialWaiver,
      waiverReason: waiverRecord?.waiverReason || null,
    });
  });

  // Transport Fees (deduplicated by period)
  const transportFeesRaw = await TransportFee.find({ studentId, sessionId, isActive: true })
    .populate("routeId", "routeName")
    .populate("stopId", "stopName")
    .sort({ updatedAt: -1 });

  const transportByPeriodMap = {};
  for (const f of transportFeesRaw) {
    const p = f.period;
    if (!transportByPeriodMap[p]) { transportByPeriodMap[p] = f; continue; }
    const existing = transportByPeriodMap[p];
    const fPaid    = (allocationMap[f._id.toString()] || 0) > 0;
    const ePaid    = (allocationMap[existing._id.toString()] || 0) > 0;
    if (fPaid && !ePaid) { transportByPeriodMap[p] = f; continue; }
    if (!fPaid && ePaid) continue;
    if (f.isActive && !existing.isActive) { transportByPeriodMap[p] = f; continue; }
    if (!f.isActive && existing.isActive) continue;
    if (new Date(f.updatedAt) > new Date(existing.updatedAt)) transportByPeriodMap[p] = f;
  }

  const dedupedTransport    = Object.values(transportByPeriodMap);
  const transportFeeIds     = dedupedTransport.map(f => f._id);
  const transportWaiverRecs = transportFeeIds.length
    ? await TransportFeeWaiver.find({ studentId, transportFeeId: { $in: transportFeeIds } }).lean()
    : [];

  const transportWaiverMap = {};
  for (const w of transportWaiverRecs) transportWaiverMap[w.transportFeeId.toString()] = w;

  for (const f of dedupedTransport) {
    const paid            = allocationMap[f._id.toString()] || 0;
    const waiverRecord    = transportWaiverMap[f._id.toString()];
    const waivedAmount    = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
    const isFullyWaived   = waiverRecord ? waiverRecord.isWaived : false;
    const isPartialWaiver = !isFullyWaived && waivedAmount > 0;
    const dueAmount       = isFullyWaived ? 0 : Math.max(0, Number(f.amount) - paid - waivedAmount);

    const typeLabel = {
      HOME_TO_SCHOOL: "Home → School",
      SCHOOL_TO_HOME: "School → Home",
      BOTH:           "Both Ways",
    }[f.transportType] || f.transportType || "Transport";

    const baseHead = `Transport (${typeLabel}) - ${f.stopId?.stopName || f.routeId?.routeName || ""}`.trim().replace(/ - $/, "");

    ledgerItems.push({
      type: "TRANSPORT", referenceId: f._id,
      feeHead: isFullyWaived ? `${baseHead} (Waived)` : isPartialWaiver ? `${baseHead} (₹${waivedAmount} waived)` : baseHead,
      transportType: f.transportType, period: f.period, dueDate: f.dueDate,
      totalAmount: Number(f.amount), paidAmount: Number(paid), waivedAmount,
      dueAmount, isWaived: isFullyWaived, isPartialWaiver,
      waiverReason: waiverRecord?.waiverReason || null,
    });
  }

  /* ── 8. Concession Calculation (tuition only) ───────────────── */
  const tuitionTotal = ledgerItems
    .filter(i => i.type === "TUITION")
    .reduce((s, i) => s + i.totalAmount, 0);

  let concessionAmount = 0;
  if (student.fullFeeConcession || student.fullFeeExceptTransport) {
    concessionAmount = tuitionTotal;
  } else if (student.discount) {
    const discountVal = parseFloat(student.discount) || 0;
    if (student.discountType === "%") {
      concessionAmount = parseFloat(((tuitionTotal * discountVal) / 100).toFixed(2));
    } else {
      concessionAmount = Math.min(discountVal, tuitionTotal);
    }
  }

  /* ── 9. Group by Period ─────────────────────────────────────── */
  const groupedMap = {};
  ledgerItems.forEach(item => {
    const key = item.period;
    if (!groupedMap[key]) {
      groupedMap[key] = { period: key, items: [], totalAmount: 0, totalPaid: 0, totalDue: 0, receiptNos: new Set() };
    }
    if (item.referenceId) {
      const rnoSet = receiptNosByRef[item.referenceId.toString()];
      if (rnoSet) rnoSet.forEach(r => groupedMap[key].receiptNos.add(r));
    }

    let status;
    if      (item.isWaived)                                    status = "WAIVED";
    else if (item.isPartialWaiver && Number(item.dueAmount) === 0) status = "WAIVED";
    else if (item.isPartialWaiver)                             status = "PARTIAL_WAIVED";
    else if (item.paidAmount === 0)                            status = "DUE";
    else if (item.paidAmount < item.totalAmount)               status = "PARTIAL";
    else                                                       status = "PAID";

    groupedMap[key].items.push({
      ...item,
      totalAmount: Number(item.totalAmount).toFixed(2),
      paidAmount:  Number(item.paidAmount).toFixed(2),
      dueAmount:   Number(item.dueAmount).toFixed(2),
      status,
    });

    if (item.type !== "LATE_FEE" || !item.isWaived) {
      groupedMap[key].totalAmount += item.totalAmount;
      groupedMap[key].totalPaid   += item.paidAmount;
      groupedMap[key].totalDue    += item.dueAmount;
    }
  });

  /* ── 10. Apply Concession — sequential April-first ──────────── */
  if (concessionAmount > 0) {
    const sortedPeriods = Object.keys(groupedMap).sort((a, b) =>
      (PERIOD_ORDER.indexOf(a) === -1 ? 999 : PERIOD_ORDER.indexOf(a)) -
      (PERIOD_ORDER.indexOf(b) === -1 ? 999 : PERIOD_ORDER.indexOf(b))
    );

    let remaining = concessionAmount;
    for (const per of sortedPeriods) {
      if (remaining <= 0) break;
      const group = groupedMap[per];
      const tuitionInPeriod = group.items
        .filter(i => i.type === "TUITION")
        .reduce((s, i) => s + Number(i.totalAmount), 0);
      if (tuitionInPeriod <= 0) continue;

      const applyHere = parseFloat(Math.min(remaining, tuitionInPeriod).toFixed(2));
      if (applyHere <= 0) continue;

      let concessionLeft = applyHere;
      for (const item of group.items) {
        if (item.type !== "TUITION" || concessionLeft <= 0) continue;
        const itemDue   = Number(item.dueAmount);
        if (itemDue <= 0) continue;
        const coverThis = parseFloat(Math.min(concessionLeft, itemDue).toFixed(2));
        const newDue    = parseFloat((itemDue - coverThis).toFixed(2));
        item.dueAmount  = newDue.toFixed(2);
        item.status     = newDue === 0 && Number(item.paidAmount) === 0 ? "CONCESSION" : "PARTIAL_CONCESSION";
        concessionLeft  = parseFloat((concessionLeft - coverThis).toFixed(2));
      }

      group.items.push({
        type: "CONCESSION", referenceId: null, feeHead: "Concession",
        period: per, dueDate: null,
        totalAmount: "0.00", paidAmount: "0.00",
        dueAmount: (-applyHere).toFixed(2), status: "ADJUSTMENT",
      });

      group.totalDue = Math.max(0, parseFloat((group.totalDue - applyHere).toFixed(2)));
      remaining      = parseFloat((remaining - applyHere).toFixed(2));
    }
  }

  /* ── 11. Grand Totals ───────────────────────────────────────── */
  const additionalTotal      = ledgerItems.filter(i => i.type === "ADDITIONAL").reduce((s, i) => s + i.totalAmount, 0);
  const transportTotal       = ledgerItems.filter(i => i.type === "TRANSPORT").reduce((s, i) => s + i.totalAmount, 0);
  const lateFeeTotal         = ledgerItems.filter(i => i.type === "LATE_FEE" && !i.isWaived).reduce((s, i) => s + i.totalAmount, 0);

  const additionalWaivedTotal = ledgerItems.filter(i => i.type === "ADDITIONAL")
    .reduce((s, i) => s + (i.isWaived ? Number(i.totalAmount) : Number(i.waivedAmount || 0)), 0);
  const transportWaivedTotal  = ledgerItems.filter(i => i.type === "TRANSPORT")
    .reduce((s, i) => s + (i.isWaived ? Number(i.totalAmount) : Number(i.waivedAmount || 0)), 0);
  const lateFeeWaivedTotal    = ledgerItems.filter(i => i.type === "LATE_FEE")
    .reduce((s, i) => s + (i.isWaived ? i.totalAmount : Number(i.waivedAmount || 0)), 0);

  const totalWaived    = parseFloat((additionalWaivedTotal + transportWaivedTotal + lateFeeWaivedTotal).toFixed(2));
  const grossTotal     = tuitionTotal + additionalTotal + transportTotal + lateFeeTotal;
  const netPayable     = Math.max(parseFloat((grossTotal - concessionAmount - totalWaived).toFixed(2)), 0);

  const lateFeesPaid   = ledgerItems.filter(i => i.type === "LATE_FEE" && !i.isWaived).reduce((s, i) => s + i.paidAmount, 0);
  const regularPaid    = ledgerItems.filter(i => i.type !== "LATE_FEE" && i.type !== "CONCESSION" && !i.isWaived).reduce((s, i) => s + i.paidAmount, 0);
  const totalPaid      = Math.min(parseFloat((regularPaid + lateFeesPaid).toFixed(2)), netPayable);

  const netDue     = parseFloat(Object.values(groupedMap).reduce((s, g) => s + g.totalDue, 0).toFixed(2));
  const currentDue = parseFloat(Object.values(groupedMap).filter(g => isPeriodDue(g.period)).reduce((s, g) => s + g.totalDue, 0).toFixed(2));

  const summary = {
    grossTotal:  grossTotal.toFixed(2),
    concession:  concessionAmount.toFixed(2),
    waived:      totalWaived.toFixed(2),
    netPayable:  netPayable.toFixed(2),
    totalPaid:   totalPaid.toFixed(2),
    totalDue:    netDue.toFixed(2),
    currentDue:  currentDue.toFixed(2),
    lateFee:     lateFeeTotal.toFixed(2),
    lateFeePaid: lateFeesPaid.toFixed(2),
    lateFeeDue:  Math.max(parseFloat((lateFeeTotal - lateFeeWaivedTotal - lateFeesPaid).toFixed(2)), 0).toFixed(2),
    totalFee:    grossTotal.toFixed(2),   // legacy compat
  };

  /* ── 12. Sort + finalise grouped ledger ─────────────────────── */
  const ledger = Object.values(groupedMap)
    .sort((a, b) =>
      (PERIOD_ORDER.indexOf(a.period) === -1 ? 999 : PERIOD_ORDER.indexOf(a.period)) -
      (PERIOD_ORDER.indexOf(b.period) === -1 ? 999 : PERIOD_ORDER.indexOf(b.period))
    )
    .map(group => ({
      ...group,
      receiptNos:  [...group.receiptNos],
      totalAmount: Number(group.totalAmount).toFixed(2),
      totalPaid:   Number(group.totalPaid).toFixed(2),
      totalDue:    Number(group.totalDue).toFixed(2),
      status:      deriveGroupStatus(group),
    }));

  return { studentInfo, summary, ledger };
}
