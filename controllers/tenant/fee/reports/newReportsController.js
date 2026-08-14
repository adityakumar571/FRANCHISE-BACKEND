import mongoose from "mongoose";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getStudentRegistrationModel } from "../../../../models/tenant/student/StudentRegistration.model.js";
import { getStudentPaymentModel } from "../../../../models/tenant/master/StudentPayment.model.js";
import { getFeeStructureModel } from "../../../../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel } from "../../../../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel } from "../../../../models/tenant/master/AdditionalFee.model.js";
import { getTransportFeeModel } from "../../../../models/tenant/master/TransportFee.model.js";
import { getStudentPaymentAllocationModel } from "../../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { getLateFeeModel } from "../../../../models/tenant/master/LateFee.model.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import { apiResponse } from "../../../../utils/apiResponse.js";
import {
  calculateConcession,
  buildStudentPeriodMap,
  buildSequentialConcessionMap,
} from "../../../../utils/feeHelper.js";

/* ── helpers ── */
const toId = (v) => new mongoose.Types.ObjectId(v);
const isId = (v) => v && mongoose.Types.ObjectId.isValid(v);

const paginate = (page, limit) => {
  const p = Number(page) || 1;
  const l = Number(limit) || 10;
  return { currentPage: p, perPage: l, skip: (p - 1) * l };
};

// Academic year: April → March
const ACADEMIC_PERIOD_ORDER = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
  "APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR",
];

// Returns the current month name in PERIOD_ORDER format (e.g. "MAY")
const getCurrentMonthPeriod = () => {
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  return months[new Date().getMonth()];
};

// Quarterly period → which months it covers (academic year Apr-Mar)
const QUARTERLY_MONTHS = {
  "APR-JUN": ["APRIL", "MAY", "JUNE"],
  "JUL-SEP": ["JULY", "AUGUST", "SEPTEMBER"],
  "OCT-DEC": ["OCTOBER", "NOVEMBER", "DECEMBER"],
  "JAN-MAR": ["JANUARY", "FEBRUARY", "MARCH"],
};

// Returns true if `period` is on or before the current month (i.e. already due)
const isPeriodDue = (period) => {
  const currentMonth = getCurrentMonthPeriod();
  const MONTHLY_ORDER = ACADEMIC_PERIOD_ORDER.slice(0, 12); // APRIL..MARCH only
  const currentIdx = MONTHLY_ORDER.indexOf(currentMonth);
  if (currentIdx === -1) return true; // unknown current month → treat as due

  // Quarterly period: due if ANY of its months is <= current month
  if (QUARTERLY_MONTHS[period]) {
    return QUARTERLY_MONTHS[period].some(
      (m) => MONTHLY_ORDER.indexOf(m) <= currentIdx,
    );
  }

  const periodIdx = MONTHLY_ORDER.indexOf(period);
  if (periodIdx === -1) return true; // unknown period → treat as due
  return periodIdx <= currentIdx;
};

/* ================================================================
   1. CLASS-SECTION WISE DEFAULTERS  (grouped summary)
   GET /reports/class-section-defaulters?sessionId&classId&page&limit
   Returns: per class-section row with count, defaultersAmt, transport,
            lateFine, grandTotal
================================================================ */
export const classSectionDefaulters = asyncHandler(async (req, res) => {
  const db = req.db;
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const FeeStructure = getFeeStructureModel(db);
  const FeeInstallment = getFeeInstallmentModel(db);
  const AdditionalFee = getAdditionalFeeModel(db);
  const TransportFee = getTransportFeeModel(db);
  const StudentPayment = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const LateFee = getLateFeeModel(db);

  const { sessionId, classId, sectionId, page = 1, limit = 10 } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  /* ── 1. All studying students for this session ── */
  const matchQuery = { session: toId(sessionId), status: "Studying" };
  if (isId(classId)) matchQuery.currentClass = toId(classId);
  if (isId(sectionId)) matchQuery.currentSection = toId(sectionId);

  const students = await StudentEnrolment.find(matchQuery)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .lean();

  if (!students.length) {
    return res.status(200).json(
      new apiResponse(
        200,
        {
          list: [],
          pagination: { totalRows: 0, totalPages: 0, currentPage, perPage },
        },
        "Class-section defaulters fetched",
      ),
    );
  }

  /* ── 2. Pre-fetch fee structures & installments for all classes ── */
  const classIds = [
    ...new Set(
      students.map((s) => s.currentClass?._id?.toString()).filter(Boolean),
    ),
  ];

  const feeStructures = await FeeStructure.find({
    sessionId: toId(sessionId),
    classId: { $in: classIds.map((id) => toId(id)) },
    isActive: true,
  }).lean();

  const feeStructureIds = feeStructures.map((fs) => fs._id);

  const allInstallments = feeStructureIds.length
    ? await FeeInstallment.find({
        feeStructureId: { $in: feeStructureIds },
      }).lean()
    : [];

  // Map: "classId__streamId" -> tuition total
  const classTuitionMap = {};
  for (const fs of feeStructures) {
    const key = `${fs.classId}__${fs.streamId || "null"}`;
    if (!classTuitionMap[key]) classTuitionMap[key] = 0;
    allInstallments
      .filter((i) => i.feeStructureId.toString() === fs._id.toString())
      .forEach((i) => {
        classTuitionMap[key] += Number(i.amount || 0);
      });
  }

  /* ── 3. Pre-fetch additional fees for session ── */
  const additionalFees = await AdditionalFee.find({
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  const getAdditionalTotal = (cid, streamId) => {
    let total = 0;
    const sId = streamId?.toString() || null;
    for (const f of additionalFees) {
      const fClass = f.classId?.toString() || null;
      const fStream = f.streamId?.toString() || null;
      if (
        (!fClass && !fStream) ||
        (fClass === cid && !fStream) ||
        (fClass === cid && fStream === sId)
      ) {
        total += Number(f.amount || 0);
      }
    }
    return total;
  };

  /* ── 4. Pre-fetch all payments & allocations in bulk ── */
  const studentIds = students.map((s) => s._id);

  const allPayments = await StudentPayment.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    paymentStatus: "SUCCESS",
  }).lean();

  // Map: studentId -> [paymentIds]
  const studentPaymentMap = {};
  for (const p of allPayments) {
    const sid = p.studentId.toString();
    if (!studentPaymentMap[sid]) studentPaymentMap[sid] = [];
    studentPaymentMap[sid].push(p._id);
  }

  // Fetch all transport fees for all students (including inactive, for correct dedup)
  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
  }).lean();

  // Map: studentId -> [transportFees]
  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const sid = t.studentId.toString();
    if (!studentTransportMap[sid]) studentTransportMap[sid] = [];
    studentTransportMap[sid].push(t);
  }

  // Fetch all allocations for all success payments
  const allPaymentIds = allPayments.map((p) => p._id);
  const allAllocations = allPaymentIds.length
    ? await StudentPaymentAllocation.find({
        paymentId: { $in: allPaymentIds },
      }).lean()
    : [];

  // Map: paymentId -> [allocations]
  const allocationByPayment = {};
  for (const a of allAllocations) {
    const pid = a.paymentId.toString();
    if (!allocationByPayment[pid]) allocationByPayment[pid] = [];
    allocationByPayment[pid].push(a);
  }

  // Build set of paid transport referenceIds (for dedup)
  const paidTransportRefIdsCS = new Set(
    allAllocations
      .filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0)
      .map(a => a.referenceId.toString())
  );

  // Fetch late fees for all students (active = not waived, amount > 0)
  const allLateFees = studentIds.length
    ? await LateFee.find({
        studentId: { $in: studentIds },
        sessionId: toId(sessionId),
        isWaived: false,
        amount: { $gt: 0 },
      }).lean()
    : [];

  // Fetch late fee paid allocations to get actual due (amount - paid)
  const lateFeeIds = allLateFees.map((lf) => lf._id);
  const lateFeeAllocations =
    lateFeeIds.length && allPaymentIds.length
      ? await StudentPaymentAllocation.find({
          paymentId: { $in: allPaymentIds },
          feeType: "LATE_FEE",
          referenceId: { $in: lateFeeIds },
        }).lean()
      : [];

  // Map: lateFeeId -> paidAmount
  const lateFeePaidMap = {};
  for (const a of lateFeeAllocations) {
    const rid = a.referenceId.toString();
    lateFeePaidMap[rid] =
      (lateFeePaidMap[rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // Map: studentId -> lateFine due total (amount - paid, not waived)
  const studentLateFineMap = {};
  for (const lf of allLateFees) {
    const sid = lf.studentId.toString();
    const paid = lateFeePaidMap[lf._id.toString()] || 0;
    const due = Math.max(0, Number(lf.amount || 0) - paid);
    studentLateFineMap[sid] = (studentLateFineMap[sid] || 0) + due;
  }

  /* ── 5. Build class-section summary ── */
  const summaryMap = {};

  for (const student of students) {
    const cid = student.currentClass?._id?.toString();
    const secId = student.currentSection?._id?.toString() || "none";
    const _rawStreamId = student.stream?._id?.toString() || student.stream?.toString() || null;
    const streamId = _rawStreamId && /^[a-f\d]{24}$/i.test(_rawStreamId) ? _rawStreamId : null;
    const stId = student._id.toString();

    if (!cid) continue;

    // Total fee for this student
    const tuitionKey = `${cid}__${streamId || "null"}`;
    const tuitionTotal = classTuitionMap[tuitionKey] || 0;
    const additionalTotal = getAdditionalTotal(cid, streamId);

    // Transport: deduplicate by period (paid > isActive > latest updatedAt — same as ledger)
    const transportFees = studentTransportMap[stId] || [];
    const transportByPeriod = {};
    for (const t of transportFees) {
      if (!transportByPeriod[t.period]) { transportByPeriod[t.period] = t; continue; }
      const existing = transportByPeriod[t.period];
      const tPaid = paidTransportRefIdsCS.has(t._id.toString());
      const ePaid = paidTransportRefIdsCS.has(existing._id.toString());
      if (tPaid && !ePaid) { transportByPeriod[t.period] = t; continue; }
      if (!tPaid && ePaid) continue;
      if (t.isActive && !existing.isActive) { transportByPeriod[t.period] = t; continue; }
      if (!t.isActive && existing.isActive) continue;
      if (new Date(t.updatedAt) > new Date(existing.updatedAt)) transportByPeriod[t.period] = t;
    }
    const transportTotal = Object.values(transportByPeriod).reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0,
    );

    const totalFee = tuitionTotal + additionalTotal + transportTotal;

    // ── Concession — applies ONLY to tuition (same as ledger) ──
    const concession = calculateConcession({
      student,
      totalFee: tuitionTotal,
      transportTotal,
    });
    const netPayable = Math.max(totalFee - concession, 0);

    // Total paid & transport paid for this student (regular fees ONLY — tuition/additional/transport)
    const paymentIds = studentPaymentMap[stId] || [];
    let totalPaid = 0;
    let transportPaid = 0;
    for (const pid of paymentIds) {
      const allocations = allocationByPayment[pid.toString()] || [];
      for (const a of allocations) {
        // Exclude LATE_FEE from regular paid — late fee is tracked separately
        if (a.feeType === "LATE_FEE") continue;
        totalPaid += Number(a.allocatedAmount || 0);
        if (a.feeType === "TRANSPORT") {
          transportPaid += Number(a.allocatedAmount || 0);
        }
      }
    }

    // Late fine balance for this student (not waived records)
    const lateFineBalance = studentLateFineMap[stId] || 0;

    const balance = Math.max(netPayable - totalPaid, 0) + lateFineBalance;
    if (balance <= 0) continue; // not a defaulter

    // Only count as defaulter if at least one period on or before current month has due amount
    // Build per-student alloc map for period-level check
    const allocMapCS = {};
    for (const pid of paymentIds) {
      for (const a of allocationByPayment[pid.toString()] || []) {
        const rid = a.referenceId.toString();
        allocMapCS[rid] = (allocMapCS[rid] || 0) + Number(a.allocatedAmount || 0);
      }
    }
    const myInstsCS = allInstallments.filter(inst => {
      const fs = feeStructures.find(f => f._id.toString() === inst.feeStructureId.toString());
      return fs && fs.classId.toString() === cid && (fs.streamId?.toString() || null) === streamId;
    });
    const myAdditionalCS = additionalFees.filter(f => {
      const fClass  = f.classId?.toString()  || null;
      const fStream = f.streamId?.toString() || null;
      return (!fClass && !fStream) ||
             (fClass === cid && !fStream) ||
             (fClass === cid && fStream === streamId);
    });
    const periodMapCS = buildStudentPeriodMap({
      myInsts: myInstsCS, myAdditional: myAdditionalCS,
      transportByPeriod, allocMap: allocMapCS,
    });
    // Build tuition-only periodMap for sequential concession (matches ledger exactly)
    const tuitionOnlyPeriodMapCS = {};
    for (const inst of myInstsCS) {
      const per = inst.period;
      if (!tuitionOnlyPeriodMapCS[per]) tuitionOnlyPeriodMapCS[per] = { totalFee: 0, paidAmount: 0 };
      tuitionOnlyPeriodMapCS[per].totalFee += Number(inst.amount || 0);
    }
    const periodConcessionCS = buildSequentialConcessionMap({
      periodMap: tuitionOnlyPeriodMapCS,
      concession,
    });

    // Compute current/past due only (same as feeDefaultersMonthwise)
    let currentDueBalance = 0;
    let currentTransportBalance = 0;

    for (const [per, vals] of Object.entries(periodMapCS)) {
      if (!isPeriodDue(per)) continue;
      const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
      if (rawDue <= 0) continue;
      const concessionForPeriod = periodConcessionCS[per] || 0;
      const adjustedDue = parseFloat(Math.max(rawDue - concessionForPeriod, 0).toFixed(2));
      if (adjustedDue <= 0) continue;

      currentDueBalance += adjustedDue;

      // Transport portion of this period's due
      const t = transportByPeriod[per];
      if (t) {
        const tPaid = allocMapCS[t._id.toString()] || 0;
        const tDue = parseFloat(Math.max(Number(t.amount || 0) - tPaid, 0).toFixed(2));
        currentTransportBalance += tDue;
      }
    }

    const hasCurrentOrPastDue = currentDueBalance > 0;
    if (!hasCurrentOrPastDue && lateFineBalance <= 0) continue;

    const grandTotal = parseFloat((currentDueBalance + lateFineBalance).toFixed(2));
    const nonTransportBalance = parseFloat(Math.max(currentDueBalance - currentTransportBalance, 0).toFixed(2));

    const key = `${cid}__${secId}`;
    if (!summaryMap[key]) {
      summaryMap[key] = {
        className: student.currentClass?.name || "",
        sectionName: student.currentSection?.name || "",
        count: 0,
        defaultersAmt: 0,
        transport: 0,
        lateFine: 0,
        grandTotal: 0,
      };
    }
    summaryMap[key].count += 1;
    summaryMap[key].defaultersAmt += nonTransportBalance;
    summaryMap[key].transport += currentTransportBalance;
    summaryMap[key].lateFine += lateFineBalance;
    summaryMap[key].grandTotal += grandTotal;
  }

  /* ── 6. Sort & paginate ── */
  const allRows = Object.values(summaryMap).sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.sectionName.localeCompare(b.sectionName),
  );

  const totalRows = allRows.length;
  const list = allRows.slice(skip, skip + perPage).map((row, idx) => ({
    sNo: skip + idx + 1,
    className: row.className,
    sectionName: row.sectionName,
    noOfDefaulters: row.count,
    defaultersAmt: parseFloat(row.defaultersAmt.toFixed(2)),
    transport: parseFloat(row.transport.toFixed(2)),
    lateFine: parseFloat(row.lateFine.toFixed(2)),
    grandTotal: parseFloat(row.grandTotal.toFixed(2)),
  }));

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Class-section defaulters fetched",
    ),
  );
});
/* ================================================================
   2. DEFAULTER DETAILED (period-wise)
   GET /reports/fee-defaulters-detailed?sessionId&classId&sectionId&period&page&limit
================================================================ */
export const feeDefaultersDetailed = asyncHandler(async (req, res) => {
  const db = req.db;
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const FeeStructure = getFeeStructureModel(db);
  const FeeInstallment = getFeeInstallmentModel(db);
  const AdditionalFee = getAdditionalFeeModel(db);
  const TransportFee = getTransportFeeModel(db);
  const StudentPayment = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const LateFee = getLateFeeModel(db);

  const {
    sessionId,
    classId,
    sectionId,
    period,
    page = 1,
    limit = 10,
  } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  // ── 1. Fee Structures & Installments ──
  const fsQuery = { sessionId: toId(sessionId), isActive: true };
  if (isId(classId)) fsQuery.classId = toId(classId);
  const feeStructures = await FeeStructure.find(fsQuery).lean();
  const fsIds = feeStructures.map((fs) => fs._id);
  const fsById = Object.fromEntries(
    feeStructures.map((fs) => [fs._id.toString(), fs]),
  );

  // ALL installments (no period filter) — needed for correct concession base
  const allInstallments = await FeeInstallment.find({
    feeStructureId: { $in: fsIds },
  }).lean();

  // Filtered installments for periodMap display (only requested period, or all if no filter)
  const filteredInstallments = period
    ? allInstallments.filter((i) => i.period === period)
    : allInstallments;

  // ── 2. Students ──
  const enrollMatch = { session: toId(sessionId), status: "Studying" };
  if (isId(classId)) enrollMatch.currentClass = toId(classId);
  if (isId(sectionId)) enrollMatch.currentSection = toId(sectionId);

  const students = await StudentEnrolment.find(enrollMatch)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .populate("stream", "name")
    .lean();

  const studentIds = students.map((s) => s._id);

  const additionalFees = await AdditionalFee.find({
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  // ── 4. Transport Fees per student (deduplicate by period) ──
  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
  }).lean();

  // ── 5. Allocation map per student: referenceId -> paidAmount (same as ledger) ──
  const allPayments = await StudentPayment.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    paymentStatus: "SUCCESS",
  }).lean();
  const paymentIds = allPayments.map((p) => p._id);

  const allAllocations = paymentIds.length
    ? await StudentPaymentAllocation.find({
        paymentId: { $in: paymentIds },
      }).lean()
    : [];

  const payStudentMap = {};
  for (const p of allPayments)
    payStudentMap[p._id.toString()] = p.studentId.toString();

  // studentId -> referenceId -> paidAmount
  const studentAllocMap = {};
  for (const a of allAllocations) {
    const sid = payStudentMap[a.paymentId.toString()];
    if (!sid) continue;
    const rid = a.referenceId.toString();
    if (!studentAllocMap[sid]) studentAllocMap[sid] = {};
    studentAllocMap[sid][rid] =
      (studentAllocMap[sid][rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // Map: studentId -> period -> transportFee (paid > isActive > latest, same as ledger)
  const paidTransportRefIds = new Set(
    allAllocations
      .filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0)
      .map(a => a.referenceId.toString())
  );
  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const sid = t.studentId.toString();
    if (!studentTransportMap[sid]) studentTransportMap[sid] = {};
    const existing = studentTransportMap[sid][t.period];
    if (!existing) { studentTransportMap[sid][t.period] = t; continue; }
    const tPaid = paidTransportRefIds.has(t._id.toString());
    const ePaid = paidTransportRefIds.has(existing._id.toString());
    if (tPaid && !ePaid) { studentTransportMap[sid][t.period] = t; continue; }
    if (!tPaid && ePaid) continue;
    if (t.isActive && !existing.isActive) { studentTransportMap[sid][t.period] = t; continue; }
    if (!t.isActive && existing.isActive) continue;
    if (new Date(t.updatedAt) > new Date(existing.updatedAt)) studentTransportMap[sid][t.period] = t;
  }

  // ── 5b. Late Fees per student (not waived) ──
  const allLateFees = studentIds.length
    ? await LateFee.find({
        studentId: { $in: studentIds },
        sessionId: toId(sessionId),
        isWaived: false,
        amount: { $gt: 0 },
      }).lean()
    : [];

  // Map: studentId -> [lateFeeRecords]
  const studentLateFeeMap = {};
  for (const lf of allLateFees) {
    const sid = lf.studentId.toString();
    if (!studentLateFeeMap[sid]) studentLateFeeMap[sid] = [];
    studentLateFeeMap[sid].push(lf);
  }

  // ── 6. Build rows ──
  const rows = [];
  for (const student of students) {
    const cid = student.currentClass?._id?.toString();
    const _rawStreamId = student.stream?._id?.toString() || student.stream?.toString() || null;
    const streamId = _rawStreamId && /^[a-f\d]{24}$/i.test(_rawStreamId) ? _rawStreamId : null;
    const stId = student._id.toString();
    if (!cid) continue;

    const allocMap = studentAllocMap[stId] || {};

    // ALL installments for this student's class+stream (for correct concession base)
    const allMyInsts = allInstallments.filter((inst) => {
      const fs = fsById[inst.feeStructureId.toString()];
      if (!fs) return false;
      return (
        fs.classId.toString() === cid &&
        (fs.streamId?.toString() || null) === streamId
      );
    });

    // Filtered installments for periodMap (only requested period, or all if no filter)
    const myInsts = period
      ? allMyInsts.filter((i) => i.period === period)
      : allMyInsts;

    // Additional fees for this student's class+stream
    const myAdditional = additionalFees.filter((f) => {
      const fClass = f.classId?.toString() || null;
      const fStream = f.streamId?.toString() || null;
      return (
        (!fClass && !fStream) ||
        (fClass === cid && !fStream) ||
        (fClass === cid && fStream === streamId)
      );
    });

    // Build periodMap: tuition + additional + transport only (NO late fee)
    const transportByPeriod = studentTransportMap[stId] || {};
    const periodMap = buildStudentPeriodMap({
      myInsts,
      myAdditional,
      transportByPeriod,
      allocMap,
    });

    // Concession base = ALL tuition + ALL additional + ALL transport (full session, same as ledger)
    const tuitionTotalStudent = allMyInsts.reduce(
      (s, i) => s + Number(i.amount || 0),
      0,
    );
    const additionalTotalStudent = myAdditional.reduce(
      (s, f) => s + Number(f.amount || 0),
      0,
    );
    const transportTotalStudent = Object.values(transportByPeriod).reduce(
      (s, t) => s + Number(t.amount || 0),
      0,
    );
    const feeBase =
      tuitionTotalStudent + additionalTotalStudent + transportTotalStudent;

    // Total paid across ALL periods (for skip check)
    const fullPeriodMap = buildStudentPeriodMap({
      myInsts: allMyInsts,
      myAdditional,
      transportByPeriod,
      allocMap,
    });
    const totalPaidForStudent = Object.values(fullPeriodMap).reduce(
      (s, v) => s + v.paidAmount,
      0,
    );

    const concession = calculateConcession({
      student,
      totalFee: tuitionTotalStudent,
      transportTotal: transportTotalStudent,
    });
    const netPayable = Math.max(feeBase - concession, 0);

    // Also count any late fee payments (so fully-paid students are not shown as defaulters)
    const totalLateFeeDue = (studentLateFeeMap[stId] || []).reduce((s, lf) => {
      const paid = allocMap[lf._id.toString()] || 0;
      return s + Math.max(Number(lf.amount) - paid, 0);
    }, 0);

    // Skip only if regular fees fully paid AND no pending late fees
    if (totalPaidForStudent >= netPayable && totalLateFeeDue <= 0) continue;

    // ── Concession map — SEQUENTIAL on TUITION ONLY (matches StudentLedgerController exactly) ──
    const tuitionOnlyPeriodMapDD = {};
    for (const inst of allMyInsts) {
      const per = inst.period;
      if (!tuitionOnlyPeriodMapDD[per]) tuitionOnlyPeriodMapDD[per] = { totalFee: 0, paidAmount: 0 };
      tuitionOnlyPeriodMapDD[per].totalFee += Number(inst.amount || 0);
    }
    const periodConcessionMap = buildSequentialConcessionMap({
      periodMap: tuitionOnlyPeriodMapDD,
      concession,
    });

    for (const [per, vals] of Object.entries(periodMap)) {
      if (period && per !== period) continue;
      // Skip future periods — only show dues up to current month
      if (!isPeriodDue(per)) continue;
      const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
      if (rawDue <= 0) continue;

      // Concession-adjusted balance for this period
      const concessionForPeriod = periodConcessionMap[per] || 0;
      const balanceAmount = parseFloat(
        Math.max(rawDue - concessionForPeriod, 0).toFixed(2),
      );
      if (balanceAmount <= 0) continue;

      // -- Build fee heads breakdown (ledger-style) for this period --
      const feeHeads = [];

      for (const inst of myInsts.filter(i => i.period === per)) {
        const paid = allocMap[inst._id.toString()] || 0;
        const rawInstDue = Math.max(Number(inst.amount) - paid, 0);
        const periodTotalFee = vals.totalFee || 0;
        const instShare = periodTotalFee > 0
          ? parseFloat(((concessionForPeriod * Number(inst.amount)) / periodTotalFee).toFixed(2))
          : 0;
        feeHeads.push({
          type:        "TUITION",
          feeHead:     inst.feeHead || "Tuition Fee",
          totalAmount: parseFloat(Number(inst.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   parseFloat(Math.max(rawInstDue - instShare, 0).toFixed(2)),
        });
      }

      for (const f of myAdditional.filter(f => f.period === per)) {
        const paid = allocMap[f._id.toString()] || 0;
        const rawFDue = Math.max(Number(f.amount) - paid, 0);
        const periodTotalFee = vals.totalFee || 0;
        const fShare = periodTotalFee > 0
          ? parseFloat(((concessionForPeriod * Number(f.amount)) / periodTotalFee).toFixed(2))
          : 0;
        feeHeads.push({
          type:        "ADDITIONAL",
          feeHead:     f.feeName || "Additional Fee",
          totalAmount: parseFloat(Number(f.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   parseFloat(Math.max(rawFDue - fShare, 0).toFixed(2)),
        });
      }

      const transport = transportByPeriod[per];
      if (transport) {
        const paid = allocMap[transport._id.toString()] || 0;
        const rawTDue = Math.max(Number(transport.amount) - paid, 0);
        const periodTotalFee = vals.totalFee || 0;
        const tShare = periodTotalFee > 0
          ? parseFloat(((concessionForPeriod * Number(transport.amount)) / periodTotalFee).toFixed(2))
          : 0;
        feeHeads.push({
          type:        "TRANSPORT",
          feeHead:     "Transport Fee",
          totalAmount: parseFloat(Number(transport.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   parseFloat(Math.max(rawTDue - tShare, 0).toFixed(2)),
        });
      }

      // Late fees for this period
      const myLateFees = (studentLateFeeMap[stId] || []).filter(lf => lf.period === per);
      let lateFeeTotalForPeriod = 0;
      for (const lf of myLateFees) {
        const paid = allocMap[lf._id.toString()] || 0;
        const due  = parseFloat(Math.max(Number(lf.amount) - paid, 0).toFixed(2));
        if (due <= 0) continue;
        lateFeeTotalForPeriod += due;
        feeHeads.push({
          type:        "LATE_FEE",
          feeHead:     "Late Fee",
          totalAmount: parseFloat(Number(lf.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   due,
        });
      }

      rows.push({
        studentId: student.studentId,
        fatherName: student.fatherName,
        motherName: student.motherName || "",
        phone: student.phone,
        rollNumber: student.rollNumber || "",
        formNo: student.formNo || "",
        address: student.address?.present?.Address1 || "-",
        studentName:
          `${student.firstName || ""} ${student.lastName || ""}`.trim(),
        className: student.currentClass?.name || "",
        sectionName: student.currentSection?.name || "",
        streamName: student.stream?.name || "",
        period: per,
        totalFee: parseFloat(vals.totalFee.toFixed(2)),
        paidAmount: parseFloat(vals.paidAmount.toFixed(2)),
        balanceAmount,
        lateFee: parseFloat(lateFeeTotalForPeriod.toFixed(2)),
        totalDue: parseFloat((balanceAmount + lateFeeTotalForPeriod).toFixed(2)),
        concession: parseFloat(concessionForPeriod.toFixed(2)),
        feeHeads,
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.period.localeCompare(b.period) || b.balanceAmount - a.balanceAmount,
  );
  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res
    .status(200)
    .json(
      new apiResponse(
        200,
        {
          list,
          pagination: {
            totalRows,
            totalPages: Math.ceil(totalRows / perPage),
            currentPage,
            perPage,
          },
        },
        "Defaulter detailed report fetched",
      ),
    );
});

/* ================================================================
   3. DEFAULTER LIST DETAILED (MONTH-WISE / STUDENT-WISE GROUPED)
   GET /reports/fee-defaulters-monthwise?sessionId&classId&sectionId&month&page&limit
   Returns: ONE row per student with all due months comma-separated
   e.g. { studentName, classSec, fatherName, phone, address, dueMonths: "JAN,FEB,MAR" }
================================================================ */
export const feeDefaultersMonthwise = asyncHandler(async (req, res) => {
  const db = req.db;
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const FeeStructure = getFeeStructureModel(db);
  const FeeInstallment = getFeeInstallmentModel(db);
  const AdditionalFee = getAdditionalFeeModel(db);
  const TransportFee = getTransportFeeModel(db);
  const StudentPayment = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const {
    sessionId,
    classId,
    sectionId,
    month,
    page = 1,
    limit = 10,
  } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  // ── 1. Fee Structures & ALL Installments (no period filter here — need all to find due months) ──
  const fsQuery = { sessionId: toId(sessionId), isActive: true };
  if (isId(classId)) fsQuery.classId = toId(classId);
  const feeStructures = await FeeStructure.find(fsQuery).lean();
  const fsIds = feeStructures.map((fs) => fs._id);
  const fsById = Object.fromEntries(
    feeStructures.map((fs) => [fs._id.toString(), fs]),
  );

  const installments = await FeeInstallment.find({
    feeStructureId: { $in: fsIds },
  }).lean();

  // ── 2. Students ──
  const enrollMatch = { session: toId(sessionId), status: "Studying" };
  if (isId(classId)) enrollMatch.currentClass = toId(classId);
  if (isId(sectionId)) enrollMatch.currentSection = toId(sectionId);

  const students = await StudentEnrolment.find(enrollMatch)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .populate("stream", "name")
    .lean();

  const studentIds = students.map((s) => s._id);

  // ── 3. Additional Fees ──
  const additionalFees = await AdditionalFee.find({
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  // ── 4. Transport Fees ──
  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
  }).lean();

  // ── 5. Allocation map per student ──
  const allPayments = await StudentPayment.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    paymentStatus: "SUCCESS",
  }).lean();
  const paymentIds = allPayments.map((p) => p._id);

  const allAllocations = paymentIds.length
    ? await StudentPaymentAllocation.find({
        paymentId: { $in: paymentIds },
      }).lean()
    : [];

  const payStudentMap = {};
  for (const p of allPayments)
    payStudentMap[p._id.toString()] = p.studentId.toString();

  const studentAllocMap = {};
  for (const a of allAllocations) {
    const sid = payStudentMap[a.paymentId.toString()];
    if (!sid) continue;
    const rid = a.referenceId.toString();
    if (!studentAllocMap[sid]) studentAllocMap[sid] = {};
    studentAllocMap[sid][rid] =
      (studentAllocMap[sid][rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // Build transport map after allocations (paid > isActive > latest, same as ledger)
  const paidTransportRefIdsMW = new Set(
    allAllocations
      .filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0)
      .map(a => a.referenceId.toString())
  );
  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const sid = t.studentId.toString();
    if (!studentTransportMap[sid]) studentTransportMap[sid] = {};
    const existing = studentTransportMap[sid][t.period];
    if (!existing) { studentTransportMap[sid][t.period] = t; continue; }
    const tPaid = paidTransportRefIdsMW.has(t._id.toString());
    const ePaid = paidTransportRefIdsMW.has(existing._id.toString());
    if (tPaid && !ePaid) { studentTransportMap[sid][t.period] = t; continue; }
    if (!tPaid && ePaid) continue;
    if (t.isActive && !existing.isActive) { studentTransportMap[sid][t.period] = t; continue; }
    if (!t.isActive && existing.isActive) continue;
    if (new Date(t.updatedAt) > new Date(existing.updatedAt)) studentTransportMap[sid][t.period] = t;
  }

  // ── 5b. Late Fees per student ──
  const LateFee = getLateFeeModel(db);
  const allLateFees = studentIds.length
    ? await LateFee.find({
        studentId: { $in: studentIds },
        sessionId: toId(sessionId),
        isWaived: false,
        amount: { $gt: 0 },
      }).lean()
    : [];

  // Map: studentId → lateFeeId → { amount, period }
  const studentLateFeeMap = {};
  for (const lf of allLateFees) {
    const sid = lf.studentId.toString();
    if (!studentLateFeeMap[sid]) studentLateFeeMap[sid] = [];
    studentLateFeeMap[sid].push(lf);
  }

  // Month order for sorting
  const MONTH_ORDER = [
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
    "JANUARY",
    "FEBRUARY",
    "MARCH",
  ];
  const MONTH_SHORT = {
    APRIL: "APR",
    MAY: "MAY",
    JUNE: "JUN",
    JULY: "JUL",
    AUGUST: "AUG",
    SEPTEMBER: "SEP",
    OCTOBER: "OCT",
    NOVEMBER: "NOV",
    DECEMBER: "DEC",
    JANUARY: "JAN",
    FEBRUARY: "FEB",
    MARCH: "MAR",
  };

  // ── 6. Build student-wise grouped rows ──
  const rows = [];

  for (const student of students) {
    const cid = student.currentClass?._id?.toString();
    // stream is populated object — extract _id safely
    const streamId = student.stream?._id?.toString() || student.stream?.toString() || null;
    // reject "[object Object]" — only allow valid 24-char hex ObjectId strings
    const validStreamId = streamId && /^[a-f\d]{24}$/i.test(streamId) ? streamId : null;
    const stId = student._id.toString();
    if (!cid) continue;

    const allocMap = studentAllocMap[stId] || {};

    const myInsts = installments.filter((inst) => {
      const fs = fsById[inst.feeStructureId.toString()];
      if (!fs) return false;
      return (
        fs.classId.toString() === cid &&
        (fs.streamId?.toString() || null) === validStreamId
      );
    });

    const myAdditional = additionalFees.filter((f) => {
      const fClass = f.classId?.toString() || null;
      const fStream = f.streamId?.toString() || null;
      return (
        (!fClass && !fStream) ||
        (fClass === cid && !fStream) ||
        (fClass === cid && fStream === validStreamId)
      );
    });

    // Build periodMap for ALL periods: tuition + additional + transport only (NO late fee)
    const transportByPeriod = studentTransportMap[stId] || {};
    const periodMap = buildStudentPeriodMap({
      myInsts,
      myAdditional,
      transportByPeriod,
      allocMap,
    });

    // Concession base = tuition + additional + transport (same as ledger, NOT late fee)
    const tuitionTotalMW = myInsts.reduce(
      (s, i) => s + Number(i.amount || 0),
      0,
    );
    const additionalTotalMW = myAdditional.reduce(
      (s, f) => s + Number(f.amount || 0),
      0,
    );
    const transportTotalStudent = Object.values(transportByPeriod).reduce(
      (s, t) => s + Number(t.amount || 0),
      0,
    );
    const totalFee = tuitionTotalMW + additionalTotalMW + transportTotalStudent;
    const totalPaid = Object.values(periodMap).reduce(
      (s, v) => s + v.paidAmount,
      0,
    );

    const concession = calculateConcession({
      student,
      totalFee: tuitionTotalMW,
      transportTotal: transportTotalStudent,
    });
    const netPayable = Math.max(totalFee - concession, 0);

    // Skip if fully paid (concession-adjusted)
    if (totalPaid >= netPayable) continue;

    // ── Concession map — SEQUENTIAL on TUITION ONLY (matches StudentLedgerController exactly) ──
    // Build tuition-only periodMap for concession distribution
    const tuitionOnlyPeriodMap = {};
    for (const inst of myInsts) {
      const per = inst.period;
      if (!tuitionOnlyPeriodMap[per]) tuitionOnlyPeriodMap[per] = { totalFee: 0, paidAmount: 0 };
      tuitionOnlyPeriodMap[per].totalFee += Number(inst.amount || 0);
    }
    const periodConcessionMapMW = buildSequentialConcessionMap({
      periodMap: tuitionOnlyPeriodMap,
      concession,
    });

    // Find all due months for this student (up to current month only)
    // A period is "due" only if: concession-adjusted due > 0 AND period is on/before current month
    const dueMonths = Object.entries(periodMap)
      .filter(([per, vals]) => {
        if (!isPeriodDue(per)) return false;
        const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
        if (rawDue <= 0) return false;
        // Apply concession — period is only "due" if net due after concession > 0
        const concessionForPeriod = periodConcessionMapMW[per] || 0;
        const adjustedDue = parseFloat(Math.max(rawDue - concessionForPeriod, 0).toFixed(2));
        return adjustedDue > 0;
      })
      .map(([per]) => per)
      .sort((a, b) => {
        const ai = MONTH_ORDER.indexOf(a);
        const bi = MONTH_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

    if (dueMonths.length === 0) continue;

    // If month filter applied, skip students who don't have that month due
    if (month && !dueMonths.includes(month)) continue;

    // ── Late fee due for this student ──
    const myLateFees = studentLateFeeMap[stId] || [];
    let lateFeeTotal = 0;
    let lateFeePaid = 0;
    for (const lf of myLateFees) {
      lateFeeTotal += Number(lf.amount || 0);
      lateFeePaid  += allocMap[lf._id.toString()] || 0;
    }
    const lateFeeDue = parseFloat(Math.max(lateFeeTotal - lateFeePaid, 0).toFixed(2));

    // Total due across all months (concession-adjusted) + late fee
    const totalDue = parseFloat((dueMonths.reduce((sum, per) => {
      const vals = periodMap[per];
      const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
      const concessionForPeriod = periodConcessionMapMW[per] || 0;
      return (
        sum + parseFloat(Math.max(rawDue - concessionForPeriod, 0).toFixed(2))
      );
    }, 0) + lateFeeDue).toFixed(2));

    // totalFee for summary = raw fee of due periods only (tuition + additional + transport)
    // late fee is shown separately in its own column, do NOT include here
    const duePeriodsFee = parseFloat((dueMonths.reduce((sum, per) => {
      return sum + (periodMap[per]?.totalFee || 0);
    }, 0)).toFixed(2));
    const duePeriodsPaid = parseFloat((dueMonths.reduce(
      (sum, per) => sum + (periodMap[per]?.paidAmount || 0),
      0,
    )).toFixed(2));

    // -- Build fee heads breakdown per due period --
    const feeHeadsByPeriod = {};
    for (const per of dueMonths) {
      const heads = [];

      for (const inst of myInsts.filter(i => i.period === per)) {
        const paid = allocMap[inst._id.toString()] || 0;
        heads.push({
          type:        "TUITION",
          feeHead:     inst.feeHead || "Tuition Fee",
          totalAmount: parseFloat(Number(inst.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   parseFloat(Math.max(Number(inst.amount) - paid, 0).toFixed(2)),
        });
      }

      for (const f of myAdditional.filter(f => f.period === per)) {
        const paid = allocMap[f._id.toString()] || 0;
        heads.push({
          type:        "ADDITIONAL",
          feeHead:     f.feeName || "Additional Fee",
          totalAmount: parseFloat(Number(f.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   parseFloat(Math.max(Number(f.amount) - paid, 0).toFixed(2)),
        });
      }

      const transport = transportByPeriod[per];
      if (transport) {
        const paid = allocMap[transport._id.toString()] || 0;
        heads.push({
          type:        "TRANSPORT",
          feeHead:     "Transport Fee",
          totalAmount: parseFloat(Number(transport.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   parseFloat(Math.max(Number(transport.amount) - paid, 0).toFixed(2)),
        });
      }

      // Late fees for this period
      for (const lf of myLateFees.filter(lf => lf.period === per)) {
        const paid = allocMap[lf._id.toString()] || 0;
        const due  = parseFloat(Math.max(Number(lf.amount) - paid, 0).toFixed(2));
        if (due <= 0) continue;
        heads.push({
          type:        "LATE_FEE",
          feeHead:     "Late Fee",
          totalAmount: parseFloat(Number(lf.amount).toFixed(2)),
          paidAmount:  parseFloat(paid.toFixed(2)),
          dueAmount:   due,
        });
      }

      if (heads.length) feeHeadsByPeriod[per] = heads;
    }

    rows.push({
      studentId: student.studentId,
      studentName:
        `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      classSec: `${student.currentClass?.name || ""} - ${student.currentSection?.name || ""}`,
      className: student.currentClass?.name || "",
      sectionName: student.currentSection?.name || "",
      streamName: student.stream?.name || "",
      fatherName: student.fatherName || "-",
      motherName: student.motherName || "-",
      phone: student.phone || "-",
      rollNumber: student.rollNumber || "",
      formNo: student.formNo || "",
      address: student.address?.present?.Address1 || "-",
      dueMonths: dueMonths.map((m) => MONTH_SHORT[m] || m).join(", "),
      totalFee: parseFloat(duePeriodsFee.toFixed(2)),
      totalPaid: parseFloat(duePeriodsPaid.toFixed(2)),
      totalDue: parseFloat(totalDue.toFixed(2)),
      lateFee: lateFeeDue,
      feeHeadsByPeriod,
    });
  }

  // Sort by class → section → student name
  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.sectionName.localeCompare(b.sectionName) ||
      a.studentName.localeCompare(b.studentName),
  );

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Month-wise defaulter report fetched",
    ),
  );
});
/* ================================================================
   4. REGISTRATION FEE STATEMENT
   GET /reports/registration-fee-statement
   ?sessionId&classId&fromDate&toDate&enrollmentStatus&page&limit
   enrollmentStatus: "enrolled" | "non-enrolled" | "all" (default)
   Source:
     enrolled     -> StudentEnrolment (studentId exists)
     non-enrolled -> StudentRegistration (isEnroll: false)
     all          -> both combined
================================================================ */
export const registrationFeeStatement = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const StudentRegistration = getStudentRegistrationModel(req.db);

  const {
    sessionId,
    classId,
    fromDate,
    toDate,
    enrollmentStatus = "all",
    page = 1,
    limit = 10,
  } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  const dateFilter = {};
  if (fromDate || toDate) {
    dateFilter.createdAt = {};
    if (fromDate) dateFilter.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const e = new Date(toDate);
      e.setHours(23, 59, 59, 999);
      dateFilter.createdAt.$lte = e;
    }
  }

  let rows = [];

  console.log(
    "[RegFeeStatement] sessionId:",
    sessionId,
    "enrollmentStatus:",
    enrollmentStatus,
    "classId:",
    classId,
  );

  /* ── ENROLLED: from StudentEnrolment ── */
  if (enrollmentStatus === "all" || enrollmentStatus === "enrolled") {
    const matchE = { session: toId(sessionId), ...dateFilter };
    if (isId(classId)) matchE.currentClass = toId(classId);

    const enrolled = await StudentEnrolment.aggregate([
      { $match: matchE },
      {
        $lookup: {
          from: "studentregistrations",
          localField: "studentRegistrationId",
          foreignField: "_id",
          as: "reg",
        },
      },
      { $unwind: { path: "$reg", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "classes",
          localField: "currentClass",
          foreignField: "_id",
          as: "class",
        },
      },
      {
        $lookup: {
          from: "sections",
          localField: "currentSection",
          foreignField: "_id",
          as: "section",
        },
      },
      { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          studentId: 1,
          registrationNo: {
            $ifNull: ["$reg.formNo", { $ifNull: ["$registrationNo", "-"] }],
          },
          studentName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$firstName", ""] },
                  " ",
                  { $ifNull: ["$lastName", ""] },
                ],
              },
            },
          },
          fatherName: 1,
          phone: 1,
          className: "$class.name",
          sectionName: { $ifNull: ["$section.name", "-"] },
          registrationDate: {
            $dateToString: { format: "%d-%m-%Y", date: "$createdAt" },
          },
          registrationFee: { $ifNull: ["$reg.registrationFee", "-"] },
          paymentMode: { $ifNull: ["$reg.paymentMode", "-"] },
          isEnrolled: { $literal: "Enrolled" },
        },
      },
    ]);
    console.log("[RegFeeStatement] enrolled count:", enrolled.length);
    rows = rows.concat(enrolled);
  }

  /* ── NON-ENROLLED: from StudentRegistration (isEnroll: false) ── */
  if (enrollmentStatus === "all" || enrollmentStatus === "non-enrolled") {
    const matchR = { session: toId(sessionId), isEnroll: false, ...dateFilter };
    if (isId(classId)) matchR.currentClass = toId(classId);

    const nonEnrolled = await StudentRegistration.aggregate([
      { $match: matchR },
      {
        $lookup: {
          from: "classes",
          localField: "currentClass",
          foreignField: "_id",
          as: "class",
        },
      },
      {
        $lookup: {
          from: "sections",
          localField: "currentSection",
          foreignField: "_id",
          as: "section",
        },
      },
      { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          studentId: { $literal: "-" },
          registrationNo: { $ifNull: ["$formNo", "-"] },
          studentName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$firstName", ""] },
                  " ",
                  { $ifNull: ["$lastName", ""] },
                ],
              },
            },
          },
          fatherName: 1,
          phone: 1,
          className: "$class.name",
          sectionName: { $ifNull: ["$section.name", "-"] },
          registrationDate: {
            $dateToString: { format: "%d-%m-%Y", date: "$createdAt" },
          },
          registrationFee: { $ifNull: ["$registrationFee", "-"] },
          paymentMode: { $ifNull: ["$paymentMode", "-"] },
          isEnrolled: { $literal: "Non-Enrolled" },
        },
      },
    ]);
    console.log("[RegFeeStatement] nonEnrolled count:", nonEnrolled.length);
    rows = rows.concat(nonEnrolled);
  }

  /* ── Sort, paginate ── */
  rows.sort(
    (a, b) =>
      (a.className || "").localeCompare(b.className || "") ||
      (a.sectionName || "").localeCompare(b.sectionName || "") ||
      (a.studentName || "").localeCompare(b.studentName || ""),
  );

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Registration fee statement fetched",
    ),
  );
});
/* ================================================================
   5. FEE REGISTER DETAILED (allocation-wise with fee head)
   GET /reports/fee-register-detailed?sessionId&classId&sectionId&fromDate&toDate&page&limit
================================================================ */
export const feeRegisterDetailed = asyncHandler(async (req, res) => {
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const AdditionalFee = getAdditionalFeeModel(req.db);
  const FeeInstallment = getFeeInstallmentModel(req.db);
  const TransportFee = getTransportFeeModel(req.db);

  const { sessionId, classId, sectionId, fromDate, toDate, studentSearch, receiptNo, page = 1, limit = 10 } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  const paymentMatch = {
    "payment.sessionId": toId(sessionId),
    "payment.paymentStatus": "SUCCESS",
  };
  if (isId(classId)) paymentMatch["payment.classId"] = toId(classId);
  if (receiptNo?.trim()) paymentMatch["payment.receiptNo"] = { $regex: receiptNo.trim(), $options: "i" };
  if (fromDate || toDate) {
    paymentMatch["payment.createdAt"] = {};
    if (fromDate) paymentMatch["payment.createdAt"].$gte = new Date(fromDate);
    if (toDate) {
      const e = new Date(toDate);
      e.setHours(23, 59, 59, 999);
      paymentMatch["payment.createdAt"].$lte = e;
    }
  }

  // ── Fetch all allocations with payment + student + class + section ──
  const rawAllocations = await StudentPaymentAllocation.aggregate([
    {
      $lookup: {
        from: "studentpayments",
        localField: "paymentId",
        foreignField: "_id",
        as: "payment",
      },
    },
    { $unwind: "$payment" },
    { $match: paymentMatch },
    {
      $lookup: {
        from: "studentenrolments",
        localField: "payment.studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
    ...(isId(sectionId) ? [{ $match: { "student.currentSection": toId(sectionId) } }] : []),
    // Student search: match by studentId (numeric) or name (string)
    ...(studentSearch?.trim() ? [{
      $match: {
        $or: [
          { "student.studentId": isNaN(studentSearch) ? -1 : Number(studentSearch) },
          { "student.firstName": { $regex: studentSearch.trim(), $options: "i" } },
          { "student.lastName":  { $regex: studentSearch.trim(), $options: "i" } },
        ],
      },
    }] : []),
    { $lookup: { from: "classes",  localField: "payment.classId",        foreignField: "_id", as: "class"   } },
    { $lookup: { from: "sections", localField: "student.currentSection", foreignField: "_id", as: "section" } },
    { $lookup: { from: "studentregistrations", localField: "student.studentRegistrationId", foreignField: "_id", as: "registration" } },
    { $unwind: { path: "$class",        preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$section",      preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$registration", preserveNullAndEmptyArrays: true } },
    { $sort: { "payment.createdAt": -1 } },
  ]);

  // ── Build referenceId -> feeHead name maps ──
  const tuitionIds = rawAllocations
    .filter((a) => a.feeType === "TUITION")
    .map((a) => a.referenceId);
  const additionalIds = rawAllocations
    .filter((a) => a.feeType === "ADDITIONAL")
    .map((a) => a.referenceId);
  const transportIds = rawAllocations
    .filter((a) => a.feeType === "TRANSPORT")
    .map((a) => a.referenceId);

  const [tuitionDocs, additionalDocs, transportDocs] = await Promise.all([
    tuitionIds.length
      ? FeeInstallment.find({ _id: { $in: tuitionIds } }, { period: 1 }).lean()
      : [],
    additionalIds.length
      ? AdditionalFee.find(
          { _id: { $in: additionalIds } },
          { feeName: 1, period: 1 },
        ).lean()
      : [],
    transportIds.length
      ? TransportFee.find(
          { _id: { $in: transportIds } },
          { period: 1, transportType: 1 },
        ).lean()
      : [],
  ]);

  const tuitionMap = Object.fromEntries(
    tuitionDocs.map((d) => [d._id.toString(), `Tuition Fee (${d.period})`]),
  );
  const additionalMap = Object.fromEntries(
    additionalDocs.map((d) => [
      d._id.toString(),
      d.feeName || `Additional Fee (${d.period})`,
    ]),
  );
  const transportMap = Object.fromEntries(
    transportDocs.map((d) => [d._id.toString(), `Transport Fee (${d.period})`]),
  );

  const getFeeHeadName = (feeType, referenceId) => {
    const rid = referenceId?.toString();
    if (feeType === "TUITION") return tuitionMap[rid] || "Tuition Fee";
    if (feeType === "ADDITIONAL") return additionalMap[rid] || "Additional Fee";
    if (feeType === "TRANSPORT") return transportMap[rid] || "Transport Fee";
    return feeType || "-";
  };

  // ── Build final list ──
  const allRows = rawAllocations.map((a) => ({
    studentId:    a.student?.studentId,
    studentName:  `${a.student?.firstName || ""} ${a.student?.lastName || ""}`.trim(),
    fatherName:   a.student?.fatherName   || "-",
    studentPhone: a.student?.phone        || a.student?.guardianPhone || "-",
    formNo:       a.registration?.formNo || a.student?.formNo || "-",
    className:    a.class?.name    || "-",
    sectionName:  a.section?.name  || "-",
    feeHead:      getFeeHeadName(a.feeType, a.referenceId),
    amount:       a.allocatedAmount,
    paidDate:     a.payment?.createdAt
      ? new Date(a.payment.createdAt)
          .toLocaleDateString("en-GB")
          .split("/")
          .join("-")
      : "-",
    receiptNo:    a.payment?.receiptNo    || "-",
    paymentMode:  a.payment?.paymentMode  || "-",
    remarks:      a.payment?.remarks      || "",
    clerkId:      a.payment?.clerkId      || null,
    gatewayOrderId: a.payment?.gatewayOrderId || null,
    paymentType:  a.payment?.paymentType  || null,
  }));

  const totalRows = allRows.length;
  const list = allRows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Fee register detailed fetched",
    ),
  );
});

/* ================================================================
   6. REGISTRATION FEE CLASS-WISE
   GET /reports/registration-fee-classwise?sessionId&fromDate&toDate&page&limit
   Source: StudentRegistration - group by currentClass
================================================================ */
export const registrationFeeClasswise = asyncHandler(async (req, res) => {
  const StudentRegistration = getStudentRegistrationModel(req.db);
  const { sessionId, fromDate, toDate, page = 1, limit = 10 } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  const match = { session: toId(sessionId) };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const e = new Date(toDate);
      e.setHours(23, 59, 59, 999);
      match.createdAt.$lte = e;
    }
  }

  const result = await StudentRegistration.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$currentClass",
        totalStudents: { $sum: 1 },
        // registrationFee is stored as String in model, convert to number
        registrationFee: {
          $sum: {
            $convert: {
              input: "$registrationFee",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
        },
        // collected = enrolled students who paid (isEnroll: true)
        collected: {
          $sum: {
            $cond: [
              { $eq: ["$isEnroll", true] },
              {
                $convert: {
                  input: "$registrationFee",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
              0,
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: "classes",
        localField: "_id",
        foreignField: "_id",
        as: "class",
      },
    },
    { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        className: "$class.name",
        totalStudents: 1,
        registrationFee: 1,
        collected: 1,
        balance: { $subtract: ["$registrationFee", "$collected"] },
      },
    },
    { $sort: { className: 1 } },
    {
      $facet: {
        list: [{ $skip: skip }, { $limit: perPage }],
        totalCount: [{ $count: "count" }],
      },
    },
  ]);

  const list = result[0]?.list || [];
  const totalRows = result[0]?.totalCount?.[0]?.count || 0;
  res
    .status(200)
    .json(
      new apiResponse(
        200,
        {
          list,
          pagination: {
            totalRows,
            totalPages: Math.ceil(totalRows / perPage),
            currentPage,
            perPage,
          },
        },
        "Registration fee class-wise fetched",
      ),
    );
});

/* ================================================================
   8. FEE DEPOSIT SUMMARY CLASS-WISE
   GET /reports/fee-deposit-summary-classwise
   ?sessionId&classId&sectionId&fromDate&toDate&page&limit
================================================================ */
export const feeDepositSummaryClasswise = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const StudentPayment = getStudentPaymentModel(req.db);
  const {
    sessionId,
    classId,
    sectionId,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
  } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  // ── 1. Get all studying students grouped by class+section ──
  const enrollMatch = { session: toId(sessionId), status: "Studying" };
  if (isId(classId)) enrollMatch.currentClass = toId(classId);
  if (isId(sectionId)) enrollMatch.currentSection = toId(sectionId);

  const studentGroups = await StudentEnrolment.aggregate([
    { $match: enrollMatch },
    {
      $group: {
        _id: { classId: "$currentClass", sectionId: "$currentSection" },
        totalStudents: { $sum: 1 },
        studentIds: { $push: "$_id" },
      },
    },
    {
      $lookup: {
        from: "classes",
        localField: "_id.classId",
        foreignField: "_id",
        as: "class",
      },
    },
    {
      $lookup: {
        from: "sections",
        localField: "_id.sectionId",
        foreignField: "_id",
        as: "section",
      },
    },
    { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },
    { $sort: { "class.name": 1, "section.name": 1 } },
  ]);

  // ── 2. For each group, count fee deposit students & total amount ──
  const paymentMatch = { sessionId: toId(sessionId), paymentStatus: "SUCCESS" };
  if (fromDate || toDate) {
    paymentMatch.createdAt = {};
    if (fromDate) paymentMatch.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const e = new Date(toDate);
      e.setHours(23, 59, 59, 999);
      paymentMatch.createdAt.$lte = e;
    }
  }

  // Get all payments for this session
  const allPayments = await StudentPayment.find(paymentMatch, {
    studentId: 1,
    amountPaid: 1,
  }).lean();

  // Map: studentId -> totalPaid
  const paymentMap = {};
  for (const p of allPayments) {
    const sid = p.studentId.toString();
    paymentMap[sid] = (paymentMap[sid] || 0) + Number(p.amountPaid || 0);
  }

  // Build rows
  const rows = studentGroups.map((grp) => {
    const studentIds = grp.studentIds.map((id) => id.toString());
    let feeDepositStudents = 0;
    let totalDeposited = 0;
    for (const sid of studentIds) {
      if (paymentMap[sid]) {
        feeDepositStudents++;
        totalDeposited += paymentMap[sid];
      }
    }
    return {
      className: grp.class?.name || "-",
      sectionName: grp.section?.name || "-",
      totalStudents: grp.totalStudents,
      feeDepositStudents,
      totalDeposited: parseFloat(totalDeposited.toFixed(2)),
    };
  });

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Fee deposit summary class-wise fetched",
    ),
  );
});

/* ================================================================
   11. FEE DEPOSITED DETAILED (receipt-wise)
   GET /reports/fee-deposited-detailed?sessionId&classId&sectionId&fromDate&toDate&page&limit
   Returns: studentName, className, sectionName, amount, receiptNo, paidDate
================================================================ */
export const feeDepositedDetailed = asyncHandler(async (req, res) => {
  const StudentPayment = getStudentPaymentModel(req.db);
  const {
    sessionId,
    classId,
    sectionId,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
  } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  const match = { sessionId: toId(sessionId), paymentStatus: "SUCCESS" };
  if (isId(classId)) match.classId = toId(classId);
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const e = new Date(toDate);
      e.setHours(23, 59, 59, 999);
      match.createdAt.$lte = e;
    }
  }

  const result = await StudentPayment.aggregate([
    { $match: match },

    // Lookup student
    {
      $lookup: {
        from: "studentenrolments",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },

    // Filter by sectionId if provided
    ...(isId(sectionId)
      ? [{ $match: { "student.currentSection": toId(sectionId) } }]
      : []),

    // Lookup class & section
    {
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "_id",
        as: "class",
      },
    },
    {
      $lookup: {
        from: "sections",
        localField: "student.currentSection",
        foreignField: "_id",
        as: "section",
      },
    },
    { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        receiptNo: 1,
        studentName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$student.firstName", ""] },
                " ",
                { $ifNull: ["$student.lastName", ""] },
              ],
            },
          },
        },
        className: "$class.name",
        sectionName: "$section.name",
        amount: "$amountPaid",
        paidDate: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } },
        paymentMode: 1,
      },
    },

    { $sort: { createdAt: -1 } },
    {
      $facet: {
        list: [{ $skip: skip }, { $limit: perPage }],
        totalCount: [{ $count: "count" }],
      },
    },
  ]);

  const list = result[0]?.list || [];
  const totalRows = result[0]?.totalCount?.[0]?.count || 0;
  res
    .status(200)
    .json(
      new apiResponse(
        200,
        {
          list,
          pagination: {
            totalRows,
            totalPages: Math.ceil(totalRows / perPage),
            currentPage,
            perPage,
          },
        },
        "Fee deposited detailed fetched",
      ),
    );
});
/* ================================================================
   12. STUDENT FEE DETAILS CLASS-WISE
   GET /reports/student-fee-details-classwise?sessionId&classId&sectionId&page&limit
   Returns per-student: totalFee (tuition+additional+transport),
                        concession, paidAmount, balanceAmount
================================================================ */
export const studentFeeDetailsClasswise = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const StudentPayment = getStudentPaymentModel(req.db);
  const FeeStructure = getFeeStructureModel(req.db);
  const FeeInstallment = getFeeInstallmentModel(req.db);
  const AdditionalFee = getAdditionalFeeModel(req.db);
  const TransportFee = getTransportFeeModel(req.db);

  const { sessionId, classId, sectionId, page = 1, limit = 10 } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  /* ── 1. Fetch all studying students ── */
  const match = { session: toId(sessionId), status: "Studying" };
  if (isId(classId)) match.currentClass = toId(classId);
  if (isId(sectionId)) match.currentSection = toId(sectionId);

  const students = await StudentEnrolment.find(match)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .lean();

  if (!students.length) {
    return res.status(200).json(
      new apiResponse(
        200,
        {
          list: [],
          pagination: { totalRows: 0, totalPages: 0, currentPage, perPage },
        },
        "Student fee details class-wise fetched",
      ),
    );
  }

  /* ── 2. Pre-fetch fee structures & installments for all classes ── */
  const classIds = [
    ...new Set(
      students.map((s) => s.currentClass?._id?.toString()).filter(Boolean),
    ),
  ];

  const feeStructures = await FeeStructure.find({
    sessionId: toId(sessionId),
    classId: { $in: classIds.map((id) => toId(id)) },
    isActive: true,
  }).lean();

  const feeStructureIds = feeStructures.map((fs) => fs._id);

  const allInstallments = feeStructureIds.length
    ? await FeeInstallment.find({
        feeStructureId: { $in: feeStructureIds },
      }).lean()
    : [];

  // Map: "classId__streamId" -> tuition total
  const classTuitionMap = {};
  for (const fs of feeStructures) {
    const key = `${fs.classId}__${fs.streamId || "null"}`;
    if (!classTuitionMap[key]) classTuitionMap[key] = 0;
    allInstallments
      .filter((i) => i.feeStructureId.toString() === fs._id.toString())
      .forEach((i) => {
        classTuitionMap[key] += Number(i.amount || 0);
      });
  }

  /* ── 3. Pre-fetch additional fees for session ── */
  const additionalFees = await AdditionalFee.find({
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  const getAdditionalTotal = (cid, streamId) => {
    let total = 0;
    const sId = streamId?.toString() || null;
    for (const f of additionalFees) {
      const fClass = f.classId?.toString() || null;
      const fStream = f.streamId?.toString() || null;
      if (
        (!fClass && !fStream) ||
        (fClass === cid && !fStream) ||
        (fClass === cid && fStream === sId)
      ) {
        total += Number(f.amount || 0);
      }
    }
    return total;
  };

  /* ── 4. Pre-fetch transport fees for all students ── */
  const studentIds = students.map((s) => s._id);

  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  // Map: studentId -> { period -> transportFee } (deduplicate by period, keep latest)
  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const sid = t.studentId.toString();
    if (!studentTransportMap[sid]) studentTransportMap[sid] = {};
    const existing = studentTransportMap[sid][t.period];
    if (!existing || new Date(t.updatedAt) > new Date(existing.updatedAt)) {
      studentTransportMap[sid][t.period] = t;
    }
  }

  /* ── 5. Pre-fetch all SUCCESS payments & allocations ── */
  const allPayments = await StudentPayment.find(
    {
      studentId: { $in: studentIds },
      sessionId: toId(sessionId),
      paymentStatus: "SUCCESS",
    },
    { studentId: 1, _id: 1 },
  ).lean();

  const allPaymentIds = allPayments.map((p) => p._id);

  // Map: paymentId -> studentId
  const payStudentMap = {};
  for (const p of allPayments)
    payStudentMap[p._id.toString()] = p.studentId.toString();

  // Fetch allocations for all payments
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const allAllocations = allPaymentIds.length
    ? await StudentPaymentAllocation.find(
        { paymentId: { $in: allPaymentIds } },
        { paymentId: 1, allocatedAmount: 1 },
      ).lean()
    : [];

  // Map: studentId -> totalAllocated
  const studentPaidMap = {};
  for (const a of allAllocations) {
    const sid = payStudentMap[a.paymentId.toString()];
    if (!sid) continue;
    studentPaidMap[sid] =
      (studentPaidMap[sid] || 0) + Number(a.allocatedAmount || 0);
  }

  /* ── 6. Build per-student rows ── */
  const rows = students.map((student) => {
    const cid = student.currentClass?._id?.toString();
    const _rs2 = student.stream?._id?.toString() || student.stream?.toString() || null;
    const streamId = _rs2 && /^[a-f\d]{24}$/i.test(_rs2) ? _rs2 : null;
    const stId = student._id.toString();

    // Tuition fee (from FeeStructure + FeeInstallment)
    const tuitionKey = `${cid}__${streamId || "null"}`;
    const tuitionTotal = classTuitionMap[tuitionKey] || 0;

    // Additional fee
    const additionalTotal = getAdditionalTotal(cid, streamId);

    // Transport fee
    const transportPeriods = studentTransportMap[stId] || {};
    const transportTotal = Object.values(transportPeriods).reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0,
    );

    const grossFee = tuitionTotal + additionalTotal + transportTotal;

    // Concession applies ONLY to Tuition Fee
    let concession = 0;
    if (student.fullFeeConcession || student.fullFeeExceptTransport) {
      concession = tuitionTotal;
    } else if (student.discount) {
      const discountVal = parseFloat(student.discount) || 0;
      if (student.discountType === "%") {
        concession = parseFloat(((tuitionTotal * discountVal) / 100).toFixed(2));
      } else {
        concession = Math.min(discountVal, tuitionTotal);
      }
    }

    const totalFee = parseFloat((grossFee - concession).toFixed(2));
    const paidAmount = parseFloat((studentPaidMap[stId] || 0).toFixed(2));
    const balanceAmount = parseFloat(
      Math.max(totalFee - paidAmount, 0).toFixed(2),
    );

    return {
      studentId: student.studentId,
      studentName:
        `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      fatherName: student.fatherName || "-",
      phone: student.phone || "-",
      className: student.currentClass?.name || "-",
      sectionName: student.currentSection?.name || "-",
      totalFee,
      concession: parseFloat(concession.toFixed(2)),
      paidAmount,
      balanceAmount,
    };
  });

  /* ── 7. Sort & paginate in JS ── */
  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.studentName.localeCompare(b.studentName),
  );

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Student fee details class-wise fetched",
    ),
  );
});

/* ================================================================
   13. SCHOLARSHIP / CONCESSION REPORT
   GET /reports/scholarship?sessionId&classId&page&limit
   Returns: students who have any concession (fullFeeConcession,
            fullFeeExceptTransport, or discount > 0)
================================================================ */
export const scholarshipReport = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { sessionId, classId, page = 1, limit = 10 } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  const match = { session: toId(sessionId), status: "Studying" };
  if (isId(classId)) match.currentClass = toId(classId);

  const students = await StudentEnrolment.find(match)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .lean();

  // Keep only students who have some concession
  const rows = [];
  for (const s of students) {
    let scholarshipType = null;
    let amount = 0;

    if (s.fullFeeConcession) {
      scholarshipType = "Full Fee Concession";
      amount = 0; // full — no fixed amount
    } else if (s.fullFeeExceptTransport) {
      scholarshipType = "Full Fee (Except Transport)";
      amount = 0;
    } else if (s.discount && parseFloat(s.discount) > 0) {
      const val = parseFloat(s.discount);
      scholarshipType =
        s.discountType === "%" ? `Discount (${val}%)` : `Discount (₹${val})`;
      amount = val;
    }

    if (!scholarshipType) continue;

    rows.push({
      studentId: s.studentId,
      studentName: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
      fatherName: s.fatherName || "-",
      phone: s.phone || "-",
      className: s.currentClass?.name || "-",
      sectionName: s.currentSection?.name || "-",
      scholarshipType,
      amount,
      approvedBy: "-", // not stored in model — placeholder
    });
  }

  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.studentName.localeCompare(b.studentName),
  );

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Scholarship report fetched",
    ),
  );
});

/* ================================================================
   14. INACTIVE STUDENT LIST
   GET /reports/inactive-student-list?sessionId&classId&page&limit
   Returns: students with status "Left" or "Passed"
================================================================ */
export const inactiveStudentList = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { sessionId, classId, page = 1, limit = 10 } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  const match = {
    session: toId(sessionId),
    status: { $in: ["Left", "Passed"] },
  };
  if (isId(classId)) match.currentClass = toId(classId);

  const students = await StudentEnrolment.find(match)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .lean();

  const rows = students.map((s) => ({
    studentId: s.studentId,
    studentName: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
    fatherName: s.fatherName || "-",
    phone: s.phone || "-",
    className: s.currentClass?.name || "-",
    sectionName: s.currentSection?.name || "-",
    inactiveDate: s.updatedAt
      ? new Date(s.updatedAt).toLocaleDateString("en-GB").split("/").join("-")
      : "-",
    reason: s.leavingReason || s.status || "-",
  }));

  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.studentName.localeCompare(b.studentName),
  );

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Inactive student list fetched",
    ),
  );
});

/* ================================================================
   15. INACTIVE STUDENT FEE STATEMENT
   GET /reports/inactive-student-fee-statement?sessionId&classId&page&limit
   Returns: Left/Passed students with their fee summary
================================================================ */
export const inactiveStudentFeeStatement = asyncHandler(async (req, res) => {
  const db = req.db;
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const StudentPayment = getStudentPaymentModel(db);
  const FeeStructure = getFeeStructureModel(db);
  const FeeInstallment = getFeeInstallmentModel(db);
  const AdditionalFee = getAdditionalFeeModel(db);
  const TransportFee = getTransportFeeModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const { sessionId, classId, page = 1, limit = 10 } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  /* ── 1. Inactive students ── */
  const match = {
    session: toId(sessionId),
    status: { $in: ["Left", "Passed"] },
  };
  if (isId(classId)) match.currentClass = toId(classId);

  const students = await StudentEnrolment.find(match)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .lean();

  if (!students.length) {
    return res.status(200).json(
      new apiResponse(
        200,
        {
          list: [],
          pagination: { totalRows: 0, totalPages: 0, currentPage, perPage },
        },
        "Inactive student fee statement fetched",
      ),
    );
  }

  /* ── 2. Fee structures & installments ── */
  const classIds = [
    ...new Set(
      students.map((s) => s.currentClass?._id?.toString()).filter(Boolean),
    ),
  ];
  const feeStructures = await FeeStructure.find({
    sessionId: toId(sessionId),
    classId: { $in: classIds.map((id) => toId(id)) },
    isActive: true,
  }).lean();

  const fsIds = feeStructures.map((fs) => fs._id);
  const fsById = Object.fromEntries(
    feeStructures.map((fs) => [fs._id.toString(), fs]),
  );

  const allInstallments = fsIds.length
    ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean()
    : [];

  /* ── 3. Additional fees ── */
  const additionalFees = await AdditionalFee.find({
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  /* ── 4. Transport fees ── */
  const studentIds = students.map((s) => s._id);
  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const sid = t.studentId.toString();
    if (!studentTransportMap[sid]) studentTransportMap[sid] = {};
    const existing = studentTransportMap[sid][t.period];
    if (!existing || new Date(t.updatedAt) > new Date(existing.updatedAt))
      studentTransportMap[sid][t.period] = t;
  }

  /* ── 5. Payments & allocations ── */
  const allPayments = await StudentPayment.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    paymentStatus: "SUCCESS",
  }).lean();

  const payStudentMap = {};
  for (const p of allPayments)
    payStudentMap[p._id.toString()] = p.studentId.toString();

  const allPaymentIds = allPayments.map((p) => p._id);
  const allAllocations = allPaymentIds.length
    ? await StudentPaymentAllocation.find({
        paymentId: { $in: allPaymentIds },
      }).lean()
    : [];

  const studentPaidMap = {};
  for (const a of allAllocations) {
    const sid = payStudentMap[a.paymentId.toString()];
    if (!sid) continue;
    studentPaidMap[sid] =
      (studentPaidMap[sid] || 0) + Number(a.allocatedAmount || 0);
  }

  /* ── 6. Build rows ── */
  const rows = students.map((student) => {
    const cid = student.currentClass?._id?.toString();
    const streamId = student.stream?.toString() || null;
    const stId = student._id.toString();

    const myInsts = allInstallments.filter((inst) => {
      const fs = fsById[inst.feeStructureId.toString()];
      return (
        fs &&
        fs.classId.toString() === cid &&
        (fs.streamId?.toString() || null) === streamId
      );
    });

    const myAdditional = additionalFees.filter((f) => {
      const fClass = f.classId?.toString() || null;
      const fStream = f.streamId?.toString() || null;
      return (
        (!fClass && !fStream) ||
        (fClass === cid && !fStream) ||
        (fClass === cid && fStream === streamId)
      );
    });

    const transportByPeriod = studentTransportMap[stId] || {};
    const tuitionTotal = myInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
    const additionalTotal = myAdditional.reduce(
      (s, f) => s + Number(f.amount || 0),
      0,
    );
    const transportTotal = Object.values(transportByPeriod).reduce(
      (s, t) => s + Number(t.amount || 0),
      0,
    );
    const grossFee = tuitionTotal + additionalTotal + transportTotal;

    const concession = calculateConcession({
      student,
      totalFee: grossFee,
      transportTotal,
    });
    const totalFee = parseFloat(Math.max(grossFee - concession, 0).toFixed(2));
    const paidAmount = parseFloat((studentPaidMap[stId] || 0).toFixed(2));
    const balanceAmount = parseFloat(
      Math.max(totalFee - paidAmount, 0).toFixed(2),
    );

    return {
      studentId: student.studentId,
      studentName:
        `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      fatherName: student.fatherName || "-",
      phone: student.phone || "-",
      className: student.currentClass?.name || "-",
      sectionName: student.currentSection?.name || "-",
      totalFee,
      paidAmount,
      balanceAmount,
    };
  });

  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.studentName.localeCompare(b.studentName),
  );

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "Inactive student fee statement fetched",
    ),
  );
});

/* ================================================================
   16. NEW ADMISSION FEE COLLECTION
   GET /reports/new-admission-fee-collection
   ?sessionId&classId&fromDate&toDate&page&limit
   Returns: students admitted in the given date range with fee summary
================================================================ */
export const newAdmissionFeeCollection = asyncHandler(async (req, res) => {
  const db = req.db;
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const StudentPayment = getStudentPaymentModel(db);
  const FeeStructure = getFeeStructureModel(db);
  const FeeInstallment = getFeeInstallmentModel(db);
  const AdditionalFee = getAdditionalFeeModel(db);
  const TransportFee = getTransportFeeModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const {
    sessionId,
    classId,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
  } = req.query;

  if (!isId(sessionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId required"));

  const { currentPage, perPage, skip } = paginate(page, limit);

  /* ── 1. Students enrolled in date range ── */
  const match = { session: toId(sessionId), status: "Studying" };
  if (isId(classId)) match.currentClass = toId(classId);
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const e = new Date(toDate);
      e.setHours(23, 59, 59, 999);
      match.createdAt.$lte = e;
    }
  }

  const students = await StudentEnrolment.find(match)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .lean();

  if (!students.length) {
    return res.status(200).json(
      new apiResponse(
        200,
        {
          list: [],
          pagination: { totalRows: 0, totalPages: 0, currentPage, perPage },
        },
        "New admission fee collection fetched",
      ),
    );
  }

  /* ── 2. Fee structures & installments ── */
  const classIds = [
    ...new Set(
      students.map((s) => s.currentClass?._id?.toString()).filter(Boolean),
    ),
  ];
  const feeStructures = await FeeStructure.find({
    sessionId: toId(sessionId),
    classId: { $in: classIds.map((id) => toId(id)) },
    isActive: true,
  }).lean();

  const fsIds = feeStructures.map((fs) => fs._id);
  const fsById = Object.fromEntries(
    feeStructures.map((fs) => [fs._id.toString(), fs]),
  );

  const allInstallments = fsIds.length
    ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean()
    : [];

  /* ── 3. Additional fees ── */
  const additionalFees = await AdditionalFee.find({
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  /* ── 4. Transport fees ── */
  const studentIds = students.map((s) => s._id);
  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    isActive: true,
  }).lean();

  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const sid = t.studentId.toString();
    if (!studentTransportMap[sid]) studentTransportMap[sid] = {};
    const existing = studentTransportMap[sid][t.period];
    if (!existing || new Date(t.updatedAt) > new Date(existing.updatedAt))
      studentTransportMap[sid][t.period] = t;
  }

  /* ── 5. Payments & allocations ── */
  const allPayments = await StudentPayment.find({
    studentId: { $in: studentIds },
    sessionId: toId(sessionId),
    paymentStatus: "SUCCESS",
  }).lean();

  const payStudentMap = {};
  for (const p of allPayments)
    payStudentMap[p._id.toString()] = p.studentId.toString();

  const allPaymentIds = allPayments.map((p) => p._id);
  const allAllocations = allPaymentIds.length
    ? await StudentPaymentAllocation.find({
        paymentId: { $in: allPaymentIds },
      }).lean()
    : [];

  const studentPaidMap = {};
  for (const a of allAllocations) {
    const sid = payStudentMap[a.paymentId.toString()];
    if (!sid) continue;
    studentPaidMap[sid] =
      (studentPaidMap[sid] || 0) + Number(a.allocatedAmount || 0);
  }

  /* ── 6. Build rows ── */
  const rows = students.map((student) => {
    const cid = student.currentClass?._id?.toString();
    const streamId = student.stream?.toString() || null;
    const stId = student._id.toString();

    const myInsts = allInstallments.filter((inst) => {
      const fs = fsById[inst.feeStructureId.toString()];
      return (
        fs &&
        fs.classId.toString() === cid &&
        (fs.streamId?.toString() || null) === streamId
      );
    });

    const myAdditional = additionalFees.filter((f) => {
      const fClass = f.classId?.toString() || null;
      const fStream = f.streamId?.toString() || null;
      return (
        (!fClass && !fStream) ||
        (fClass === cid && !fStream) ||
        (fClass === cid && fStream === streamId)
      );
    });

    const transportByPeriod = studentTransportMap[stId] || {};
    const tuitionTotal = myInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
    const additionalTotal = myAdditional.reduce(
      (s, f) => s + Number(f.amount || 0),
      0,
    );
    const transportTotal = Object.values(transportByPeriod).reduce(
      (s, t) => s + Number(t.amount || 0),
      0,
    );
    const grossFee = tuitionTotal + additionalTotal + transportTotal;

    const concession = calculateConcession({
      student,
      totalFee: grossFee,
      transportTotal,
    });
    const totalFee = parseFloat(Math.max(grossFee - concession, 0).toFixed(2));
    const paidAmount = parseFloat((studentPaidMap[stId] || 0).toFixed(2));
    const balanceAmount = parseFloat(
      Math.max(totalFee - paidAmount, 0).toFixed(2),
    );

    return {
      studentId: student.studentId,
      studentName:
        `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      fatherName: student.fatherName || "-",
      phone: student.phone || "-",
      className: student.currentClass?.name || "-",
      admissionDate: student.admissionDate
        ? new Date(student.admissionDate)
            .toLocaleDateString("en-GB")
            .split("/")
            .join("-")
        : student.createdAt
          ? new Date(student.createdAt)
              .toLocaleDateString("en-GB")
              .split("/")
              .join("-")
          : "-",
      totalFee,
      paidAmount,
      balanceAmount,
    };
  });

  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.studentName.localeCompare(b.studentName),
  );

  const totalRows = rows.length;
  const list = rows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(
      200,
      {
        list,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / perPage),
          currentPage,
          perPage,
        },
      },
      "New admission fee collection fetched",
    ),
  );
});
