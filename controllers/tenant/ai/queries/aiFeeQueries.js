// queries/aiFeeQueries.js
import mongoose from "mongoose";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getStudentPaymentModel }   from "../../../../models/tenant/master/StudentPayment.model.js";
import { getFeeStructureModel }     from "../../../../models/tenant/master/FeeStructure.model.js";
import { inr, getCurrentSession, getISTDateBounds } from "./aiQueryHelpers.js";

/* ── FEE: Today's Collection ── */
export async function queryFeesToday(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const { todayStart, todayEnd, istDateDisplay } = getISTDateBounds();
  const StudentPayment = getStudentPaymentModel(db);

  const result = await StudentPayment.aggregate([
    {
      $match: {
        sessionId: new mongoose.Types.ObjectId(String(session._id)),
        paymentStatus: "SUCCESS",
        paymentDate: { $gte: todayStart, $lte: todayEnd }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amountPaid" },
        totalTransactions: { $sum: 1 }
      }
    }
  ]);

  const data = result[0] || { totalAmount: 0, totalTransactions: 0 };

  return {
    type: "fee_today",
    date: istDateDisplay,
    totalCollection: data.totalAmount,
    totalTransactions: data.totalTransactions,
    formatted: `आज (${istDateDisplay}) की fee collection: ${inr(data.totalAmount)} (${data.totalTransactions} transactions)`
  };
}

/* ── FEE: Total Summary ── */
export async function queryFeeSummary(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const StudentPayment = getStudentPaymentModel(db);
  const sid = new mongoose.Types.ObjectId(String(session._id));

  const [totalResult, modeResult] = await Promise.all([
    StudentPayment.aggregate([
      { $match: { sessionId: sid, paymentStatus: "SUCCESS" } },
      { $group: { _id: null, total: { $sum: "$amountPaid" }, count: { $sum: 1 } } }
    ]),
    StudentPayment.aggregate([
      { $match: { sessionId: sid, paymentStatus: "SUCCESS" } },
      { $group: { _id: "$paymentMode", amount: { $sum: "$amountPaid" }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } }
    ])
  ]);

  const total = totalResult[0] || { total: 0, count: 0 };
  const byMode = modeResult.map(m => `${m._id}: ${inr(m.amount)} (${m.count} txn)`);

  return {
    type: "fee_summary",
    totalCollected: total.total,
    totalTransactions: total.count,
    byPaymentMode: modeResult,
    formatted: `Session total: ${inr(total.total)} (${total.count} transactions)\nPayment modes:\n${byMode.map(m => `• ${m}`).join('\n')}`
  };
}

/* ══════════════════════════════════════════════════════════════════
   FEE DEFAULTERS: Class-wise student list with names
   Uses EXACT same logic as newReportsController → classSectionDefaulters
   (tuition + additional + transport + late fee, concession applied)
══════════════════════════════════════════════════════════════════ */
export async function queryFeeDefaultersByClass(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const sid           = new mongoose.Types.ObjectId(String(session._id));
  const { className } = params;

  // Import production helpers
  const {
    calculateConcession,
    buildStudentPeriodMap,
    buildSequentialConcessionMap,
  } = await import("../../../../utils/feeHelper.js");
  const { getFeeInstallmentModel }           = await import("../../../../models/tenant/master/FeeInstallment.model.js");
  const { getAdditionalFeeModel }            = await import("../../../../models/tenant/master/AdditionalFee.model.js");
  const { getAdditionalFeeWaiverModel }      = await import("../../../../models/tenant/master/AdditionalFeeWaiver.model.js");
  const { getTransportFeeModel }             = await import("../../../../models/tenant/master/TransportFee.model.js");
  const { getStudentPaymentAllocationModel } = await import("../../../../models/tenant/master/StudentPaymentAllocation.model.js");
  const { getLateFeeModel }                  = await import("../../../../models/tenant/master/LateFee.model.js");
  const { getTransportFeeWaiverModel }       = await import("../../../../models/tenant/master/TransportFeeWaiver.model.js");

  const StudentEnrolment  = getStudentEnrolmentModel(db);
  const FeeStructure      = getFeeStructureModel(db);
  const FeeInstallment    = getFeeInstallmentModel(db);
  const AdditionalFee     = getAdditionalFeeModel(db);
  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(db);
  const TransportFee      = getTransportFeeModel(db);
  const TransportFeeWaiver  = getTransportFeeWaiverModel(db);
  const StudentPayment    = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const LateFee           = getLateFeeModel(db);

  // Academic period helpers — same as production
  const MONTHLY = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH"];
  const QUARTERLY = { "APR-JUN":["APRIL","MAY","JUNE"],"JUL-SEP":["JULY","AUGUST","SEPTEMBER"],"OCT-DEC":["OCTOBER","NOVEMBER","DECEMBER"],"JAN-MAR":["JANUARY","FEBRUARY","MARCH"] };
  const CALENDAR  = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const currentMonth = CALENDAR[new Date().getMonth()];
  const currentIdx   = MONTHLY.indexOf(currentMonth);
  const isPeriodDue  = (period) => {
    if (QUARTERLY[period]) return QUARTERLY[period].some(m => MONTHLY.indexOf(m) <= currentIdx);
    const idx = MONTHLY.indexOf(period);
    return idx === -1 ? true : idx <= currentIdx;
  };

  /* ── 1. Students ── */
  const matchQuery = { session: sid, status: "Studying" };
  if (className) {
    const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
    const Class = getClassModel(db);
    const cls = await Class.findOne({ name: { $regex: new RegExp(`^${className}$`, "i") }, isActive: true }).lean()
              || await Class.findOne({ name: { $regex: new RegExp(className, "i") }, isActive: true }).lean();
    if (!cls) return { type: "fee_defaulters_class", students: [], total: 0, formatted: `"${className}" class nahi mili.` };
    matchQuery.currentClass = cls._id;
  }

  const students = await StudentEnrolment.find(matchQuery)
    .populate("currentClass",   "name")
    .populate("currentSection", "name")
    .lean();

  if (!students.length) return {
    type: "fee_defaulters_class", students: [], total: 0,
    formatted: className ? `"${className}" class mein koi student nahi mila.` : "Koi active student nahi mila.",
  };

  /* ── 2. Bulk fetch all fee data ── */
  const studentIds = students.map(s => s._id);
  const classIds   = [...new Set(students.map(s => s.currentClass?._id?.toString()).filter(Boolean))];

  const [allStructures, additionalFees, allPayments, allTransportFees, allLateFees] = await Promise.all([
    FeeStructure.find({ sessionId: sid, classId: { $in: classIds.map(id => new mongoose.Types.ObjectId(id)) }, isActive: true }).lean(),
    AdditionalFee.find({ sessionId: sid, isActive: true }).lean(),
    StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }).lean(),
    TransportFee.find({ studentId: { $in: studentIds }, sessionId: sid }).lean(),
    LateFee.find({ studentId: { $in: studentIds }, sessionId: sid, isWaived: false, amount: { $gt: 0 } }).lean(),
  ]);

  const fsIds = allStructures.map(f => f._id);
  const allInstallments = fsIds.length ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean() : [];
  const allPaymentIds   = allPayments.map(p => p._id);
  const allAllocations  = allPaymentIds.length ? await StudentPaymentAllocation.find({ paymentId: { $in: allPaymentIds } }).lean() : [];

  // Paid transport ref ids (for dedup)
  const paidTransportRefIds = new Set(
    allAllocations.filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0).map(a => a.referenceId.toString())
  );

  // Late fee paid allocations
  const lateFeeIds = allLateFees.map(lf => lf._id);
  const lateFeeAllocs = lateFeeIds.length && allPaymentIds.length
    ? await StudentPaymentAllocation.find({ paymentId: { $in: allPaymentIds }, feeType: "LATE_FEE", referenceId: { $in: lateFeeIds } }).lean()
    : [];
  const lateFeePaidMap = {};
  for (const a of lateFeeAllocs) {
    const rid = a.referenceId.toString();
    lateFeePaidMap[rid] = (lateFeePaidMap[rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // Additional fee waivers
  const addlIds = additionalFees.map(f => f._id);
  const addlWaivers = addlIds.length
    ? await AdditionalFeeWaiver.find({ studentId: { $in: studentIds }, additionalFeeId: { $in: addlIds } }).lean()
    : [];
  const studentAddlWaiverMap = {};
  for (const w of addlWaivers) {
    const s = w.studentId.toString();
    if (!studentAddlWaiverMap[s]) studentAddlWaiverMap[s] = {};
    studentAddlWaiverMap[s][w.additionalFeeId.toString()] = w;
  }

  // Per-student maps
  const studentPaymentMap = {};
  for (const p of allPayments) {
    const s = p.studentId.toString();
    if (!studentPaymentMap[s]) studentPaymentMap[s] = [];
    studentPaymentMap[s].push(p._id);
  }
  const allocationByPayment = {};
  for (const a of allAllocations) {
    const pid = a.paymentId.toString();
    if (!allocationByPayment[pid]) allocationByPayment[pid] = [];
    allocationByPayment[pid].push(a);
  }
  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const s = t.studentId.toString();
    if (!studentTransportMap[s]) studentTransportMap[s] = [];
    studentTransportMap[s].push(t);
  }
  const studentLateFineMap = {};
  for (const lf of allLateFees) {
    const s    = lf.studentId.toString();
    const paid = lateFeePaidMap[lf._id.toString()] || 0;
    const due  = Math.max(0, Number(lf.amount || 0) - paid);
    studentLateFineMap[s] = (studentLateFineMap[s] || 0) + due;
  }

  const fsById = Object.fromEntries(allStructures.map(f => [f._id.toString(), f]));

  /* ── 3. Per-student calculation ── */
  const defaulters = [];

  for (const student of students) {
    const cid      = student.currentClass?._id?.toString(); if (!cid) continue;
    const _rawSt   = student.stream?._id?.toString() || student.stream?.toString() || null;
    const streamId = _rawSt && /^[a-f\d]{24}$/i.test(_rawSt) ? _rawSt : null;
    const stId     = student._id.toString();

    const myInsts = allInstallments.filter(i => {
      const fs = fsById[i.feeStructureId.toString()];
      return fs && fs.classId.toString() === cid && (fs.streamId?.toString() || null) === streamId;
    });
    const myAddl = additionalFees.filter(f => {
      const fc = f.classId?.toString() || null; const fs = f.streamId?.toString() || null;
      return (!fc && !fs) || (fc === cid && !fs) || (fc === cid && fs === streamId);
    });
    const addlWaiverForStudent = studentAddlWaiverMap[stId] || {};
    const myAddlAfterWaiver = myAddl.map(f => {
      const wr = addlWaiverForStudent[f._id.toString()];
      const waivedAmt = wr ? (wr.isWaived ? Number(f.amount || 0) : Number(wr.waivedAmount || 0)) : 0;
      return { ...f, amount: Math.max(Number(f.amount || 0) - waivedAmt, 0) };
    }).filter(f => f.amount > 0);

    // Transport dedup
    const rawTransport = studentTransportMap[stId] || [];
    const transportByPeriod = {};
    for (const t of rawTransport) {
      if (!transportByPeriod[t.period]) { transportByPeriod[t.period] = t; continue; }
      const existing = transportByPeriod[t.period];
      const tPaid = paidTransportRefIds.has(t._id.toString());
      const ePaid = paidTransportRefIds.has(existing._id.toString());
      if (tPaid && !ePaid) { transportByPeriod[t.period] = t; continue; }
      if (!tPaid && ePaid) continue;
      if (t.isActive && !existing.isActive) { transportByPeriod[t.period] = t; continue; }
      if (!t.isActive && existing.isActive) continue;
      if (new Date(t.updatedAt) > new Date(existing.updatedAt)) transportByPeriod[t.period] = t;
    }

    // Alloc map for this student
    const paymentIds = studentPaymentMap[stId] || [];
    const allocMapCS = {};
    for (const pid of paymentIds) {
      for (const a of allocationByPayment[pid.toString()] || []) {
        const rid = a.referenceId.toString();
        allocMapCS[rid] = (allocMapCS[rid] || 0) + Number(a.allocatedAmount || 0);
      }
    }

    const tuitionTotal   = myInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
    const transportTotal = Object.values(transportByPeriod).reduce((s, t) => s + Number(t.amount || 0), 0);
    const concession     = calculateConcession({ student, totalFee: tuitionTotal, transportTotal });

    const periodMap = buildStudentPeriodMap({ myInsts, myAdditional: myAddlAfterWaiver, transportByPeriod, allocMap: allocMapCS });

    // Tuition-only period map for sequential concession
    const tuitionPeriodMap = {};
    for (const inst of myInsts) {
      const per = inst.period;
      if (!tuitionPeriodMap[per]) tuitionPeriodMap[per] = { totalFee: 0, paidAmount: 0 };
      tuitionPeriodMap[per].totalFee += Number(inst.amount || 0);
    }
    const periodConcession = buildSequentialConcessionMap({ periodMap: tuitionPeriodMap, concession });

    let currentDueBalance = 0;
    let currentTransportBalance = 0;
    for (const [per, vals] of Object.entries(periodMap)) {
      if (!isPeriodDue(per)) continue;
      const rawDue      = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
      if (rawDue <= 0) continue;
      const concForPer  = periodConcession[per] || 0;
      const adjustedDue = parseFloat(Math.max(rawDue - concForPer, 0).toFixed(2));
      if (adjustedDue <= 0) continue;
      currentDueBalance += adjustedDue;
      const t = transportByPeriod[per];
      if (t) {
        const tPaid = allocMapCS[t._id.toString()] || 0;
        currentTransportBalance += parseFloat(Math.max(Number(t.amount || 0) - tPaid, 0).toFixed(2));
      }
    }

    const lateFineBalance = studentLateFineMap[stId] || 0;
    if (currentDueBalance <= 0 && lateFineBalance <= 0) continue;

    const grandTotal = parseFloat((currentDueBalance + lateFineBalance).toFixed(2));
    const tuitionAmt = parseFloat(Math.max(currentDueBalance - currentTransportBalance, 0).toFixed(2));

    defaulters.push({
      firstName:    student.firstName,
      middleName:   student.middleName,
      lastName:     student.lastName,
      rollNumber:   student.rollNumber,
      currentClass: student.currentClass,
      currentSection: student.currentSection,
      tuitionDue:   tuitionAmt,
      transportDue: currentTransportBalance,
      lateFineDue:  lateFineBalance,
      remainingDue: grandTotal,
    });
  }

  if (!defaulters.length) return {
    type: "fee_defaulters_class", students: [], total: 0,
    formatted: className
      ? `"${className}" class mein koi fee defaulter nahi hai. 🎉`
      : "Is session mein koi fee defaulter nahi hai. 🎉",
  };

  defaulters.sort((a, b) => {
    const ca = a.currentClass?.name || ""; const cb = b.currentClass?.name || "";
    return ca.localeCompare(cb) || (a.firstName || "").localeCompare(b.firstName || "");
  });

  const MAX_SHOW = 25;
  const shown = defaulters.slice(0, MAX_SHOW);
  const extra = defaulters.length - shown.length;
  const totalStudents = students.length;

  const lines = shown.map((s, i) => {
    const name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ").trim() || "Unknown";
    const roll = s.rollNumber ? ` (Roll: ${s.rollNumber})` : "";
    const cls  = s.currentClass?.name || "";
    const sec  = s.currentSection?.name || "";
    const parts = [cls && `${cls}${sec ? "-" + sec : ""}`].filter(Boolean).join(", ");
    return `${i + 1}. **${name}**${roll}${parts ? " — " + parts : ""} — Due: **${inr(s.remainingDue)}**${s.transportDue > 0 ? ` (Transport: ${inr(s.transportDue)})` : ""}`;
  });
  if (extra > 0) lines.push(`...aur ${extra} aur students`);

  const totalDue = defaulters.reduce((s, d) => s + d.remainingDue, 0);
  const heading  = className
    ? `**${className} — Fee Defaulters (${defaulters.length}/${totalStudents} students):**`
    : `**Fee Defaulters — All Classes (${defaulters.length} students):**`;

  return {
    type:         "fee_defaulters_class",
    className:    className || "all",
    total:        defaulters.length,
    totalStudents,
    totalDue,
    students:     shown,
    formatted:    `${heading}\n${lines.join("\n")}\n\n**Total Due: ${inr(totalDue)}**`,
  };
}

/* ══════════════════════════════════════════════════════════════════
   FEE HEADS — All fee heads for current session
   Shows: feeHeadName, class, totalAmount, installmentType,
          totalInstallments, installment-wise breakdown
   ALSO includes: additionalfees (Lab, Exam, Activity fees etc.)
══════════════════════════════════════════════════════════════════ */
export async function queryFeeHeads(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const sid = new mongoose.Types.ObjectId(String(session._id));

  const FeeStructure   = getFeeStructureModel(db);
  const FeeInstallment = db.models.FeeInstallment ||
    (await import("../../../../models/tenant/master/FeeInstallment.model.js"))
      .getFeeInstallmentModel(db);
  const AdditionalFee  = db.models.AdditionalFee ||
    (await import("../../../../models/tenant/master/AdditionalFee.model.js"))
      .getAdditionalFeeModel(db);

  const { className } = params;

  // Step 1: Get all active FeeStructures, populated with class & installmentType
  const structures = await FeeStructure.find({
    sessionId: sid,
    isActive: true,
  })
    .populate("classId",        "name")
    .populate("installmentType","name")
    .lean();

  // Step 2: Optional class filter for tuition heads
  let filtered = structures;
  if (className) {
    filtered = structures.filter(s =>
      (s.classId?.name || "").toLowerCase().includes(className.toLowerCase())
    );
  }

  // Step 3: Fetch installments for each filtered tuition structure
  const structureIds = filtered.map(s => s._id);
  const allInstallments = structureIds.length
    ? await FeeInstallment.find(
        { feeStructureId: { $in: structureIds } },
        { feeStructureId: 1, period: 1, amount: 1, dueDate: 1, installmentNo: 1 }
      ).sort({ installmentNo: 1 }).lean()
    : [];

  // Map: structureId → installments[]
  const instMap = {};
  for (const inst of allInstallments) {
    const key = String(inst.feeStructureId);
    if (!instMap[key]) instMap[key] = [];
    instMap[key].push(inst);
  }

  // Step 4: Fetch additional fees — class-specific + global (classId = null)
  let additionalQuery = { sessionId: sid, isActive: true };
  let addlFees = [];

  if (className) {
    // For class-specific query: get fees for this class + global fees (null classId)
    // First find the classId ObjectId
    const classDoc = filtered[0]?.classId;  // already populated
    if (classDoc?._id) {
      addlFees = await AdditionalFee.find({
        sessionId: sid,
        isActive: true,
        $or: [
          { classId: classDoc._id },
          { classId: null },
        ],
      }).populate("classId", "name").lean();
    } else {
      // Class not found in feestructures — try to find class by name
      const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
      const Class = getClassModel(db);
      const classRec = await Class.findOne({
        name: { $regex: new RegExp(className, "i") },
        isActive: true,
      }).lean();
      if (classRec) {
        addlFees = await AdditionalFee.find({
          sessionId: sid,
          isActive: true,
          $or: [
            { classId: classRec._id },
            { classId: null },
          ],
        }).populate("classId", "name").lean();
      }
    }
  } else {
    // All classes — get all additional fees
    addlFees = await AdditionalFee.find(additionalQuery)
      .populate("classId", "name")
      .lean();
  }

  // Step 5: Build tuition head map
  const headMap = {};
  for (const s of filtered) {
    const head     = s.feeHeadName || "Unknown";
    const cls      = s.classId?.name || "Unknown";
    const instType = s.installmentType?.name || "N/A";
    const insts    = instMap[String(s._id)] || [];

    if (!headMap[head]) headMap[head] = [];
    headMap[head].push({
      class:             cls,
      feeCategory:       "Tuition",
      totalAmount:       s.totalAmount,
      installmentType:   instType,
      totalInstallments: s.totalInstallments,
      installments:      insts.map(i => ({ period: i.period, amount: i.amount })),
    });
  }

  // Step 6: Build additional fee map
  const addlHeadMap = {};
  for (const a of addlFees) {
    const head = a.feeName || "Unknown";
    const cls  = a.classId?.name || "All Classes";

    if (!addlHeadMap[head]) addlHeadMap[head] = [];
    // Avoid duplicates per class
    const exists = addlHeadMap[head].find(e => e.class === cls && e.period === a.period);
    if (!exists) {
      addlHeadMap[head].push({
        class:        cls,
        feeCategory:  "Additional",
        feeType:      a.feeType,
        amount:       a.amount,
        period:       a.period,
      });
    }
  }

  const noTuition    = filtered.length === 0;
  const noAdditional = addlFees.length === 0;

  if (noTuition && noAdditional) {
    return {
      type:      "fee_heads",
      heads:     {},
      addlHeads: {},
      formatted: className
        ? `"${className}" class ke liye koi fee head nahi mila.`
        : "Is session mein koi fee structure nahi mila.",
    };
  }

  // Step 7: Build formatted output
  const tuitionHeadNames = Object.keys(headMap).sort();
  const addlHeadNames    = Object.keys(addlHeadMap).sort();

  const tuitionLines = tuitionHeadNames.map(head => {
    const entries = headMap[head];
    const classes = [...new Set(entries.map(e => e.class))].join(", ");
    const amounts = [...new Set(entries.map(e => e.totalAmount))];
    const amtStr  = amounts.length === 1
      ? inr(amounts[0])
      : amounts.map(a => inr(a)).join(" / ");
    const type    = entries[0]?.installmentType || "N/A";
    return `• **${head}** — ${amtStr} (${type})${className ? "" : ` — Classes: ${classes}`}`;
  });

  const addlLines = addlHeadNames.map(head => {
    const entries = addlHeadMap[head];
    const cls     = [...new Set(entries.map(e => e.class))].join(", ");
    const amounts = [...new Set(entries.map(e => e.amount))];
    const amtStr  = amounts.length === 1
      ? inr(amounts[0])
      : amounts.map(a => inr(a)).join(" / ");
    const type    = entries[0]?.feeType || "";
    return `• **${head}** — ${amtStr} (${type})${className ? "" : ` — Classes: ${cls}`}`;
  });

  // Installment detail (only for small result sets)
  const showDetail = filtered.length <= 8;
  const detailLines = showDetail
    ? tuitionHeadNames.flatMap(head =>
        headMap[head].flatMap(e => {
          if (!e.installments.length) return [];
          const instStr = e.installments.map(i => `${i.period}: ${inr(i.amount)}`).join(", ");
          return [`  ${e.class} → ${instStr}`];
        })
      )
    : [];

  const sessionLabel = session.sessionName || session.name || "Current Session";
  const classLabel   = className ? ` — ${className} Class` : "";

  const lines = [
    `**Fee Heads${classLabel} — ${sessionLabel}** 📋`,
    "",
  ];

  if (tuitionLines.length) {
    lines.push("**📚 Tuition Fees:**");
    lines.push(...tuitionLines);
  }

  if (addlLines.length) {
    lines.push("");
    lines.push("**➕ Additional Fees:**");
    lines.push(...addlLines);
  }

  if (showDetail && detailLines.length) {
    lines.push("", "**Installment Breakdown:**");
    lines.push(...detailLines);
  }

  const totalHeads = tuitionHeadNames.length + addlHeadNames.length;

  return {
    type:          "fee_heads",
    sessionId:     String(session._id),
    sessionName:   sessionLabel,
    totalHeads,
    tuitionHeads:  tuitionHeadNames.length,
    additionalHeads: addlHeadNames.length,
    heads:         headMap,
    addlHeads:     addlHeadMap,
    formatted:     lines.join("\n"),
  };
}

/* ══════════════════════════════════════════════════════════════════
   FEE OVERVIEW — Dashboard-equivalent (supports class filter)
   Expected Fees, Collected Fees, Pending Fees, Collection Rate
   Uses EXACT same logic as DashboardController
══════════════════════════════════════════════════════════════════ */
export async function queryFeeOverview(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const sid = new mongoose.Types.ObjectId(String(session._id));

  // Import all required models & helpers
  const { getFeeInstallmentModel }              = await import("../../../../models/tenant/master/FeeInstallment.model.js");
  const { getStudentPaymentAllocationModel }    = await import("../../../../models/tenant/master/StudentPaymentAllocation.model.js");
  const { getAdditionalFeeModel }               = await import("../../../../models/tenant/master/AdditionalFee.model.js");
  const { getTransportFeeModel }                = await import("../../../../models/tenant/master/TransportFee.model.js");
  const { getLateFeeModel }                     = await import("../../../../models/tenant/master/LateFee.model.js");
  const { getAdditionalFeeWaiverModel }         = await import("../../../../models/tenant/master/AdditionalFeeWaiver.model.js");
  const { getTransportFeeWaiverModel }          = await import("../../../../models/tenant/master/TransportFeeWaiver.model.js");
  const { calculateConcession, buildStudentPeriodMap, buildSequentialConcessionMap } =
    await import("../../../../utils/feeHelper.js");

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const FeeStructure     = getFeeStructureModel(db);
  const FeeInstallment   = getFeeInstallmentModel(db);
  const StudentPayment   = getStudentPaymentModel(db);
  const PaymentAlloc     = getStudentPaymentAllocationModel(db);
  const AdditionalFee    = getAdditionalFeeModel(db);
  const TransportFee     = getTransportFeeModel(db);
  const LateFee          = getLateFeeModel(db);
  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(db);

  // Period helpers — same as newReportsController / feeDefaulterReport
  const PERIOD_ORDER = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH","APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR"];
  const QUARTERLY    = { "APR-JUN":["APRIL","MAY","JUNE"],"JUL-SEP":["JULY","AUGUST","SEPTEMBER"],"OCT-DEC":["OCTOBER","NOVEMBER","DECEMBER"],"JAN-MAR":["JANUARY","FEBRUARY","MARCH"] };

  // Support explicit tillMonth param (e.g. "pending fee till July")
  // Falls back to current calendar month if not provided
  const CALENDAR_MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const resolvedTillMonth = (params.tillMonth && CALENDAR_MONTHS.includes(params.tillMonth))
    ? params.tillMonth
    : CALENDAR_MONTHS[new Date().getMonth()];

  const isPeriodDue = (period) => {
    const monthly = PERIOD_ORDER.slice(0, 12);   // first 12 = monthly names
    const curIdx  = monthly.indexOf(resolvedTillMonth);
    if (curIdx === -1) return true;
    if (QUARTERLY[period]) return QUARTERLY[period].some(m => monthly.indexOf(m) <= curIdx);
    const pIdx = monthly.indexOf(period);
    return pIdx === -1 ? true : pIdx <= curIdx;
  };

  // ── Resolve className to classId if provided ──
  const { className } = params;
  let filterClassId   = null;
  let resolvedClassName = null;

  if (className) {
    const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
    const Class = getClassModel(db);

    // Try exact match first, then partial
    let classDoc = await Class.findOne({
      name: { $regex: new RegExp(`^${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      isActive: true,
    }).lean();
    if (!classDoc) {
      classDoc = await Class.findOne({
        name: { $regex: new RegExp(className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        isActive: true,
      }).lean();
    }
    if (classDoc) {
      filterClassId     = classDoc._id;
      resolvedClassName = classDoc.name;
    } else {
      return {
        type: "fee_overview", className,
        expectedFees: 0, collectedFees: 0, pendingFees: 0, pendingCount: 0, collectionRate: 0,
        formatted: `"${className}" class nahi mili. Please class name check karein.`,
      };
    }
  }

  // Fetch studying students — with optional class filter
  const studentQuery = {
    session: sid,
    status:  "Studying",
    ...(filterClassId ? { currentClass: filterClassId } : {}),
  };

  const students = await StudentEnrolment.find(
    studentQuery,
    "_id currentClass currentSection stream streamId discount discountType fullFeeConcession fullFeeExceptTransport"
  ).lean();

  if (!students.length) return {
    type: "fee_overview",
    className: resolvedClassName,
    expectedFees: 0, collectedFees: 0, pendingFees: 0,
    pendingCount: 0, collectionRate: 0,
    formatted: `${resolvedClassName ? `**${resolvedClassName}** class mein` : "Is session mein"} koi active student nahi hai.`
  };

  const studentIds = students.map(s => s._id);

  // Bulk fetch everything
  const [allStructures, allAddl, allTransport, allPayments] = await Promise.all([
    FeeStructure.find({ sessionId: sid, isActive: true }).lean(),
    AdditionalFee.find({ sessionId: sid, isActive: true }).lean(),
    TransportFee.find({ studentId: { $in: studentIds }, sessionId: sid }).lean(),
    StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }, { _id: 1, studentId: 1, amountPaid: 1 }).lean(),
  ]);

  const fsIds    = allStructures.map(s => s._id);
  const fsById   = Object.fromEntries(allStructures.map(s => [s._id.toString(), s]));
  const allInst  = fsIds.length ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean() : [];
  const payIds   = allPayments.map(p => p._id);
  const allAllocs = payIds.length ? await PaymentAlloc.find({ paymentId: { $in: payIds } }).lean() : [];

  // Late fees
  const allLateFees = studentIds.length
    ? await LateFee.find({ studentId: { $in: studentIds }, sessionId: sid, isWaived: false, amount: { $gt: 0 } }).lean()
    : [];

  // Build studentId → alloc map
  const payStudentMap = Object.fromEntries(allPayments.map(p => [p._id.toString(), p.studentId.toString()]));
  const studentAllocMap = {};
  for (const a of allAllocs) {
    const sId = payStudentMap[a.paymentId.toString()];
    if (!sId) continue;
    const rid = a.referenceId.toString();
    if (!studentAllocMap[sId]) studentAllocMap[sId] = {};
    studentAllocMap[sId][rid] = (studentAllocMap[sId][rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // Late fee alloc map
  const lfAllocMap = {};
  for (const a of allAllocs.filter(a => a.feeType === "LATE_FEE")) {
    const rid = a.referenceId.toString();
    lfAllocMap[rid] = (lfAllocMap[rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // studentId → transport by period (deduped: paid > isActive > latest updatedAt)
  const paidTransportRefIds = new Set(
    allAllocs.filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0).map(a => a.referenceId.toString())
  );
  const studentTransport = {};
  for (const t of allTransport) {
    const sId = t.studentId.toString();
    if (!studentTransport[sId]) studentTransport[sId] = {};
    const existing = studentTransport[sId][t.period];
    if (!existing) { studentTransport[sId][t.period] = t; continue; }
    const tP = paidTransportRefIds.has(t._id.toString());
    const eP = paidTransportRefIds.has(existing._id.toString());
    if (tP && !eP) { studentTransport[sId][t.period] = t; continue; }
    if (!tP && eP) continue;
    if (new Date(t.updatedAt) > new Date(existing.updatedAt)) studentTransport[sId][t.period] = t;
  }

  // studentId → late fees
  const studentLateFeeMap = {};
  for (const lf of allLateFees) {
    const sId = lf.studentId.toString();
    if (!studentLateFeeMap[sId]) studentLateFeeMap[sId] = [];
    studentLateFeeMap[sId].push(lf);
  }

  // AdditionalFeeWaiver map: studentId → { additionalFeeId → waiverRecord }
  // (needed so additional fees after waiver are counted correctly in period paid amounts)
  const allAddlIds = allAddl.map(f => f._id);
  const allAddlWaivers = allAddlIds.length
    ? await AdditionalFeeWaiver.find({ studentId: { $in: studentIds }, additionalFeeId: { $in: allAddlIds } }).lean()
    : [];
  const studentAddlWaiverMap = {};
  for (const w of allAddlWaivers) {
    const sId = w.studentId.toString();
    if (!studentAddlWaiverMap[sId]) studentAddlWaiverMap[sId] = {};
    studentAddlWaiverMap[sId][w.additionalFeeId.toString()] = w;
  }

  let expectedFees = 0, collectedFees = 0, pendingFees = 0, pendingCount = 0;

  for (const student of students) {
    const cId  = student.currentClass?.toString();
    const sId  = student._id.toString();
    if (!cId) continue;

    const rawStream   = student.stream?.toString() || student.streamId?.toString() || null;
    const validStream = rawStream && /^[a-f\d]{24}$/i.test(rawStream) ? rawStream : null;
    const allocMap    = studentAllocMap[sId] || {};

    // Tuition installments for this student's class+stream
    const myInsts = allInst.filter(inst => {
      const fs = fsById[inst.feeStructureId.toString()];
      return fs && fs.classId.toString() === cId && (fs.streamId?.toString() || null) === validStream;
    });

    // Additional fees for this student
    const myAddl = allAddl.filter(f => {
      const fc = f.classId?.toString() || null;
      const fs = f.streamId?.toString() || null;
      return (!fc && !fs) || (fc === cId && !fs) || (fc === cId && fs === validStream);
    });

    const transportByPeriod = studentTransport[sId] || {};

    // ── Tuition total (concession base = ONLY tuition, same as production calculateConcession) ──
    const tuitionTotalFS = myInsts.reduce((s, i) => s + Number(i.amount || 0), 0);

    // ── Concession: applies ONLY to tuition fee (production rule) ──
    // calculateConcession({ totalFee }) expects tuition-only, NOT full feeBase
    const studentConcession = calculateConcession({ student, totalFee: tuitionTotalFS });

    // ── Additional fees after waiver (same as queryFeeDefaultersByClass) ──
    const addlWaiverMapForStudent = studentAddlWaiverMap[sId] || {};
    const myAddlAfterWaiver = myAddl.map(f => {
      const wr = addlWaiverMapForStudent[f._id.toString()];
      const waivedAmt = wr ? (wr.isWaived ? Number(f.amount || 0) : Number(wr.waivedAmount || 0)) : 0;
      return { ...f, amount: Math.max(Number(f.amount || 0) - waivedAmt, 0) };
    }).filter(f => f.amount > 0);

    // ── Full period map (all periods: tuition + additional-after-waiver + transport) ──
    // Use waiver-adjusted additional fees so period map matches production ledger
    const fullPeriodMap = buildStudentPeriodMap({ myInsts, myAdditional: myAddlAfterWaiver, transportByPeriod, allocMap });

    // ── Sequential concession map — on TUITION-ONLY period map (matches StudentLedgerController exactly) ──
    // Production uses buildSequentialConcessionMap with tuition-only periodMap, NOT proportional
    const tuitionOnlyPeriodMap = {};
    for (const inst of myInsts) {
      const per = inst.period;
      if (!tuitionOnlyPeriodMap[per]) tuitionOnlyPeriodMap[per] = { totalFee: 0, paidAmount: 0 };
      tuitionOnlyPeriodMap[per].totalFee += Number(inst.amount || 0);
    }
    const periodConcMap = buildSequentialConcessionMap({ periodMap: tuitionOnlyPeriodMap, concession: studentConcession });

    // ── Due periods only ──
    const duePeriods = Object.keys(fullPeriodMap).filter(p => isPeriodDue(p));

    // ── Late fees ──
    const myLF     = studentLateFeeMap[sId] || [];
    let lateFeeDue = 0, lateFeePaid = 0;
    for (const lf of myLF) {
      const paid = lfAllocMap[lf._id.toString()] || 0;
      const amt  = Number(lf.amount) || 0;
      lateFeePaid += Math.min(paid, amt);
      lateFeeDue  += Math.max(0, amt - paid);
    }

    // ── Per-student totals (due periods only) ──
    let studentExpected  = 0;
    let studentCollected = 0;
    let studentPending   = 0;

    for (const per of duePeriods) {
      const pData    = fullPeriodMap[per];
      const totalFee = pData?.totalFee   || 0;
      const paid     = pData?.paidAmount || 0;
      const conc     = periodConcMap[per] || 0;
      const netFee   = parseFloat(Math.max(totalFee - conc, 0).toFixed(2));
      const rawDue   = parseFloat((totalFee - paid).toFixed(2));
      const adjDue   = parseFloat(Math.max(rawDue - conc, 0).toFixed(2));

      studentExpected  += netFee;
      studentCollected += Math.min(paid, netFee);
      studentPending   += adjDue;
    }

    studentExpected  = parseFloat((studentExpected  + lateFeePaid + lateFeeDue).toFixed(2));
    studentCollected = parseFloat((studentCollected + lateFeePaid).toFixed(2));
    studentPending   = parseFloat((studentPending   + lateFeeDue).toFixed(2));

    expectedFees  += studentExpected;
    collectedFees += studentCollected;
    pendingFees   += studentPending;
    if (studentPending > 0) pendingCount++;
  }

  const collectionRate = expectedFees > 0 ? Math.min(Math.round((collectedFees / expectedFees) * 100), 100) : 0;
  const classLabel     = resolvedClassName ? `**${resolvedClassName} Class** — ` : "";

  return {
    type:           "fee_overview",
    className:      resolvedClassName,
    tillMonth:      resolvedTillMonth,
    totalStudents:  students.length,
    expectedFees:   parseFloat(expectedFees.toFixed(2)),
    collectedFees:  parseFloat(collectedFees.toFixed(2)),
    pendingFees:    parseFloat(pendingFees.toFixed(2)),
    pendingCount,
    collectionRate,
    formatted: [
      `${classLabel}**Fee Collection Till ${resolvedTillMonth}** 📊`,
      ``,
      `💼 **Expected Fees:** ${inr(expectedFees)}`,
      `✅ **Collected Fees:** ${inr(collectedFees)} (${collectionRate}% recovery)`,
      `⚠️ **Pending Fees:** ${inr(pendingFees)} (${pendingCount} students pending)`,
      `📈 **Collection Rate:** ${collectionRate}%`,
      ``,
      `_${students.length} students${resolvedClassName ? ` in ${resolvedClassName}` : ""} | Till ${resolvedTillMonth}_`,
    ].join("\n"),
  };
}

/* ══════════════════════════════════════════════════════════════════
   FEE DEFAULTERS (count) — delegates to queryFeeOverview for
   accurate dashboard-matching calculation
══════════════════════════════════════════════════════════════════ */
export async function queryFeeDefaulters(db, params = {}) {
  const result = await queryFeeOverview(db, params);
  if (result.error) return result;

  return {
    type:             "fee_defaulters",
    defaulterCount:   result.pendingCount,
    totalOutstanding: result.pendingFees,
    expectedFees:     result.expectedFees,
    collectedFees:    result.collectedFees,
    collectionRate:   result.collectionRate,
    formatted: [
      `**Fee Status Till ${result.tillMonth}** 📊`,
      ``,
      `⚠️ **Defaulters:** ${result.pendingCount} students`,
      `💸 **Pending Amount:** ${inr(result.pendingFees)}`,
      `✅ **Collected:** ${inr(result.collectedFees)} (${result.collectionRate}% recovery)`,
      `💼 **Expected:** ${inr(result.expectedFees)}`,
    ].join("\n"),
  };
}
