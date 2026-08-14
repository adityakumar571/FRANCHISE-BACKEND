import mongoose from "mongoose";
import { getStudentEnrolmentModel }      from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getStudentPaymentModel }        from "../../../../models/tenant/master/StudentPayment.model.js";
import { getFeeStructureModel }          from "../../../../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel }        from "../../../../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel }         from "../../../../models/tenant/master/AdditionalFee.model.js";
import { getAdditionalFeeWaiverModel }   from "../../../../models/tenant/master/AdditionalFeeWaiver.model.js";
import { getTransportFeeModel }          from "../../../../models/tenant/master/TransportFee.model.js";
import { getTransportFeeWaiverModel }    from "../../../../models/tenant/master/TransportFeeWaiver.model.js";
import { getLateFeeModel }               from "../../../../models/tenant/master/LateFee.model.js";
import { getStudentPaymentAllocationModel } from "../../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { asyncHandler }                  from "../../../../utils/asyncHandler.js";
import { apiResponse }                   from "../../../../utils/apiResponse.js";

const feeOutstandingReport = asyncHandler(async (req, res) => {
  const db = req.db;

  const StudentEnrolment         = getStudentEnrolmentModel(db);
  const StudentPayment           = getStudentPaymentModel(db);
  const FeeStructure             = getFeeStructureModel(db);
  const FeeInstallment           = getFeeInstallmentModel(db);
  const AdditionalFee            = getAdditionalFeeModel(db);
  const AdditionalFeeWaiver      = getAdditionalFeeWaiverModel(db);
  const TransportFee             = getTransportFeeModel(db);
  const TransportFeeWaiver       = getTransportFeeWaiverModel(db);
  const LateFee                  = getLateFeeModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const { sessionId, classId, sectionId, page = 1, limit = 10 } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const currentPage = Number(page);
  const perPage     = Number(limit);
  const skip        = (currentPage - 1) * perPage;
  const sessionOId  = new mongoose.Types.ObjectId(sessionId);

  /* ── 1. Students ── */
  const enrollMatch = { session: sessionOId, status: "Studying" };
  if (classId && mongoose.Types.ObjectId.isValid(classId))
    enrollMatch.currentClass = new mongoose.Types.ObjectId(classId);
  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId))
    enrollMatch.currentSection = new mongoose.Types.ObjectId(sectionId);

  const students = await StudentEnrolment.find(enrollMatch)
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .lean();

  if (!students.length) {
    return res.status(200).json(new apiResponse(200, {
      list: [], pagination: { totalRows: 0, totalPages: 0, currentPage, perPage },
    }, "Fee outstanding report fetched"));
  }

  /* ── 2. FeeStructure → FeeInstallment (tuition) ── */
  const classIds = [...new Set(students.map(s => s.currentClass?._id?.toString()).filter(Boolean))];
  const feeStructures = await FeeStructure.find({
    sessionId: sessionOId,
    classId:   { $in: classIds.map(id => new mongoose.Types.ObjectId(id)) },
    isActive:  true,
  }).lean();

  const fsIds = feeStructures.map(fs => fs._id);

  const installments = fsIds.length
    ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean()
    : [];

  // Map: "classId__streamId" → tuition total
  const classTuitionMap = {};
  for (const fs of feeStructures) {
    const key = `${fs.classId}__${fs.streamId || "null"}`;
    if (!classTuitionMap[key]) classTuitionMap[key] = 0;
    installments
      .filter(i => i.feeStructureId.toString() === fs._id.toString())
      .forEach(i => { classTuitionMap[key] += Number(i.amount || 0); });
  }

  /* ── 3. Additional fees (global fetch for this session) ── */
  // Match same OR-clauses as StudentLedgerController:
  //   1. Global fees (classId null / missing)
  //   2. Class-specific (classId matches, streamId null / missing)
  //   3. Class+Stream-specific (if student has a stream)
  const additionalFees = await AdditionalFee.find({
    sessionId: sessionOId, isActive: true,
  }).lean();

  // Additional fee IDs — needed to bulk-fetch waivers
  const allAdditionalFeeIds = additionalFees.map(f => f._id);

  /* ── 4. All student IDs ── */
  const studentIds = students.map(s => s._id);

  /* ── 5. AdditionalFeeWaiver — bulk fetch for all students in one query ── */
  const additionalWaiverRecords = allAdditionalFeeIds.length
    ? await AdditionalFeeWaiver.find({
        studentId:      { $in: studentIds },
        additionalFeeId: { $in: allAdditionalFeeIds },
      }).lean()
    : [];

  // Map: "studentId__additionalFeeId" → waiverRecord
  const additionalWaiverMap = {};
  for (const w of additionalWaiverRecords) {
    const key = `${w.studentId}__${w.additionalFeeId}`;
    additionalWaiverMap[key] = w;
  }

  /* ── 6. Payments & allocations ── */
  const allPayments = await StudentPayment.find({
    studentId: { $in: studentIds },
    sessionId: sessionOId,
    paymentStatus: "SUCCESS",
  }).lean();

  const studentPaymentMap = {};
  for (const p of allPayments) {
    const sid = p.studentId.toString();
    if (!studentPaymentMap[sid]) studentPaymentMap[sid] = [];
    studentPaymentMap[sid].push(p._id);
  }

  const allPaymentIds = allPayments.map(p => p._id);
  const allAllocations = allPaymentIds.length
    ? await StudentPaymentAllocation.find({ paymentId: { $in: allPaymentIds } }).lean()
    : [];

  // Map: "studentId" → { referenceId → totalAllocated }
  // Built by linking paymentId → studentId via allPayments
  const paymentStudentMap = {};
  for (const p of allPayments) {
    paymentStudentMap[p._id.toString()] = p.studentId.toString();
  }

  const studentAllocMap = {}; // studentId → { refId → amount }
  for (const a of allAllocations) {
    const sid = paymentStudentMap[a.paymentId.toString()];
    if (!sid) continue;
    if (!studentAllocMap[sid]) studentAllocMap[sid] = {};
    const rid = a.referenceId.toString();
    studentAllocMap[sid][rid] = (studentAllocMap[sid][rid] || 0) + Number(a.allocatedAmount || 0);
  }

  /* ── 7. Transport fees — bulk fetch (include inactive for correct dedup) ── */
  const allTransportFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: sessionOId,
  }).lean();

  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const sid = t.studentId.toString();
    if (!studentTransportMap[sid]) studentTransportMap[sid] = [];
    studentTransportMap[sid].push(t);
  }

  // TransportFeeWaiver — bulk fetch for all transport fee IDs
  const allTransportFeeIds = allTransportFees.map(t => t._id);
  const transportWaiverRecords = allTransportFeeIds.length
    ? await TransportFeeWaiver.find({
        studentId:     { $in: studentIds },
        transportFeeId: { $in: allTransportFeeIds },
      }).lean()
    : [];

  // Map: "studentId__transportFeeId" → waiverRecord
  const transportWaiverMap = {};
  for (const w of transportWaiverRecords) {
    const key = `${w.studentId}__${w.transportFeeId}`;
    transportWaiverMap[key] = w;
  }

  /* ── 8. Late fees — bulk fetch for all students ── */
  const allLateFees = await LateFee.find({
    studentId: { $in: studentIds },
    sessionId: sessionOId,
    isWaived:  false,
    amount:    { $gt: 0 },
  }).lean();

  // Map: studentId → [lateFeeDocs]
  const studentLateFeeMap = {};
  for (const lf of allLateFees) {
    const sid = lf.studentId.toString();
    if (!studentLateFeeMap[sid]) studentLateFeeMap[sid] = [];
    studentLateFeeMap[sid].push(lf);
  }

  /* ── 9. Build class-wise summary ── */
  // Map: classId → { className, totalFee, totalPaid, balanceAmount, studentCount }
  const classMap = {};

  for (const student of students) {
    const cid      = student.currentClass?._id?.toString();
    const _rawStream = student.stream?._id?.toString() || student.stream?.toString() || null;
    const streamId = _rawStream && /^[a-f\d]{24}$/i.test(_rawStream) ? _rawStream : null;
    const stId     = student._id.toString();
    if (!cid) continue;

    const allocMap = studentAllocMap[stId] || {};

    /* — Tuition — */
    const tuitionKey   = `${cid}__${streamId || "null"}`;
    const tuitionTotal = classTuitionMap[tuitionKey] || 0;

    /* — Concession (applies ONLY to tuition) — */
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
    const netTuition    = Math.max(tuitionTotal - concessionAmount, 0);  // used via grossTotal - concessionAmount

    /* — Additional fees (waiver-adjusted for this student) — */
    // Mirror ledger $or logic:
    //   1. Global fee (classId null/missing) — applies to all students
    //   2. Class-specific (classId matches, streamId null/missing)
    //   3. Class+Stream-specific (classId matches, streamId matches)
    let grossAdditional  = 0;
    let waivedAdditional = 0;
    for (const f of additionalFees) {
      const fClass  = f.classId?.toString()  || null;
      const fStream = f.streamId?.toString() || null;

      const applies =
        (!fClass) ||                                          // global fee
        (fClass === cid && !fStream) ||                      // class-specific, no stream
        (fClass === cid && fStream === streamId && streamId); // class+stream specific

      if (!applies) continue;

      const waiverKey = `${stId}__${f._id}`;
      const waiver    = additionalWaiverMap[waiverKey];

      const isFullWaived = waiver ? waiver.isWaived : false;
      const waivedAmt    = isFullWaived
        ? Number(f.amount)
        : waiver ? Number(waiver.waivedAmount || 0) : 0;

      grossAdditional  += Number(f.amount);
      waivedAdditional += waivedAmt;
    }
    const netAdditional = Math.max(grossAdditional - waivedAdditional, 0); // used via grossTotal - totalWaived

    /* — Transport fees (dedup by period, waiver-adjusted) — */
    const transportFees = studentTransportMap[stId] || [];

    // Dedup transport by period: prefer paid > isActive > latest updatedAt
    const tByPeriod = {};
    for (const t of transportFees) {
      const p = t.period;
      if (!tByPeriod[p]) { tByPeriod[p] = t; continue; }
      const existing = tByPeriod[p];
      const tPaid  = (allocMap[t._id.toString()]        || 0) > 0;
      const ePaid  = (allocMap[existing._id.toString()] || 0) > 0;
      if (tPaid && !ePaid)   { tByPeriod[p] = t; continue; }
      if (!tPaid && ePaid)     continue;
      if (t.isActive && !existing.isActive) { tByPeriod[p] = t; continue; }
      if (!t.isActive && existing.isActive)   continue;
      if (new Date(t.updatedAt) > new Date(existing.updatedAt)) tByPeriod[p] = t;
    }

    let grossTransport  = 0;
    let waivedTransport = 0;
    for (const t of Object.values(tByPeriod)) {
      const waiverKey    = `${stId}__${t._id}`;
      const waiver       = transportWaiverMap[waiverKey];
      const isFullWaived = waiver ? waiver.isWaived : false;
      const waivedAmt    = isFullWaived
        ? Number(t.amount)
        : waiver ? Number(waiver.waivedAmount || 0) : 0;

      grossTransport  += Number(t.amount);
      waivedTransport += waivedAmt;
    }
    const netTransport = Math.max(grossTransport - waivedTransport, 0); // used via grossTotal - totalWaived

    /* — Late fee due (non-waived, not fully paid) — */
    const lateFeeRecords = studentLateFeeMap[stId] || [];
    let grossLateFee = 0;
    let waivedLateFee = 0;
    let netLateFee = 0;
    for (const lf of lateFeeRecords) {
      const lfTotal  = Number(lf.amount);
      const lfPaid   = allocMap[lf._id.toString()] || 0;
      const lfWaived = Number(lf.waivedAmount || 0);
      const isFullyWaived = lf.isWaived || lfWaived >= lfTotal;

      grossLateFee  += lfTotal;
      waivedLateFee += isFullyWaived ? lfTotal : lfWaived;
      if (!isFullyWaived) {
        netLateFee += Math.max(0, lfTotal - lfPaid - lfWaived);
      }
    }

    /* ─────────────────────────────────────────────────────────────────────
       Net Payable = Gross - Concession - Waived   (mirrors ledger exactly)
       Gross      = tuitionTotal + grossAdditional + grossTransport + grossLateFee
       Concession = concessionAmount  (tuition only)
       Waived     = waivedAdditional + waivedTransport + waivedLateFee
    ───────────────────────────────────────────────────────────────────── */
    const grossTotal  = tuitionTotal + grossAdditional + grossTransport + grossLateFee;
    const totalWaived = waivedAdditional + waivedTransport + waivedLateFee;
    const netFee      = parseFloat(Math.max(grossTotal - concessionAmount - totalWaived, 0).toFixed(2));

    /* ─────────────────────────────────────────────────────────────────────
       Total Paid = all allocations for non-waived items, capped at netFee
       (mirrors ledger: regularPaid + lateFeesPaid, capped at netPayable)
    ───────────────────────────────────────────────────────────────────── */
    // Collect ALL additional fee IDs that apply to this student
    const applicableAdditionalIds = new Set();
    for (const f of additionalFees) {
      const fClass  = f.classId?.toString()  || null;
      const fStream = f.streamId?.toString() || null;
      const applies =
        (!fClass) ||
        (fClass === cid && !fStream) ||
        (fClass === cid && fStream === streamId && streamId);
      if (applies) applicableAdditionalIds.add(f._id.toString());
    }

    // Collect applicable transport fee IDs (deduplicated)
    const applicableTransportIds = new Set(Object.values(tByPeriod).map(t => t._id.toString()));

    // Collect applicable tuition installment IDs
    const tuitionKey2  = `${cid}__${streamId || "null"}`;
    // We need installment IDs for this student's class/stream
    const applicableFsIds = feeStructures
      .filter(fs => {
        const k = `${fs.classId}__${fs.streamId || "null"}`;
        return k === tuitionKey2;
      })
      .map(fs => fs._id.toString());
    const applicableInstallmentIds = new Set(
      installments
        .filter(i => applicableFsIds.includes(i.feeStructureId.toString()))
        .map(i => i._id.toString())
    );

    const lateFeeIds  = new Set(lateFeeRecords.map(lf => lf._id.toString()));

    let totalPaidRaw = 0;
    for (const [rid, amt] of Object.entries(allocMap)) {
      if (
        applicableInstallmentIds.has(rid) ||
        applicableAdditionalIds.has(rid)  ||
        applicableTransportIds.has(rid)   ||
        lateFeeIds.has(rid)
      ) {
        totalPaidRaw += amt;
      }
    }
    const totalPaid = parseFloat(Math.min(totalPaidRaw, netFee).toFixed(2));

    /* — Outstanding Balance — */
    const balance = parseFloat(Math.max(netFee - totalPaid, 0).toFixed(2));

    /* — Accumulate into class-level map — */
    if (!classMap[cid]) {
      classMap[cid] = {
        className:     student.currentClass?.name || "",
        studentCount:  0,
        totalFee:      0,
        totalPaid:     0,
        balanceAmount: 0,
      };
    }
    classMap[cid].studentCount  += 1;
    classMap[cid].totalFee      += netFee;      // net regular payable (= ledger Net Payable)
    classMap[cid].totalPaid     += totalPaid;   // regular fee paid only (= ledger Total Paid)
    classMap[cid].balanceAmount += balance;     // regularBalance + lateFee due (= ledger Outstanding)
  }

  /* ── 10. Sort & paginate ── */
  const allRows = Object.values(classMap)
    .sort((a, b) => a.className.localeCompare(b.className))
    .map(row => ({
      className:     row.className,
      studentCount:  row.studentCount,
      totalFee:      parseFloat(row.totalFee.toFixed(2)),
      totalPaid:     parseFloat(row.totalPaid.toFixed(2)),
      balanceAmount: parseFloat(row.balanceAmount.toFixed(2)),
    }));

  const totalRows  = allRows.length;
  const totalPages = Math.ceil(totalRows / perPage);
  const list       = allRows.slice(skip, skip + perPage);

  res.status(200).json(new apiResponse(200, {
    list,
    pagination: { totalRows, totalPages, currentPage, perPage },
  }, "Fee outstanding report fetched successfully"));
});

export { feeOutstandingReport };
