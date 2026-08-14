// queries/aiReportQueries.js
//
// ⚠️  FEE ACCURACY NOTE
// queryReportDefaultersClasswise and queryReportFeeOutstanding previously computed
// expected fees by summing raw feeinstallment amounts — which missed:
//   • additionalfees (Lab, Exam, Activity etc.)
//   • transportfees
//   • fee concessions / waivers
//   • quarterly installment type
//   • correct academic-month → calendar-month mapping
//
// They now delegate to queryFeeOverview (aiFeeQueries.js) which uses
// calculateStudentPayableSummary — the same engine as the dashboard's
// "Defaulter fee Till [Month]" table — guaranteeing identical numbers.
//
import mongoose from "mongoose";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getStudentPaymentModel }   from "../../../../models/tenant/master/StudentPayment.model.js";
import { getFeeStructureModel }     from "../../../../models/tenant/master/FeeStructure.model.js";
import { inr, getCurrentSession }   from "./aiQueryHelpers.js";
import { queryFeeOverview }         from "./aiFeeQueries.js";

/* ────────────────────────────────────────────────────────────────
   REPORT: Fee Collection Summary
──────────────────────────────────────────────────────────────── */
export async function queryReportFeeCollection(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const StudentPayment = getStudentPaymentModel(db);
  const sid = new mongoose.Types.ObjectId(String(session._id));

  const [summary, byMode, byClass] = await Promise.all([
    StudentPayment.aggregate([
      { $match: { sessionId: sid, paymentStatus: "SUCCESS" } },
      { $group: { _id: null, total: { $sum: "$amountPaid" }, count: { $sum: 1 } } }
    ]),
    StudentPayment.aggregate([
      { $match: { sessionId: sid, paymentStatus: "SUCCESS" } },
      { $group: { _id: "$paymentMode", amount: { $sum: "$amountPaid" }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } }
    ]),
    StudentPayment.aggregate([
      { $match: { sessionId: sid, paymentStatus: "SUCCESS" } },
      { $lookup: { from: "classes", localField: "classId", foreignField: "_id", as: "cls" } },
      {
        $group: {
          _id: "$classId",
          className: { $first: { $arrayElemAt: ["$cls.name", 0] } },
          amount: { $sum: "$amountPaid" },
          count: { $sum: 1 }
        }
      },
      { $sort: { amount: -1 } }, { $limit: 10 }
    ])
  ]);

  const s = summary[0] || { total: 0, count: 0 };
  const modeLines  = byMode.map(m  => `• ${m._id || "Other"}: ${inr(m.amount)} (${m.count} txn)`);
  const classLines = byClass.map(c => `• ${c.className || "Unknown"}: ${inr(c.amount)}`);

  return {
    type: "report_fee_collection",
    totalCollected:    s.total,
    totalTransactions: s.count,
    byMode,
    byClass,
    formatted: `**Fee Collection Report**\nTotal: ${inr(s.total)} (${s.count} transactions)\n\n**By Payment Mode:**\n${modeLines.join("\n")}\n\n**Top Classes:**\n${classLines.join("\n")}`
  };
}

/* ────────────────────────────────────────────────────────────────
   REPORT: Fee Outstanding (Class-wise)
   Delegates to queryFeeOverview per-class so numbers match the
   dashboard "Defaulter fee Till [Month]" table exactly.
──────────────────────────────────────────────────────────────── */
export async function queryReportFeeOutstanding(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  // Get all active classes for this session
  const { getClassModel } = await import("../../../../models/tenant/master/Class.modal.js");
  const Class = getClassModel(db);
  const classes = await Class.find({ isActive: true }).lean();

  if (!classes.length) {
    return { type: "report_fee_outstanding", rows: [], formatted: "Koi class nahi mili." };
  }

  // Run queryFeeOverview per class in parallel (batched to avoid hammering DB)
  const BATCH_SIZE = 5;
  const rows = [];
  for (let i = 0; i < classes.length; i += BATCH_SIZE) {
    const batch = classes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(cls => queryFeeOverview(db, { className: cls.name }).catch(e => {
        console.error(`[FeeOutstandingReport] ${cls.name}: ${e.message}`);
        return null;
      }))
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (!r || r.error || r.totalStudents === 0) continue;
      rows.push({
        className:    batch[j].name,
        studentCount: r.totalStudents,
        expectedFee:  r.expectedFees,
        collectedFee: r.collectedFees,
        balance:      r.pendingFees,
        defaulters:   r.pendingCount,
        collectionRate: r.collectionRate,
      });
    }
  }

  rows.sort((a, b) => a.className.localeCompare(b.className));

  if (!rows.length) {
    return { type: "report_fee_outstanding", rows: [], formatted: "Koi data nahi mila." };
  }

  const grandExpected  = rows.reduce((s, r) => s + r.expectedFee,  0);
  const grandCollected = rows.reduce((s, r) => s + r.collectedFee, 0);
  const grandBalance   = rows.reduce((s, r) => s + r.balance,      0);
  const grandDefault   = rows.reduce((s, r) => s + r.defaulters,   0);

  const lines = rows.slice(0, 12).map(r =>
    `• **${r.className}**: Expected ${inr(r.expectedFee)} | Received ${inr(r.collectedFee)} | Pending ${inr(r.balance)} (${r.defaulters} defaulters, ${r.collectionRate}% collected)`
  );
  if (rows.length > 12) lines.push(`...aur ${rows.length - 12} classes`);

  return {
    type:          "report_fee_outstanding",
    rows,
    grandExpected,
    grandCollected,
    grandBalance,
    grandDefaulters: grandDefault,
    formatted: [
      `**Fee Outstanding Report (Class-wise)**`,
      lines.join("\n"),
      ``,
      `**Grand Total:** Expected ${inr(grandExpected)} | Received ${inr(grandCollected)} | Pending ${inr(grandBalance)} | Defaulters: ${grandDefault}`,
    ].join("\n"),
  };
}

/* ────────────────────────────────────────────────────────────────
   REPORT: Fee Mode Breakdown
──────────────────────────────────────────────────────────────── */
export async function queryReportFeeMode(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const StudentPayment = getStudentPaymentModel(db);
  const sid = new mongoose.Types.ObjectId(String(session._id));

  const result = await StudentPayment.aggregate([
    { $match: { sessionId: sid, paymentStatus: "SUCCESS" } },
    {
      $group: {
        _id: "$paymentMode",
        totalCollection:  { $sum: "$amountPaid" },
        totalTransactions: { $sum: 1 }
      }
    },
    { $sort: { totalCollection: -1 } }
  ]);

  const total = result.reduce((s, r) => s + r.totalCollection, 0);
  const lines = result.map(r =>
    `• ${r._id || "Other"}: ${inr(r.totalCollection)} (${r.totalTransactions} txn) — ${total > 0 ? Math.round((r.totalCollection / total) * 100) : 0}%`
  );

  return {
    type:       "report_fee_mode",
    modes:      result,
    grandTotal: total,
    formatted:  `**Payment Mode Report**\n${lines.join("\n")}\n\nTotal: ${inr(total)}`
  };
}

/* ────────────────────────────────────────────────────────────────
   REPORT: Class-wise Defaulter Summary
   Delegates to queryFeeOverview per-class — same logic as dashboard.
──────────────────────────────────────────────────────────────── */
export async function queryReportDefaultersClasswise(db) {
  // Fully delegate to queryReportFeeOutstanding which already does per-class
  // queryFeeOverview — this guarantees numbers match the dashboard exactly.
  const result = await queryReportFeeOutstanding(db);
  if (result.error) return result;

  if (!result.rows?.length) {
    return {
      type: "report_defaulters_classwise",
      rows: [],
      totalDefaulters:  0,
      totalOutstanding: 0,
      formatted: "Abhi koi defaulter nahi hai. 🎉",
    };
  }

  const rows = result.rows.map(r => ({
    className:   r.className,
    total:       r.studentCount,
    defaulters:  r.defaulters,
    outstanding: r.balance,
    collectionRate: r.collectionRate,
  }));

  const totalDefaulters  = rows.reduce((s, r) => s + r.defaulters,  0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  const lines = rows.map(r =>
    `• **${r.className}**: ${r.defaulters}/${r.total} defaulters — Pending ${inr(r.outstanding)} (${r.collectionRate}% collected)`
  );

  return {
    type: "report_defaulters_classwise",
    rows,
    totalDefaulters,
    totalOutstanding,
    formatted: [
      `**Class-wise Defaulter Summary**`,
      lines.join("\n"),
      ``,
      `**Total: ${totalDefaulters} defaulters | Outstanding: ${inr(totalOutstanding)}**`,
    ].join("\n"),
  };
}

/* ────────────────────────────────────────────────────────────────
   REPORT: Transport Summary
──────────────────────────────────────────────────────────────── */
export async function queryReportTransport(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const sid = new mongoose.Types.ObjectId(String(session._id));
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const getBus   = async () => db.models.BusMaster || (await import("../../../../models/tenant/master/BusMaster.model.js")).getBusModel(db);
  const getRoute = async () => db.models.Route     || (await import("../../../../models/tenant/master/RouteMaster.model.js")).getRouteModel(db);

  const [Bus, Route] = await Promise.all([getBus(), getRoute()]);

  const [totalBuses, totalRoutes, byTransportType, totalTransport] = await Promise.all([
    Bus.countDocuments({ isActive: true }),
    Route.countDocuments({ isActive: true }),
    StudentEnrolment.aggregate([
      { $match: { session: sid, status: "Studying", transportRequired: "YES" } },
      { $group: { _id: "$transportType", count: { $sum: 1 } } }
    ]),
    StudentEnrolment.countDocuments({ session: sid, status: "Studying", transportRequired: "YES" })
  ]);

  const typeLines = byTransportType.map(t => `• ${t._id || "Other"}: ${t.count} students`);

  return {
    type: "report_transport",
    totalBuses,
    totalRoutes,
    totalTransportStudents: totalTransport,
    byTransportType,
    formatted: `**Transport Report**\nTotal Buses: ${totalBuses} | Total Routes: ${totalRoutes}\nTransport Students: ${totalTransport}\n\n**By Type:**\n${typeLines.join("\n")}`
  };
}

/* ────────────────────────────────────────────────────────────────
   REPORT: Scholarship / Concession
──────────────────────────────────────────────────────────────── */
export async function queryReportScholarship(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const sid = new mongoose.Types.ObjectId(String(session._id));
  const StudentEnrolment = getStudentEnrolmentModel(db);

  const students = await StudentEnrolment.find(
    { session: sid, status: "Studying" },
    { firstName: 1, lastName: 1, currentClass: 1, discount: 1, discountType: 1, fullFeeConcession: 1, fullFeeExceptTransport: 1 }
  ).populate("currentClass", "name").lean();

  let fullConcession = 0, exceptTransport = 0, discountCount = 0;
  const list = [];

  for (const s of students) {
    const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
    const cls  = s.currentClass?.name || "?";
    if (s.fullFeeConcession) {
      fullConcession++;
      list.push({ name, class: cls, type: "Full Concession" });
    } else if (s.fullFeeExceptTransport) {
      exceptTransport++;
      list.push({ name, class: cls, type: "Full (Except Transport)" });
    } else if (s.discount && parseFloat(s.discount) > 0) {
      discountCount++;
      list.push({ name, class: cls, type: `${s.discountType === "%" ? s.discount + "%" : "₹" + s.discount} Discount` });
    }
  }

  const total = fullConcession + exceptTransport + discountCount;
  const shown = list.slice(0, 15);

  return {
    type:             "report_scholarship",
    total,
    fullConcession,
    exceptTransport,
    discountStudents: discountCount,
    students:         shown,
    formatted: `**Scholarship/Concession Report**\nTotal: ${total} students\n• Full Concession: ${fullConcession}\n• Full (Except Transport): ${exceptTransport}\n• Discount: ${discountCount}`
  };
}

/* ────────────────────────────────────────────────────────────────
   REPORT: Inactive/Left Students
──────────────────────────────────────────────────────────────── */
export async function queryReportStudentsInactive(db) {
  const session = await getCurrentSession(db);
  if (!session) return { error: "No active session" };

  const sid = new mongoose.Types.ObjectId(String(session._id));
  const StudentEnrolment = getStudentEnrolmentModel(db);

  const [byStatus, recent] = await Promise.all([
    StudentEnrolment.aggregate([
      { $match: { session: sid, status: { $in: ["Left", "Passed"] } } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),
    StudentEnrolment.find(
      { session: sid, status: { $in: ["Left", "Passed"] } },
      { firstName: 1, lastName: 1, currentClass: 1, status: 1 }
    ).populate("currentClass", "name").sort({ updatedAt: -1 }).limit(10).lean()
  ]);

  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const statusLines = byStatus.map(r => `• ${r._id}: ${r.count}`);
  const recentLines = recent.slice(0, 5).map(s =>
    `• ${[s.firstName, s.lastName].filter(Boolean).join(" ")} — ${s.currentClass?.name || "?"} (${s.status})`
  );

  return {
    type: "report_students_inactive",
    total,
    byStatus,
    recentStudents: recent,
    formatted: `**Inactive/Left Students Report**\nTotal: ${total}\n${statusLines.join("\n")}\n\n**Recent:**\n${recentLines.join("\n")}`
  };
}
