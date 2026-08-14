// queries/aiReportBridge.js
//
// Bridges AI chatbot queries to the EXACT same report controllers
// the software uses — guaranteeing data parity between Reports pages
// and AI chatbot responses.
//
// Strategy: call the production aggregation logic directly (no HTTP),
// return clean data + formatted summary for Mistral to narrate.

import mongoose from "mongoose";
import { getCurrentSession }        from "./aiQueryHelpers.js";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getStudentPaymentModel }   from "../../../../models/tenant/master/StudentPayment.model.js";
import { getStudentPaymentAllocationModel } from "../../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { getFeeStructureModel }     from "../../../../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel }   from "../../../../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel }    from "../../../../models/tenant/master/AdditionalFee.model.js";
import { getTransportFeeModel }     from "../../../../models/tenant/master/TransportFee.model.js";
import { getLateFeeModel }          from "../../../../models/tenant/master/LateFee.model.js";

const toId  = (v) => new mongoose.Types.ObjectId(String(v));
const isId  = (v) => v && mongoose.Types.ObjectId.isValid(v);
const inr   = (n) => n ? "₹" + Number(n).toLocaleString("en-IN") : "₹0";
const pct   = (n) => Math.round(n || 0) + "%";

// Academic helpers (same as production controllers)
const ACADEMIC_ORDER = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
  "APR-JUN","JUL-SEP","OCT-DEC","JAN-MAR",
];
const QUARTERLY = {
  "APR-JUN":["APRIL","MAY","JUNE"], "JUL-SEP":["JULY","AUGUST","SEPTEMBER"],
  "OCT-DEC":["OCTOBER","NOVEMBER","DECEMBER"], "JAN-MAR":["JANUARY","FEBRUARY","MARCH"],
};
const CALENDAR = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
const currentMonthPeriod = () => CALENDAR[new Date().getMonth()];
const isPeriodDue = (period, tillMonth = null) => {
  const cur      = tillMonth || currentMonthPeriod();
  const monthly  = ACADEMIC_ORDER.slice(0, 12);
  const curIdx   = monthly.indexOf(cur);
  if (curIdx === -1) return true;
  if (QUARTERLY[period]) return QUARTERLY[period].some(m => monthly.indexOf(m) <= curIdx);
  const idx = monthly.indexOf(period);
  return idx === -1 ? true : idx <= curIdx;
};

/* ════════════════════════════════════════════════════════
   1. CLASS-SECTION WISE DEFAULTERS SUMMARY
   EXACT same logic as newReportsController.js → classSectionDefaulters
   Reports → Class-Section Wise Defaulter List
════════════════════════════════════════════════════════ */
export async function reportClassSectionDefaulters(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const { className, sectionName } = params;

  // Import helpers identical to newReportsController
  const {
    calculateConcession,
    buildStudentPeriodMap,
    buildSequentialConcessionMap,
  } = await import("../../../../utils/feeHelper.js");
  const { getAdditionalFeeWaiverModel } = await import("../../../../models/tenant/master/AdditionalFeeWaiver.model.js");
  const { getTransportFeeWaiverModel }  = await import("../../../../models/tenant/master/TransportFeeWaiver.model.js");

  const StudentEnrolment  = getStudentEnrolmentModel(db);
  const FeeStructure      = getFeeStructureModel(db);
  const FeeInstallment    = getFeeInstallmentModel(db);
  const AdditionalFee     = getAdditionalFeeModel(db);
  const TransportFee      = getTransportFeeModel(db);
  const StudentPayment    = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const LateFee           = getLateFeeModel(db);
  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(db);
  const TransportFeeWaiver  = getTransportFeeWaiverModel(db);

  /* ── 1. All studying students ── */
  const matchQuery = { session: sid, status: "Studying" };
  if (className) {
    const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
    const cls = await getClassModel(db).findOne({ name: { $regex: new RegExp(`^${className}$`, "i"), }, isActive: true }).lean()
      || await getClassModel(db).findOne({ name: { $regex: new RegExp(className, "i") }, isActive: true }).lean();
    if (!cls) return { error: `Class "${className}" nahi mili` };
    matchQuery.currentClass = cls._id;
  }
  if (sectionName) {
    const { getSectionModel } = await import("../../../../models/tenant/master/Section.modal.js");
    const sec = await getSectionModel(db).findOne({ name: { $regex: new RegExp(`^${sectionName}$`, "i") }, isActive: true }).lean();
    if (sec) matchQuery.currentSection = sec._id;
  }

  const students = await StudentEnrolment.find(matchQuery)
    .populate("currentClass",   "name")
    .populate("currentSection", "name")
    .lean();

  if (!students.length) {
    return { type: "report_class_section_defaulters", rows: [], formatted: "Koi student nahi mila." };
  }

  /* ── 2. Pre-fetch fee structures & installments ── */
  const classIds = [...new Set(students.map(s => s.currentClass?._id?.toString()).filter(Boolean))];
  const feeStructures = await FeeStructure.find({
    sessionId: sid, classId: { $in: classIds.map(toId) }, isActive: true,
  }).lean();
  const feeStructureIds = feeStructures.map(f => f._id);
  const allInstallments = feeStructureIds.length
    ? await FeeInstallment.find({ feeStructureId: { $in: feeStructureIds } }).lean()
    : [];

  /* ── 3. Additional fees ── */
  const additionalFees = await AdditionalFee.find({ sessionId: sid, isActive: true }).lean();

  /* ── 4. Bulk fetch payments, allocations, transport, late fees ── */
  const studentIds = students.map(s => s._id);
  const [allPayments, allTransportFees, allLateFees] = await Promise.all([
    StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }).lean(),
    TransportFee.find({ studentId: { $in: studentIds }, sessionId: sid }).lean(),
    LateFee.find({ studentId: { $in: studentIds }, sessionId: sid, isWaived: false, amount: { $gt: 0 } }).lean(),
  ]);

  const allPaymentIds = allPayments.map(p => p._id);
  const allAllocations = allPaymentIds.length
    ? await StudentPaymentAllocation.find({ paymentId: { $in: allPaymentIds } }).lean()
    : [];

  // Paid transport referenceIds (for dedup logic)
  const paidTransportRefIds = new Set(
    allAllocations.filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount || 0) > 0)
      .map(a => a.referenceId.toString())
  );

  // Late fee paid allocations
  const lateFeeIds = allLateFees.map(lf => lf._id);
  const lateFeeAllocations = lateFeeIds.length && allPaymentIds.length
    ? await StudentPaymentAllocation.find({
        paymentId: { $in: allPaymentIds }, feeType: "LATE_FEE", referenceId: { $in: lateFeeIds }
      }).lean()
    : [];
  const lateFeePaidMap = {};
  for (const a of lateFeeAllocations) {
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

  // Build per-student maps
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
    const s = lf.studentId.toString();
    const paid = lateFeePaidMap[lf._id.toString()] || 0;
    const due  = Math.max(0, Number(lf.amount || 0) - paid);
    studentLateFineMap[s] = (studentLateFineMap[s] || 0) + due;
  }

  /* ── 5. Per-student calculation — identical to classSectionDefaulters ── */
  const summaryMap = {};
  const fsById = Object.fromEntries(feeStructures.map(f => [f._id.toString(), f]));

  for (const student of students) {
    const cid    = student.currentClass?._id?.toString(); if (!cid) continue;
    const secId  = student.currentSection?._id?.toString() || "none";
    const _rawSt = student.stream?._id?.toString() || student.stream?.toString() || null;
    const streamId = _rawSt && /^[a-f\d]{24}$/i.test(_rawSt) ? _rawSt : null;
    const stId   = student._id.toString();

    // My installments
    const myInsts = allInstallments.filter(i => {
      const fs = fsById[i.feeStructureId.toString()];
      return fs && fs.classId.toString() === cid && (fs.streamId?.toString() || null) === streamId;
    });

    // My additional fees (with waiver applied)
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

    // Transport dedup (same logic as production)
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

    // Build alloc map for this student
    const paymentIds = studentPaymentMap[stId] || [];
    const allocMapCS = {};
    for (const pid of paymentIds) {
      for (const a of allocationByPayment[pid.toString()] || []) {
        const rid = a.referenceId.toString();
        allocMapCS[rid] = (allocMapCS[rid] || 0) + Number(a.allocatedAmount || 0);
      }
    }

    // Concession
    const tuitionTotal    = myInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
    const transportTotal  = Object.values(transportByPeriod).reduce((s, t) => s + Number(t.amount || 0), 0);
    const concession      = calculateConcession({ student, totalFee: tuitionTotal, transportTotal });

    // Period map
    const periodMapCS = buildStudentPeriodMap({ myInsts, myAdditional: myAddlAfterWaiver, transportByPeriod, allocMap: allocMapCS });

    // Sequential concession map (tuition-only, matches ledger)
    const tuitionPeriodMap = {};
    for (const inst of myInsts) {
      const per = inst.period;
      if (!tuitionPeriodMap[per]) tuitionPeriodMap[per] = { totalFee: 0, paidAmount: 0 };
      tuitionPeriodMap[per].totalFee += Number(inst.amount || 0);
    }
    const periodConcessionCS = buildSequentialConcessionMap({ periodMap: tuitionPeriodMap, concession });

    // Sum up due amounts for past/current periods only
    let currentDueBalance = 0;
    let currentTransportBalance = 0;

    for (const [per, vals] of Object.entries(periodMapCS)) {
      if (!isPeriodDue(per)) continue;
      const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
      if (rawDue <= 0) continue;
      const concForPeriod = periodConcessionCS[per] || 0;
      const adjustedDue   = parseFloat(Math.max(rawDue - concForPeriod, 0).toFixed(2));
      if (adjustedDue <= 0) continue;

      currentDueBalance += adjustedDue;

      const t = transportByPeriod[per];
      if (t) {
        const tPaid = allocMapCS[t._id.toString()] || 0;
        const tDue  = parseFloat(Math.max(Number(t.amount || 0) - tPaid, 0).toFixed(2));
        currentTransportBalance += tDue;
      }
    }

    const lateFineBalance = studentLateFineMap[stId] || 0;
    if (currentDueBalance <= 0 && lateFineBalance <= 0) continue; // not a defaulter

    const grandTotal          = parseFloat((currentDueBalance + lateFineBalance).toFixed(2));
    const nonTransportBalance = parseFloat(Math.max(currentDueBalance - currentTransportBalance, 0).toFixed(2));

    const key = `${cid}__${secId}`;
    if (!summaryMap[key]) {
      summaryMap[key] = {
        className:   student.currentClass?.name || "",
        sectionName: student.currentSection?.name || "",
        count: 0, defaultersAmt: 0, transport: 0, lateFine: 0, grandTotal: 0,
      };
    }
    summaryMap[key].count        += 1;
    summaryMap[key].defaultersAmt += nonTransportBalance;
    summaryMap[key].transport    += currentTransportBalance;
    summaryMap[key].lateFine     += lateFineBalance;
    summaryMap[key].grandTotal   += grandTotal;
  }

  /* ── 6. Sort & format ── */
  const rows = Object.values(summaryMap).sort(
    (a, b) => a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName)
  ).map(row => ({
    className:      row.className,
    sectionName:    row.sectionName,
    noOfDefaulters: row.count,
    defaultersAmt:  parseFloat(row.defaultersAmt.toFixed(2)),
    transport:      parseFloat(row.transport.toFixed(2)),
    lateFine:       parseFloat(row.lateFine.toFixed(2)),
    grandTotal:     parseFloat(row.grandTotal.toFixed(2)),
  }));

  if (!rows.length) {
    return {
      type: "report_class_section_defaulters", rows: [],
      formatted: className ? `"${className}" mein koi defaulter nahi hai 🎉` : "Is session mein koi fee defaulter nahi hai 🎉",
    };
  }

  const grandDefaulters  = rows.reduce((s, r) => s + r.noOfDefaulters, 0);
  const grandDefaulterAmt = rows.reduce((s, r) => s + r.defaultersAmt, 0);
  const grandTransport   = rows.reduce((s, r) => s + r.transport, 0);
  const grandLateFine    = rows.reduce((s, r) => s + r.lateFine, 0);
  const grandTotal       = rows.reduce((s, r) => s + r.grandTotal, 0);

  const lines = rows.map(r =>
    `• **${r.className}-${r.sectionName || "—"}**: ` +
    `${r.noOfDefaulters} defaulters | ` +
    `Amt ${inr(r.defaultersAmt)} | Transport ${inr(r.transport)} | Late Fine ${inr(r.lateFine)} | Grand Total **${inr(r.grandTotal)}**`
  );

  return {
    type: "report_class_section_defaulters",
    rows, grandDefaulters, grandDefaulterAmt, grandTransport, grandLateFine, grandTotal,
    formatted: [
      `**Class-Section Wise Defaulter List** 📊`,
      lines.join("\n"),
      ``,
      `**Grand Total:** ${grandDefaulters} defaulters | Amt ${inr(grandDefaulterAmt)} | Transport ${inr(grandTransport)} | Late Fine ${inr(grandLateFine)} | **${inr(grandTotal)}**`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   2. FEE HEAD REPORT (collection by fee head type)
   Same data as Reports → Fee Head Report
════════════════════════════════════════════════════════ */
export async function reportFeeHead(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const FeeInstallment  = getFeeInstallmentModel(db);
  const AdditionalFee   = getAdditionalFeeModel(db);
  const TransportFee    = getTransportFeeModel(db);

  const rawRows = await StudentPaymentAllocation.aggregate([
    { $lookup: { from: "studentpayments", localField: "paymentId", foreignField: "_id", as: "payment" } },
    { $unwind: "$payment" },
    { $match: { "payment.sessionId": sid, "payment.paymentStatus": "SUCCESS" } },
    { $lookup: { from: "classes", localField: "payment.classId", foreignField: "_id", as: "cls" } },
    { $project: { feeType: 1, referenceId: 1, allocatedAmount: 1,
        className: { $ifNull: [{ $arrayElemAt: ["$cls.name", 0] }, "Unknown"] }, paymentId: 1 } },
  ]);

  if (!rawRows.length) {
    return { type: "report_fee_head", rows: [], formatted: "Koi fee head data nahi mila." };
  }

  const tuitionIds    = rawRows.filter(r => r.feeType === "TUITION")    .map(r => r.referenceId);
  const additionalIds = rawRows.filter(r => r.feeType === "ADDITIONAL") .map(r => r.referenceId);

  const [tuitionDocs, additionalDocs] = await Promise.all([
    tuitionIds.length    ? FeeInstallment.find({ _id: { $in: tuitionIds } }, { feeHead: 1 }).lean() : [],
    additionalIds.length ? AdditionalFee.find({ _id: { $in: additionalIds } }, { feeName: 1 }).lean() : [],
  ]);

  const tMap = Object.fromEntries(tuitionDocs.map(d => [d._id.toString(), d.feeHead || "Tuition Fee"]));
  const aMap = Object.fromEntries(additionalDocs.map(d => [d._id.toString(), d.feeName || "Additional Fee"]));

  const getName = (type, refId) => {
    const r = refId?.toString();
    if (type === "TUITION")    return tMap[r]    || "Tuition Fee";
    if (type === "ADDITIONAL") return aMap[r]    || "Additional Fee";
    if (type === "TRANSPORT")  return "Transport Fee";
    if (type === "LATE_FEE")   return "Late Fee";
    return type;
  };

  const groupMap = {};
  for (const row of rawRows) {
    const head = getName(row.feeType, row.referenceId);
    const key  = `${row.feeType}|${head}`;
    if (!groupMap[key]) groupMap[key] = { feeType: row.feeType, feeHead: head, totalCollection: 0, txnCount: new Set() };
    groupMap[key].totalCollection += Number(row.allocatedAmount || 0);
    groupMap[key].txnCount.add(row.paymentId.toString());
  }

  const rows = Object.values(groupMap)
    .map(g => ({ feeType: g.feeType, feeHead: g.feeHead, totalCollection: parseFloat(g.totalCollection.toFixed(2)), transactions: g.txnCount.size }))
    .sort((a, b) => a.feeHead.localeCompare(b.feeHead));

  const grandTotal = rows.reduce((s, r) => s + r.totalCollection, 0);
  const lines = rows.map(r => `• **${r.feeHead}** (${r.feeType}): ${inr(r.totalCollection)} — ${r.transactions} transactions`);

  return {
    type: "report_fee_head", rows, grandTotal,
    formatted: [`**Fee Head Collection Report** 💰`, lines.join("\n"), ``, `**Total: ${inr(grandTotal)}**`].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   3. FEE COLLECTION REPORT (transaction list — summary)
   Same as Reports → Fee Collection (summary view for AI)
════════════════════════════════════════════════════════ */
export async function reportFeeCollection(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const StudentPayment = getStudentPaymentModel(db);
  const { fromDate, toDate, className } = params;

  const match = { sessionId: sid, paymentStatus: "SUCCESS" };
  if (fromDate || toDate) {
    match.paymentDate = {};
    if (fromDate) match.paymentDate.$gte = new Date(fromDate);
    if (toDate)   { const e = new Date(toDate); e.setHours(23,59,59,999); match.paymentDate.$lte = e; }
  }

  const [summary, byMode, byClass] = await Promise.all([
    StudentPayment.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$amountPaid" }, count: { $sum: 1 } } },
    ]),
    StudentPayment.aggregate([
      { $match: match },
      { $group: { _id: "$paymentMode", amount: { $sum: "$amountPaid" }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    StudentPayment.aggregate([
      { $match: match },
      { $lookup: { from: "classes", localField: "classId", foreignField: "_id", as: "cls" } },
      { $group: { _id: "$classId", className: { $first: { $arrayElemAt: ["$cls.name", 0] } },
          amount: { $sum: "$amountPaid" }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } }, { $limit: 12 },
    ]),
  ]);

  const s = summary[0] || { total: 0, count: 0 };
  const dateLabel = fromDate && toDate ? ` (${fromDate} to ${toDate})` : "";
  const modeLines  = byMode.map(m => `• ${m._id || "Other"}: ${inr(m.amount)} — ${m.count} txn`);
  const classLines = byClass.map(c => `• ${c.className || "Unknown"}: ${inr(c.amount)}`);

  return {
    type: "report_fee_collection",
    totalCollected: s.total, totalTransactions: s.count, byMode, byClass,
    formatted: [
      `**Fee Collection Report${dateLabel}** 💰`,
      `Total: **${inr(s.total)}** — ${s.count} transactions`,
      ``, `**By Payment Mode:**`, ...modeLines,
      ``, `**Top Classes:**`, ...classLines,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   4. REGISTRATION FEE COLLECTION
   Same as Reports → New Admission Fee Collection
════════════════════════════════════════════════════════ */
export async function reportNewAdmissionFeeCollection(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const StudentPayment   = getStudentPaymentModel(db);
  const { fromDate, toDate } = params;

  const enrollMatch = { session: sid, status: "Studying" };
  if (fromDate || toDate) {
    enrollMatch.createdAt = {};
    if (fromDate) enrollMatch.createdAt.$gte = new Date(fromDate);
    if (toDate)   { const e = new Date(toDate); e.setHours(23,59,59,999); enrollMatch.createdAt.$lte = e; }
  }

  const newStudents = await StudentEnrolment.find(enrollMatch, { _id: 1 })
    .populate("currentClass", "name").lean();

  if (!newStudents.length) {
    return { type: "report_new_admission_fee", rows: [], formatted: "Is period mein koi nayi admission nahi mili." };
  }

  const sIds = newStudents.map(s => s._id);
  const payments = await StudentPayment.aggregate([
    { $match: { sessionId: sid, studentId: { $in: sIds }, paymentStatus: "SUCCESS" } },
    { $group: { _id: null, totalCollected: { $sum: "$amountPaid" }, count: { $sum: 1 } } },
  ]);

  const p    = payments[0] || { totalCollected: 0, count: 0 };
  const dateLabel = fromDate && toDate ? ` (${fromDate} to ${toDate})` : "";

  return {
    type: "report_new_admission_fee",
    newStudentsCount: newStudents.length,
    totalCollected: p.totalCollected, transactions: p.count,
    formatted: [
      `**New Admission Fee Collection${dateLabel}**`,
      `New Admissions: **${newStudents.length}** students`,
      `Fee Collected: **${inr(p.totalCollected)}** — ${p.count} transactions`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   5. FEE DEFAULTERS MONTH-WISE (per student, each month)
   Same as Reports → Fee Defaulters Month-wise
════════════════════════════════════════════════════════ */
export async function reportFeeDefaultersMonthwise(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);
  const { className, sectionName, tillMonth } = params;

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const FeeStructure     = getFeeStructureModel(db);
  const FeeInstallment   = getFeeInstallmentModel(db);
  const AdditionalFee    = getAdditionalFeeModel(db);
  const StudentPayment   = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const enrollMatch = { session: sid, status: "Studying" };
  if (className) {
    const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
    const cls = await getClassModel(db).findOne({ name: { $regex: new RegExp(`^${className}$`, "i") }, isActive: true }).lean();
    if (!cls) return { error: `Class "${className}" nahi mili` };
    enrollMatch.currentClass = cls._id;
  }

  const students = await StudentEnrolment.find(enrollMatch)
    .populate("currentClass", "name").populate("currentSection", "name").lean();
  if (!students.length) return { type: "report_fee_defaulters_monthwise", rows: [], formatted: "Koi student nahi mila." };

  const studentIds = students.map(s => s._id);
  const fsQuery = { sessionId: sid, isActive: true };
  const feeStructures = await FeeStructure.find(fsQuery).lean();
  const fsIds    = feeStructures.map(f => f._id);
  const fsById   = Object.fromEntries(feeStructures.map(f => [f._id.toString(), f]));
  const allInsts = fsIds.length ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean() : [];
  const addlFees = await AdditionalFee.find({ sessionId: sid, isActive: true }).lean();

  const allPayments = await StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }).lean();
  const payIds = allPayments.map(p => p._id);
  const allAllocs = payIds.length ? await StudentPaymentAllocation.find({ paymentId: { $in: payIds } }).lean() : [];
  const payStudentMap = Object.fromEntries(allPayments.map(p => [p._id.toString(), p.studentId.toString()]));
  const studentAllocMap = {};
  for (const a of allAllocs) {
    const sId = payStudentMap[a.paymentId.toString()]; if (!sId) continue;
    const rid = a.referenceId.toString();
    if (!studentAllocMap[sId]) studentAllocMap[sId] = {};
    studentAllocMap[sId][rid] = (studentAllocMap[sId][rid] || 0) + Number(a.allocatedAmount || 0);
  }

  // Build month-summary across all students
  const monthMap = {};
  for (const period of ACADEMIC_ORDER.slice(0, 12)) {
    if (!isPeriodDue(period, tillMonth)) continue;
    monthMap[period] = { expected: 0, collected: 0, pending: 0, defaulters: 0 };
  }

  for (const student of students) {
    const cId = student.currentClass?._id?.toString(); if (!cId) continue;
    const rawStream = student.stream?.toString() || null;
    const streamId  = rawStream && /^[a-f\d]{24}$/i.test(rawStream) ? rawStream : null;
    const sId = student._id.toString();
    const allocMap = studentAllocMap[sId] || {};

    const myInsts = allInsts.filter(i => {
      const fs = fsById[i.feeStructureId.toString()];
      return fs && fs.classId.toString() === cId && (fs.streamId?.toString() || null) === streamId;
    });
    const myAddl = addlFees.filter(f => {
      const fc = f.classId?.toString() || null; const fs = f.streamId?.toString() || null;
      return (!fc && !fs) || (fc === cId && !fs) || (fc === cId && fs === streamId);
    });

    for (const period of Object.keys(monthMap)) {
      const periodInsts = myInsts.filter(i => i.period === period);
      const periodAddl  = myAddl.filter(f  => f.period === period);
      const instTotal   = periodInsts.reduce((s, i) => s + Number(i.amount || 0), 0);
      const addlTotal   = periodAddl.reduce( (s, f) => s + Number(f.amount || 0), 0);
      const periodFee   = instTotal + addlTotal;
      if (periodFee <= 0) continue;
      const paid = periodInsts.reduce((s, i) => s + (allocMap[i._id.toString()] || 0), 0)
                 + periodAddl.reduce( (s, f) => s + (allocMap[f._id.toString()] || 0), 0);
      const due = Math.max(periodFee - paid, 0);
      monthMap[period].expected   += periodFee;
      monthMap[period].collected  += Math.min(paid, periodFee);
      monthMap[period].pending    += due;
      if (due > 0) monthMap[period].defaulters++;
    }
  }

  const tillLabel = tillMonth || currentMonthPeriod();
  const lines = Object.entries(monthMap)
    .filter(([, v]) => v.expected > 0)
    .map(([period, v]) =>
      `• **${period}**: Expected ${inr(v.expected)} | Collected ${inr(v.collected)} | Pending ${inr(v.pending)} | ${v.defaulters} defaulters`
    );

  return {
    type: "report_fee_defaulters_monthwise",
    months: monthMap, tillMonth: tillLabel,
    formatted: [
      `**Fee Defaulters Month-wise — Till ${tillLabel}**`,
      lines.join("\n") || "Koi pending fee nahi mili.",
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   6. RESULT ANALYSIS REPORT
   Same as Reports → Result Analysis (class-section wise)
════════════════════════════════════════════════════════ */
export async function reportResultAnalysis(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const { className } = params;

  // Import models
  const { getMarksheetModel }  = await import("../../../../models/tenant/report/Marksheet.model.js");
  const { getExamModel }       = await import("../../../../models/tenant/master/Exam.model.js");
  const { getClassModel }      = await import("../../../../models/tenant/master/Class.modal.js");
  const Marksheet              = getMarksheetModel(db);
  const ExamMaster             = getExamModel(db);
  const Class                  = getClassModel(db);
  const StudentEnrolment       = getStudentEnrolmentModel(db);

  // Get latest published exam
  const exams = await ExamMaster.find({ session: sid, isActive: true }).sort({ order: -1 }).lean();
  if (!exams.length) return { type: "report_result_analysis", rows: [], formatted: "Is session mein koi exam nahi mila. Pehle result publish karein." };

  const examMaster = exams[0];
  const classFilter = {};
  if (className) {
    const cls = await Class.findOne({ name: { $regex: new RegExp(`^${className}$`, "i") }, isActive: true }).lean();
    if (!cls) return { error: `Class "${className}" nahi mili` };
    classFilter.currentClass = cls._id;
  }

  const students = await StudentEnrolment.find({ session: sid, status: "Studying", ...classFilter }).lean();
  const studentIds = students.map(s => s._id);

  const marksheets = await Marksheet.find({ studentId: { $in: studentIds }, sessionId: sid, isPublished: true }).lean();

  // Best percentage per student
  const bestPct = {};
  for (const m of marksheets) {
    const sId = m.studentId.toString();
    const p   = Number(m.percentage || 0);
    if (!bestPct[sId] || p > bestPct[sId]) bestPct[sId] = p;
  }

  const allClasses = await Class.find({ isActive: true }).lean();
  const classMap   = Object.fromEntries(allClasses.map(c => [c._id.toString(), c]));
  const THRESHOLDS = [90, 80, 70, 60, 50, 40, 33];

  // Group by class
  const groupMap = {};
  for (const student of students) {
    const cId = student.currentClass?.toString(); if (!cId) continue;
    const cls = classMap[cId];
    if (!groupMap[cId]) groupMap[cId] = { className: cls?.name || "?", classOrder: cls?.order ?? 999, students: [] };
    groupMap[cId].students.push(student);
  }

  const rows = [];
  for (const group of Object.values(groupMap)) {
    const total = group.students.length;
    let passed = 0;
    const above = Object.fromEntries(THRESHOLDS.map(t => [t, 0]));
    for (const s of group.students) {
      const p = bestPct[s._id.toString()] ?? null;
      if (p === null) continue;
      if (p >= 33) passed++;
      for (const t of THRESHOLDS) { if (p >= t) above[t]++; }
    }
    rows.push({ className: group.className, classOrder: group.classOrder,
      totalStudents: total, passedStudents: passed,
      passedPct: total > 0 ? Math.round((passed / total) * 100) : 0,
      above90: above[90], above80: above[80], above70: above[70],
      above60: above[60], above50: above[50], above33: above[33] });
  }
  rows.sort((a, b) => a.classOrder - b.classOrder);

  if (!rows.length) return { type: "report_result_analysis", rows: [], formatted: "Koi published result nahi mila." };

  const grandTotal = rows.reduce((s, r) => s + r.totalStudents, 0);
  const grandPassed = rows.reduce((s, r) => s + r.passedStudents, 0);
  const grandPct   = grandTotal > 0 ? Math.round((grandPassed / grandTotal) * 100) : 0;

  const lines = rows.map(r =>
    `• **${r.className}**: ${r.passedStudents}/${r.totalStudents} passed (${r.passedPct}%) | 90%+: ${r.above90} | 80%+: ${r.above80} | 70%+: ${r.above70}`
  );

  return {
    type: "report_result_analysis", rows, examName: examMaster.examName,
    grandTotal, grandPassed, grandPct,
    formatted: [
      `**Result Analysis — ${examMaster.examName}**`,
      lines.join("\n"),
      ``, `**Grand Total:** ${grandPassed}/${grandTotal} passed (${grandPct}%)`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   7. TRANSPORT ROUTE-WISE COLLECTION
   Same as Reports → Transport → Route-wise Collection
════════════════════════════════════════════════════════ */
export async function reportTransportRouteWise(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const StudentPayment   = getStudentPaymentModel(db);
  const TransportFee     = getTransportFeeModel(db);

  const { getRouteModel } = await import("../../../../models/tenant/master/RouteMaster.model.js");
  const Route = getRouteModel(db);
  const routes = await Route.find({ isActive: true }).lean();
  if (!routes.length) return { type: "report_transport_route_wise", rows: [], formatted: "Koi active route nahi mila." };

  const { getStudentTransportModel } = await import("../../../../models/tenant/master/StudentTransport.model.js");
  const StudentTransport = getStudentTransportModel(db);

  const rows = [];
  let grandBilled = 0, grandPaid = 0, grandBalance = 0, grandStudents = 0;

  for (const route of routes) {
    const assigned = await StudentTransport.find({ routeId: route._id, sessionId: sid, isActive: true }).lean();
    if (!assigned.length) continue;

    const studentIds = assigned.map(a => a.studentId);
    const tFees = await TransportFee.find({ studentId: { $in: studentIds }, sessionId: sid }).lean();
    const totalBilled = tFees.reduce((s, t) => s + Number(t.amount || 0), 0);

    const allPayments = await StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }).lean();
    const payIds = allPayments.map(p => p._id);
    const allocs = payIds.length ? await StudentPaymentAllocation.find({ paymentId: { $in: payIds }, feeType: "TRANSPORT" }).lean() : [];
    const totalPaid = allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0);
    const balance   = Math.max(totalBilled - totalPaid, 0);
    const collectionPct = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

    rows.push({ routeName: route.routeName, totalStudents: assigned.length, totalBilled, totalPaid, balance, collectionPct });
    grandBilled   += totalBilled;
    grandPaid     += totalPaid;
    grandBalance  += balance;
    grandStudents += assigned.length;
  }

  rows.sort((a, b) => b.totalBilled - a.totalBilled);
  const lines = rows.map(r =>
    `• **${r.routeName}**: ${r.totalStudents} students | Billed ${inr(r.totalBilled)} | Collected ${inr(r.totalPaid)} | Balance ${inr(r.balance)} (${r.collectionPct}%)`
  );

  return {
    type: "report_transport_route_wise", rows, grandBilled, grandPaid, grandBalance,
    formatted: [
      `**Transport Route-wise Collection** 🚌`,
      lines.join("\n") || "Koi data nahi mila.",
      ``, `**Grand Total:** ${grandStudents} students | Billed ${inr(grandBilled)} | Collected ${inr(grandPaid)} | Balance ${inr(grandBalance)}`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   8. TRANSPORT DEFAULTERS
   Same as Reports → Transport → Defaulters
════════════════════════════════════════════════════════ */
export async function reportTransportDefaulters(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const TransportFee     = getTransportFeeModel(db);
  const StudentPayment   = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const students = await StudentEnrolment.find({ session: sid, status: "Studying", transportRequired: "YES" })
    .populate("currentClass", "name").lean();
  if (!students.length) return { type: "report_transport_defaulters", rows: [], formatted: "Koi transport student nahi mila." };

  const studentIds = students.map(s => s._id);
  const allTFees   = await TransportFee.find({ studentId: { $in: studentIds }, sessionId: sid }).lean();
  const allPayments = await StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }).lean();
  const payIds     = allPayments.map(p => p._id);
  const allAllocs  = payIds.length ? await StudentPaymentAllocation.find({ paymentId: { $in: payIds }, feeType: "TRANSPORT" }).lean() : [];

  const paidMap = {};
  for (const p of allPayments) {
    for (const a of allAllocs.filter(al => al.paymentId.toString() === p._id.toString())) {
      const rid = a.referenceId.toString();
      paidMap[rid] = (paidMap[rid] || 0) + Number(a.allocatedAmount || 0);
    }
  }

  const studentFeeMap = {};
  for (const t of allTFees) {
    const sId = t.studentId.toString();
    if (!studentFeeMap[sId]) studentFeeMap[sId] = { billed: 0, paid: 0 };
    studentFeeMap[sId].billed += Number(t.amount || 0);
    studentFeeMap[sId].paid   += paidMap[t._id.toString()] || 0;
  }

  const defaulters = students
    .filter(s => { const f = studentFeeMap[s._id.toString()]; return f && (f.billed - f.paid) > 0; })
    .map(s => {
      const f = studentFeeMap[s._id.toString()];
      return { name: [s.firstName, s.lastName].filter(Boolean).join(" "), className: s.currentClass?.name || "?",
        billed: f.billed, paid: f.paid, balance: f.billed - f.paid };
    })
    .sort((a, b) => b.balance - a.balance);

  if (!defaulters.length) return { type: "report_transport_defaulters", rows: [], formatted: "Koi transport defaulter nahi hai 🎉" };

  const totalOutstanding = defaulters.reduce((s, r) => s + r.balance, 0);
  const shown = defaulters.slice(0, 15);
  const lines = shown.map((r, i) => `${i + 1}. **${r.name}** (${r.className}) — Billed ${inr(r.billed)} | Paid ${inr(r.paid)} | Balance ${inr(r.balance)}`);
  if (defaulters.length > 15) lines.push(`...aur ${defaulters.length - 15} aur defaulters`);

  return {
    type: "report_transport_defaulters", rows: shown,
    totalDefaulters: defaulters.length, totalOutstanding,
    formatted: [
      `**Transport Defaulters — ${defaulters.length} students**`,
      lines.join("\n"),
      ``, `**Total Outstanding: ${inr(totalOutstanding)}**`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   9. FEE DEPOSIT SUMMARY CLASS-WISE
   Same as Reports → Fee Deposit Summary (class totals)
════════════════════════════════════════════════════════ */
export async function reportFeeDepositSummaryClasswise(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const StudentPayment = getStudentPaymentModel(db);
  const match = { sessionId: sid, paymentStatus: "SUCCESS" };

  const rows = await StudentPayment.aggregate([
    { $match: match },
    { $lookup: { from: "classes", localField: "classId", foreignField: "_id", as: "cls" } },
    { $group: { _id: "$classId",
        className:  { $first: { $arrayElemAt: ["$cls.name", 0] } },
        totalPaid:  { $sum: "$amountPaid" },
        txnCount:   { $sum: 1 },
        studentCount: { $addToSet: "$studentId" },
    }},
    { $project: { _id: 0, className: 1, totalPaid: 1, txnCount: 1, studentCount: { $size: "$studentCount" } } },
    { $sort: { totalPaid: -1 } },
  ]);

  const grandTotal = rows.reduce((s, r) => s + r.totalPaid, 0);
  const lines = rows.map(r => `• **${r.className || "Unknown"}**: ${inr(r.totalPaid)} — ${r.txnCount} txn — ${r.studentCount} students`);

  return {
    type: "report_fee_deposit_classwise", rows, grandTotal,
    formatted: [
      `**Fee Deposit Summary (Class-wise)**`,
      lines.join("\n") || "Koi data nahi mila.",
      ``, `**Grand Total Collected: ${inr(grandTotal)}**`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   10. STUDENT FEE DETAILS CLASS-WISE (per-student summary)
   Same as Reports → Student Fee Details Class-wise
════════════════════════════════════════════════════════ */
export async function reportStudentFeeDetailsClasswise(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const { className, tillMonth } = params;

  // Delegate to queryFeeOverview which calculates exact same data
  const overviewParams = { tillMonth };
  if (className) overviewParams.className = className;
  const result = await queryFeeOverview(db, overviewParams);
  if (result.error) return result;

  const tillLabel = tillMonth || currentMonthPeriod();
  return {
    type: "report_student_fee_details",
    tillMonth: tillLabel,
    className: result.className,
    totalStudents: result.totalStudents,
    expectedFees:  result.expectedFees,
    collectedFees: result.collectedFees,
    pendingFees:   result.pendingFees,
    pendingCount:  result.pendingCount,
    collectionRate: result.collectionRate,
    formatted: result.formatted,
  };
}

/* ════════════════════════════════════════════════════════
   11. DEFAULTERS DETAILED (period-wise per-student)
   Same as Reports → Defaulter List (Detailed)
════════════════════════════════════════════════════════ */
export async function reportFeeDefaultersDetailed(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);
  const { className, sectionName } = params;

  const {
    calculateConcession, buildStudentPeriodMap, buildSequentialConcessionMap,
  } = await import("../../../../utils/feeHelper.js");

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const FeeStructure     = getFeeStructureModel(db);
  const FeeInstallment   = getFeeInstallmentModel(db);
  const AdditionalFee    = getAdditionalFeeModel(db);
  const TransportFee     = getTransportFeeModel(db);
  const StudentPayment   = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const LateFee          = getLateFeeModel(db);

  const MONTHLY = ["APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH"];
  const QUARTERLY = { "APR-JUN":["APRIL","MAY","JUNE"],"JUL-SEP":["JULY","AUGUST","SEPTEMBER"],"OCT-DEC":["OCTOBER","NOVEMBER","DECEMBER"],"JAN-MAR":["JANUARY","FEBRUARY","MARCH"] };
  const CALENDAR = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const curMonth = CALENDAR[new Date().getMonth()];
  const curIdx   = MONTHLY.indexOf(curMonth);
  const isPeriodDue = (p) => {
    if (QUARTERLY[p]) return QUARTERLY[p].some(m => MONTHLY.indexOf(m) <= curIdx);
    const i = MONTHLY.indexOf(p); return i === -1 ? true : i <= curIdx;
  };

  const matchQuery = { session: sid, status: "Studying" };
  if (className) {
    const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
    const cls = await getClassModel(db).findOne({ name: { $regex: new RegExp(`^${className}$`, "i") }, isActive: true }).lean()
              || await getClassModel(db).findOne({ name: { $regex: new RegExp(className, "i") }, isActive: true }).lean();
    if (!cls) return { error: `Class "${className}" nahi mili` };
    matchQuery.currentClass = cls._id;
  }
  if (sectionName) {
    const { getSectionModel } = await import("../../../../models/tenant/master/Section.modal.js");
    const sec = await getSectionModel(db).findOne({ name: { $regex: new RegExp(`^${sectionName}$`, "i") }, isActive: true }).lean();
    if (sec) matchQuery.currentSection = sec._id;
  }

  const students = await StudentEnrolment.find(matchQuery).populate("currentClass","name").populate("currentSection","name").lean();
  if (!students.length) return { type: "report_fee_defaulters_detailed", rows: [], formatted: "Koi student nahi mila." };

  const studentIds = students.map(s => s._id);
  const classIds   = [...new Set(students.map(s => s.currentClass?._id?.toString()).filter(Boolean))];

  const [allStructures, additionalFees, allPayments, allTransportFees, allLateFees] = await Promise.all([
    FeeStructure.find({ sessionId: sid, classId: { $in: classIds.map(toId) }, isActive: true }).lean(),
    AdditionalFee.find({ sessionId: sid, isActive: true }).lean(),
    StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }).lean(),
    TransportFee.find({ studentId: { $in: studentIds }, sessionId: sid }).lean(),
    LateFee.find({ studentId: { $in: studentIds }, sessionId: sid, isWaived: false, amount: { $gt: 0 } }).lean(),
  ]);

  const fsIds = allStructures.map(f => f._id);
  const allInstallments = fsIds.length ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean() : [];
  const allPaymentIds   = allPayments.map(p => p._id);
  const allAllocations  = allPaymentIds.length ? await StudentPaymentAllocation.find({ paymentId: { $in: allPaymentIds } }).lean() : [];

  const paidTransportRefIds = new Set(allAllocations.filter(a => a.feeType === "TRANSPORT" && Number(a.allocatedAmount||0) > 0).map(a => a.referenceId.toString()));
  const lateFeeIds    = allLateFees.map(lf => lf._id);
  const lateFeeAllocs = lateFeeIds.length && allPaymentIds.length ? await StudentPaymentAllocation.find({ paymentId: { $in: allPaymentIds }, feeType: "LATE_FEE", referenceId: { $in: lateFeeIds } }).lean() : [];
  const lateFeePaidMap = {};
  for (const a of lateFeeAllocs) { const r = a.referenceId.toString(); lateFeePaidMap[r] = (lateFeePaidMap[r]||0)+Number(a.allocatedAmount||0); }

  const payStudentMap = Object.fromEntries(allPayments.map(p => [p._id.toString(), p.studentId.toString()]));
  const studentAllocMap = {};
  for (const a of allAllocations) {
    const sId = payStudentMap[a.paymentId.toString()]; if (!sId) continue;
    const rid = a.referenceId.toString();
    if (!studentAllocMap[sId]) studentAllocMap[sId] = {};
    studentAllocMap[sId][rid] = (studentAllocMap[sId][rid]||0)+Number(a.allocatedAmount||0);
  }
  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const s = t.studentId.toString();
    if (!studentTransportMap[s]) studentTransportMap[s] = [];
    studentTransportMap[s].push(t);
  }
  const studentLateFeeMap = {};
  for (const lf of allLateFees) {
    const s = lf.studentId.toString();
    if (!studentLateFeeMap[s]) studentLateFeeMap[s] = [];
    studentLateFeeMap[s].push(lf);
  }
  const fsById = Object.fromEntries(allStructures.map(f => [f._id.toString(), f]));

  const defaulterRows = [];

  for (const student of students) {
    const cid = student.currentClass?._id?.toString(); if (!cid) continue;
    const _rs = student.stream?._id?.toString() || student.stream?.toString() || null;
    const streamId = _rs && /^[a-f\d]{24}$/i.test(_rs) ? _rs : null;
    const stId = student._id.toString();
    const allocMap = studentAllocMap[stId] || {};

    const myInsts = allInstallments.filter(i => { const fs = fsById[i.feeStructureId.toString()]; return fs && fs.classId.toString()===cid && (fs.streamId?.toString()||null)===streamId; });
    const myAddl  = additionalFees.filter(f => { const fc=f.classId?.toString()||null; const fs=f.streamId?.toString()||null; return (!fc&&!fs)||(fc===cid&&!fs)||(fc===cid&&fs===streamId); });
    const rawTransport = studentTransportMap[stId] || [];
    const transportByPeriod = {};
    for (const t of rawTransport) {
      if (!transportByPeriod[t.period]) { transportByPeriod[t.period]=t; continue; }
      const ex=transportByPeriod[t.period]; const tP=paidTransportRefIds.has(t._id.toString()); const eP=paidTransportRefIds.has(ex._id.toString());
      if(tP&&!eP){transportByPeriod[t.period]=t;}else if(!tP&&eP){continue;}else if(t.isActive&&!ex.isActive){transportByPeriod[t.period]=t;}else if(!t.isActive&&ex.isActive){continue;}else if(new Date(t.updatedAt)>new Date(ex.updatedAt)){transportByPeriod[t.period]=t;}
    }

    const tuitionTotal   = myInsts.reduce((s,i)=>s+Number(i.amount||0),0);
    const transportTotal = Object.values(transportByPeriod).reduce((s,t)=>s+Number(t.amount||0),0);
    const concession     = calculateConcession({ student, totalFee: tuitionTotal, transportTotal });

    const periodMap = buildStudentPeriodMap({ myInsts, myAdditional: myAddl, transportByPeriod, allocMap });
    const tuitionPeriodMap = {};
    for (const inst of myInsts) { const per=inst.period; if(!tuitionPeriodMap[per]) tuitionPeriodMap[per]={totalFee:0,paidAmount:0}; tuitionPeriodMap[per].totalFee+=Number(inst.amount||0); }
    const periodConc = buildSequentialConcessionMap({ periodMap: tuitionPeriodMap, concession });

    // Collect due periods for this student
    const myLateFees = studentLateFeeMap[stId] || [];
    const dueMonths = [];
    let totalDue = 0;
    for (const [per, vals] of Object.entries(periodMap)) {
      if (!isPeriodDue(per)) continue;
      const rawDue = parseFloat((vals.totalFee - vals.paidAmount).toFixed(2));
      if (rawDue <= 0) continue;
      const adjDue = parseFloat(Math.max(rawDue - (periodConc[per]||0), 0).toFixed(2));
      if (adjDue <= 0) continue;
      totalDue += adjDue;
      dueMonths.push(per);
    }
    const lateFeeDue = myLateFees.reduce((s,lf)=>s+Math.max(0,Number(lf.amount||0)-(lateFeePaidMap[lf._id.toString()]||0)),0);
    if (dueMonths.length === 0 && lateFeeDue <= 0) continue;

    totalDue += lateFeeDue;
    const name = [student.firstName, student.lastName].filter(Boolean).join(" ");
    const cls  = student.currentClass?.name || "";
    const sec  = student.currentSection?.name || "";
    defaulterRows.push({ name, className: cls, sectionName: sec, dueMonths: dueMonths.join(", "), totalDue, lateFeeDue });
  }

  if (!defaulterRows.length) return { type: "report_fee_defaulters_detailed", rows: [], formatted: className ? `"${className}" mein koi defaulter nahi 🎉` : "Koi fee defaulter nahi hai 🎉" };

  defaulterRows.sort((a,b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  const grandTotal = defaulterRows.reduce((s,r)=>s+r.totalDue, 0);
  const MAX = 20;
  const shown = defaulterRows.slice(0, MAX);
  const extra = defaulterRows.length - shown.length;

  const lines = shown.map((r,i) =>
    `${i+1}. **${r.name}** (${r.className}${r.sectionName?"-"+r.sectionName:""}) — Due Months: ${r.dueMonths} — **Total Due: ${inr(r.totalDue)}**${r.lateFeeDue>0?` (Late Fine: ${inr(r.lateFeeDue)})`:""}` 
  );
  if (extra > 0) lines.push(`...aur ${extra} aur defaulters`);

  return {
    type: "report_fee_defaulters_detailed",
    rows: shown, grandTotal, totalDefaulters: defaulterRows.length,
    formatted: [
      `**Defaulter List Detailed${className?" — "+className:""}** 📋`,
      `${defaulterRows.length} defaulters`,
      lines.join("\n"),
      ``,
      `**Total Outstanding: ${inr(grandTotal)}**`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   12. FEE DEPOSITED DETAILED (receipt-wise)
   Same as Reports → Fee Deposited Statement (Detailed)
════════════════════════════════════════════════════════ */
export async function reportFeeDepositedDetailed(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);
  const { fromDate, toDate, className } = params;

  const StudentPayment = getStudentPaymentModel(db);
  const match = { sessionId: sid, paymentStatus: "SUCCESS" };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate)   { const e = new Date(toDate); e.setHours(23,59,59,999); match.createdAt.$lte = e; }
  }

  const rows = await StudentPayment.aggregate([
    { $match: match },
    { $lookup: { from: "studentenrolments", localField: "studentId", foreignField: "_id", as: "student" } },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "classes",  localField: "classId",               foreignField: "_id", as: "cls" } },
    { $lookup: { from: "sections", localField: "student.currentSection", foreignField: "_id", as: "sec" } },
    { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$sec", preserveNullAndEmptyArrays: true } },
    ...(className ? [{ $match: { "cls.name": { $regex: new RegExp(className, "i") } } }] : []),
    { $sort: { createdAt: -1 } },
    { $limit: 25 },
    { $project: {
      receiptNo: 1, amountPaid: 1, paymentMode: 1,
      paidDate: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } },
      studentName: { $trim: { input: { $concat: [{ $ifNull: ["$student.firstName",""] }," ",{ $ifNull: ["$student.lastName",""] }] } } },
      className: "$cls.name", sectionName: "$sec.name",
    }},
  ]);

  if (!rows.length) return { type: "report_fee_deposited_detailed", rows: [], formatted: "Is period mein koi payment nahi mili." };

  const grandTotal = rows.reduce((s,r)=>s+Number(r.amountPaid||0), 0);
  const lines = rows.map((r,i) =>
    `${i+1}. **${r.studentName||"Unknown"}** (${r.className||"?"}${r.sectionName?"-"+r.sectionName:""}) — ${inr(r.amountPaid)} — ${r.paymentMode||"?"} — Receipt: ${r.receiptNo||"?"} — ${r.paidDate}`
  );

  return {
    type: "report_fee_deposited_detailed",
    rows, grandTotal,
    formatted: [
      `**Fee Deposited Statement (Detailed) — Last ${rows.length} transactions**`,
      lines.join("\n"),
      ``,
      `**Total: ${inr(grandTotal)}**`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   13. REGISTRATION FEE STATEMENT
   Same as Reports → Registration Fee Statement
════════════════════════════════════════════════════════ */
export async function reportRegistrationFeeStatement(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const { getStudentRegistrationModel } = await import("../../../../models/tenant/student/StudentRegistration.model.js");
  const StudentRegistration = getStudentRegistrationModel(db);

  const enrolled = await StudentEnrolment.aggregate([
    { $match: { session: sid } },
    { $lookup: { from: "studentregistrations", localField: "studentRegistrationId", foreignField: "_id", as: "reg" } },
    { $unwind: { path: "$reg", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "classes", localField: "currentClass", foreignField: "_id", as: "cls" } },
    { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
    { $project: {
      studentName: { $trim: { input: { $concat: [{ $ifNull: ["$firstName",""] }," ",{ $ifNull: ["$lastName",""] }] } } },
      fatherName: 1, className: "$cls.name",
      regFee: { $ifNull: ["$reg.registrationFee", "-"] },
      paymentMode: { $ifNull: ["$reg.paymentMode", "-"] },
      regDate: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } },
      isEnrolled: { $literal: "Enrolled" },
    }},
    { $sort: { className: 1 } },
    { $limit: 20 },
  ]);

  const nonEnrolled = await StudentRegistration.aggregate([
    { $match: { session: sid, isEnroll: false } },
    { $lookup: { from: "classes", localField: "currentClass", foreignField: "_id", as: "cls" } },
    { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
    { $project: {
      studentName: { $trim: { input: { $concat: [{ $ifNull: ["$firstName",""] }," ",{ $ifNull: ["$lastName",""] }] } } },
      fatherName: 1, className: "$cls.name",
      regFee: { $ifNull: ["$registrationFee", "-"] },
      paymentMode: { $ifNull: ["$paymentMode", "-"] },
      regDate: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } },
      isEnrolled: { $literal: "Non-Enrolled" },
    }},
    { $sort: { className: 1 } },
    { $limit: 10 },
  ]);

  const all = [...enrolled, ...nonEnrolled].sort((a,b) => (a.className||"").localeCompare(b.className||""));
  if (!all.length) return { type: "report_registration_fee", rows: [], formatted: "Koi registration fee record nahi mila." };

  const enrolledCount    = enrolled.length;
  const nonEnrolledCount = nonEnrolled.length;
  const shown = all.slice(0, 20);
  const lines = shown.map((r,i) =>
    `${i+1}. **${r.studentName||"?"}** (${r.className||"?"}) — Reg Fee: ₹${r.regFee} — ${r.paymentMode} — ${r.regDate} [${r.isEnrolled}]`
  );

  return {
    type: "report_registration_fee",
    rows: shown, enrolledCount, nonEnrolledCount,
    formatted: [
      `**Registration Fee Statement**`,
      `Enrolled: ${enrolledCount} | Non-Enrolled: ${nonEnrolledCount}`,
      lines.join("\n"),
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   14. REGISTRATION FEE CLASS-WISE
   Same as Reports → Registration Fee Class-wise
════════════════════════════════════════════════════════ */
export async function reportRegistrationFeeClasswise(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);

  const { getStudentRegistrationModel } = await import("../../../../models/tenant/student/StudentRegistration.model.js");
  const StudentRegistration = getStudentRegistrationModel(db);

  const result = await StudentRegistration.aggregate([
    { $match: { session: sid } },
    { $group: {
      _id: "$currentClass",
      totalStudents: { $sum: 1 },
      registrationFee: { $sum: { $convert: { input: "$registrationFee", to: "double", onError: 0, onNull: 0 } } },
      collected:       { $sum: { $cond: [{ $eq: ["$isEnroll", true] }, { $convert: { input: "$registrationFee", to: "double", onError: 0, onNull: 0 } }, 0] } },
    }},
    { $lookup: { from: "classes", localField: "_id", foreignField: "_id", as: "cls" } },
    { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
    { $project: { className: "$cls.name", totalStudents: 1, registrationFee: 1, collected: 1, balance: { $subtract: ["$registrationFee","$collected"] } } },
    { $sort: { className: 1 } },
  ]);

  if (!result.length) return { type: "report_registration_fee_classwise", rows: [], formatted: "Koi registration fee data nahi mila." };

  const grandTotal     = result.reduce((s,r)=>s+r.registrationFee,0);
  const grandCollected = result.reduce((s,r)=>s+r.collected,0);
  const grandBalance   = result.reduce((s,r)=>s+r.balance,0);
  const lines = result.map(r =>
    `• **${r.className||"?"}**: ${r.totalStudents} students | Total: ${inr(r.registrationFee)} | Collected: ${inr(r.collected)} | Balance: ${inr(r.balance)}`
  );

  return {
    type: "report_registration_fee_classwise",
    rows: result, grandTotal, grandCollected, grandBalance,
    formatted: [
      `**Registration Fee (Class-wise)**`,
      lines.join("\n"),
      ``,
      `**Grand Total: ${inr(grandTotal)} | Collected: ${inr(grandCollected)} | Balance: ${inr(grandBalance)}**`,
    ].join("\n"),
  };
}

/* ════════════════════════════════════════════════════════
   15. INACTIVE STUDENT FEE STATEMENT
   Same as Reports → Inactive Student Fee Statement
════════════════════════════════════════════════════════ */
export async function reportInactiveStudentFeeStatement(db, params = {}) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };
  const sid = toId(session._id);
  const { className } = params;

  const { calculateConcession } = await import("../../../../utils/feeHelper.js");

  const StudentEnrolment = getStudentEnrolmentModel(db);
  const FeeStructure     = getFeeStructureModel(db);
  const FeeInstallment   = getFeeInstallmentModel(db);
  const AdditionalFee    = getAdditionalFeeModel(db);
  const TransportFee     = getTransportFeeModel(db);
  const StudentPayment   = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const matchQuery = { session: sid, status: { $in: ["Left","Passed"] } };
  if (className) {
    const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
    const cls = await getClassModel(db).findOne({ name: { $regex: new RegExp(className,"i") }, isActive: true }).lean();
    if (cls) matchQuery.currentClass = cls._id;
  }

  const students = await StudentEnrolment.find(matchQuery).populate("currentClass","name").populate("currentSection","name").lean();
  if (!students.length) return { type: "report_inactive_fee_statement", rows: [], formatted: "Koi Left/Passed student nahi mila." };

  const studentIds = students.map(s => s._id);
  const classIds   = [...new Set(students.map(s => s.currentClass?._id?.toString()).filter(Boolean))];

  const [allStructures, additionalFees, allPayments, allTransportFees] = await Promise.all([
    FeeStructure.find({ sessionId: sid, classId: { $in: classIds.map(toId) }, isActive: true }).lean(),
    AdditionalFee.find({ sessionId: sid, isActive: true }).lean(),
    StudentPayment.find({ studentId: { $in: studentIds }, sessionId: sid, paymentStatus: "SUCCESS" }).lean(),
    TransportFee.find({ studentId: { $in: studentIds }, sessionId: sid, isActive: true }).lean(),
  ]);

  const fsIds = allStructures.map(f => f._id);
  const allInstallments = fsIds.length ? await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean() : [];
  const allPaymentIds   = allPayments.map(p => p._id);
  const allAllocations  = allPaymentIds.length ? await StudentPaymentAllocation.find({ paymentId: { $in: allPaymentIds } }).lean() : [];

  const payStudentMap = Object.fromEntries(allPayments.map(p => [p._id.toString(), p.studentId.toString()]));
  const studentPaidMap = {};
  for (const a of allAllocations) {
    const sId = payStudentMap[a.paymentId.toString()]; if (!sId) continue;
    studentPaidMap[sId] = (studentPaidMap[sId]||0)+Number(a.allocatedAmount||0);
  }
  const studentTransportMap = {};
  for (const t of allTransportFees) {
    const s = t.studentId.toString();
    if (!studentTransportMap[s]) studentTransportMap[s] = {};
    const ex = studentTransportMap[s][t.period];
    if (!ex || new Date(t.updatedAt) > new Date(ex.updatedAt)) studentTransportMap[s][t.period] = t;
  }
  const fsById = Object.fromEntries(allStructures.map(f => [f._id.toString(), f]));

  const rows = students.map(student => {
    const cid = student.currentClass?._id?.toString(); if (!cid) return null;
    const _rs = student.stream?.toString() || null;
    const streamId = _rs && /^[a-f\d]{24}$/i.test(_rs) ? _rs : null;
    const stId = student._id.toString();

    const myInsts    = allInstallments.filter(i => { const fs=fsById[i.feeStructureId.toString()]; return fs&&fs.classId.toString()===cid&&(fs.streamId?.toString()||null)===streamId; });
    const myAddl     = additionalFees.filter(f => { const fc=f.classId?.toString()||null; const fs=f.streamId?.toString()||null; return (!fc&&!fs)||(fc===cid&&!fs)||(fc===cid&&fs===streamId); });
    const tByPeriod  = studentTransportMap[stId] || {};

    const tuition   = myInsts.reduce((s,i)=>s+Number(i.amount||0),0);
    const addl      = myAddl.reduce((s,f)=>s+Number(f.amount||0),0);
    const transport = Object.values(tByPeriod).reduce((s,t)=>s+Number(t.amount||0),0);
    const gross     = tuition + addl + transport;
    const conc      = calculateConcession({ student, totalFee: tuition, transportTotal: transport });
    const totalFee  = parseFloat(Math.max(gross-conc,0).toFixed(2));
    const paid      = parseFloat((studentPaidMap[stId]||0).toFixed(2));
    const balance   = parseFloat(Math.max(totalFee-paid,0).toFixed(2));

    return {
      name: [student.firstName,student.lastName].filter(Boolean).join(" "),
      className: student.currentClass?.name||"-",
      sectionName: student.currentSection?.name||"-",
      status: student.status,
      totalFee, paid, balance,
    };
  }).filter(Boolean);

  rows.sort((a,b) => a.className.localeCompare(b.className)||a.name.localeCompare(b.name));
  const grandTotal    = rows.reduce((s,r)=>s+r.totalFee,0);
  const grandPaid     = rows.reduce((s,r)=>s+r.paid,0);
  const grandBalance  = rows.reduce((s,r)=>s+r.balance,0);
  const MAX=15; const shown=rows.slice(0,MAX); const extra=rows.length-shown.length;

  const lines = shown.map((r,i) =>
    `${i+1}. **${r.name}** (${r.className}${r.sectionName?"-"+r.sectionName:""}) [${r.status}] — Total: ${inr(r.totalFee)} | Paid: ${inr(r.paid)} | Balance: **${inr(r.balance)}**`
  );
  if (extra > 0) lines.push(`...aur ${extra} aur`);

  return {
    type: "report_inactive_fee_statement",
    rows: shown, totalStudents: rows.length, grandTotal, grandPaid, grandBalance,
    formatted: [
      `**Inactive Student Fee Statement${className?" — "+className:""}**`,
      `${rows.length} students (Left/Passed)`,
      lines.join("\n"),
      ``,
      `**Grand Total: ${inr(grandTotal)} | Paid: ${inr(grandPaid)} | Balance: ${inr(grandBalance)}**`,
    ].join("\n"),
  };
}
