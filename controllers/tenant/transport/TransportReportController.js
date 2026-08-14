/**
 * TransportReportController.js
 *
 * Reports:
 *  1. getTransportReport          — existing student list (unchanged)
 *  2. getTransportFeeCollection   — per-student paid/due breakdown
 *  3. getTransportDefaulters      — students with pending transport fee
 *  4. getRouteWiseCollection      — route-wise billing vs collection summary
 *  5. getMonthWiseFeeStatus       — month-wise transport fee status across session
 *  6. getExemptMonthsSummary      — students with vacation/exempt months (audit)
 */

import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getBusRouteModel } from "../../../models/tenant/master/BusRouteAssigne.model.js";
import { getTransportFeeModel } from "../../../models/tenant/master/TransportFee.model.js";
import { getStudentPaymentModel } from "../../../models/tenant/master/StudentPayment.model.js";
import { getStudentPaymentAllocationModel } from "../../../models/tenant/master/StudentPaymentAllocation.model.js";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

const ACADEMIC_MONTHS = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
];

/* ─────────────────────────────────────────────────────────────
   HELPER: Build paid amount map  referenceId → paidAmount
───────────────────────────────────────────────────────────── */
const buildPaidMap = async (db, sessionId, studentIds) => {
  const StudentPayment = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const successPayIds = await StudentPayment.find({
    sessionId,
    studentId: { $in: studentIds },
    paymentStatus: "SUCCESS",
  }).distinct("_id");

  if (!successPayIds.length) return {};

  const allocations = await StudentPaymentAllocation.find({
    paymentId: { $in: successPayIds },
    feeType: "TRANSPORT",
    allocatedAmount: { $gt: 0 },
  }).lean();

  const map = {};
  for (const a of allocations) {
    const rid = a.referenceId.toString();
    map[rid] = (map[rid] || 0) + Number(a.allocatedAmount);
  }
  return map;
};

/* ═══════════════════════════════════════════════════════════
   1. EXISTING — Student list (unchanged)
═══════════════════════════════════════════════════════════ */
const getTransportReport = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const BusRoute = getBusRouteModel(req.db);

  const {
    sessionId, routeId, stopId, classId,
    transportType, busId,
    page = 1, limit = 50, isPagination = "true",
  } = req.query;

  const match = { transportRequired: "YES", status: "Studying" };

  if (sessionId && mongoose.Types.ObjectId.isValid(sessionId))
    match.session = new mongoose.Types.ObjectId(sessionId);
  if (routeId && mongoose.Types.ObjectId.isValid(routeId))
    match.routeId = new mongoose.Types.ObjectId(routeId);
  if (busId && mongoose.Types.ObjectId.isValid(busId)) {
    const busRoutes = await BusRoute.find({ busId: new mongoose.Types.ObjectId(busId) }).select("routeId");
    match.routeId = { $in: busRoutes.map((br) => br.routeId) };
  }
  if (stopId && mongoose.Types.ObjectId.isValid(stopId))
    match.stopId = new mongoose.Types.ObjectId(stopId);
  if (classId && mongoose.Types.ObjectId.isValid(classId))
    match.currentClass = new mongoose.Types.ObjectId(classId);
  if (transportType) match.transportType = transportType;

  const skip = (Number(page) - 1) * Number(limit);

  const pipeline = [
    { $match: match },
    { $lookup: { from: "routes",     localField: "routeId",       foreignField: "_id", as: "route"   } },
    { $unwind: { path: "$route",   preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "routestops", localField: "stopId",        foreignField: "_id", as: "stop"    } },
    { $unwind: { path: "$stop",    preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "classes",   localField: "currentClass",   foreignField: "_id", as: "class"   } },
    { $unwind: { path: "$class",   preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "sections",  localField: "currentSection", foreignField: "_id", as: "section" } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        studentId: 1, firstName: 1, middleName: 1, lastName: 1,
        phone: 1, rollNumber: 1, fatherName: 1,
        transportType: 1, transportAmount: 1,
        transportRequired: 1,
        transportExemptMonths: 1,
        route:   { _id: "$route._id",   routeName: "$route.routeName",   routeCode: "$route.routeCode"   },
        stop:    { _id: "$stop._id",    stopName:  "$stop.stopName",     feeAmount: "$stop.feeAmount"    },
        class:   { _id: "$class._id",   name: "$class.name"   },
        section: { _id: "$section._id", name: "$section.name" },
      },
    },
    { $sort: { "route.routeName": 1, "stop.stopName": 1, "class.name": 1 } },
  ];

  const countResult = await StudentEnrolment.aggregate([...pipeline, { $count: "count" }]);
  const total = countResult[0]?.count || 0;

  if (isPagination === "true") pipeline.push({ $skip: skip }, { $limit: Number(limit) });

  const students = await StudentEnrolment.aggregate(pipeline);

  const summaryResult = await StudentEnrolment.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        homeToSchool: { $sum: { $cond: [{ $eq: ["$transportType", "HOME_TO_SCHOOL"] }, 1, 0] } },
        schoolToHome: { $sum: { $cond: [{ $eq: ["$transportType", "SCHOOL_TO_HOME"] }, 1, 0] } },
        both:         { $sum: { $cond: [{ $eq: ["$transportType", "BOTH"] }, 1, 0] } },
        totalAmount:  { $sum: { $ifNull: ["$transportAmount", 0] } },
      },
    },
  ]);

  const summary = summaryResult[0] || { total: 0, homeToSchool: 0, schoolToHome: 0, both: 0, totalAmount: 0 };
  delete summary._id;

  res.status(200).json(new apiResponse(200, {
    students, summary,
    pagination: { totalRows: total, totalPages: Math.ceil(total / Number(limit)), currentPage: Number(page), perPage: Number(limit) },
  }, "Transport report fetched successfully"));
});

/* ═══════════════════════════════════════════════════════════
   2. TRANSPORT FEE COLLECTION — per student paid vs due
      GET /transport/report/fee-collection?sessionId=&routeId=&stopId=&classId=&page=&limit=
═══════════════════════════════════════════════════════════ */
const getTransportFeeCollection = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const TransportFee     = getTransportFeeModel(req.db);

  const {
    sessionId, routeId, stopId, classId, sectionId,
    page = 1, limit = 20,
  } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const sessionOId = new mongoose.Types.ObjectId(sessionId);

  // Build student match
  const studentMatch = { transportRequired: "YES", status: "Studying", session: sessionOId };
  if (routeId  && mongoose.Types.ObjectId.isValid(routeId))  studentMatch.routeId       = new mongoose.Types.ObjectId(routeId);
  if (stopId   && mongoose.Types.ObjectId.isValid(stopId))   studentMatch.stopId        = new mongoose.Types.ObjectId(stopId);
  if (classId  && mongoose.Types.ObjectId.isValid(classId))  studentMatch.currentClass  = new mongoose.Types.ObjectId(classId);
  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId)) studentMatch.currentSection = new mongoose.Types.ObjectId(sectionId);

  const students = await StudentEnrolment.find(studentMatch)
    .select("firstName middleName lastName phone fatherName rollNumber studentId currentClass currentSection routeId stopId transportType transportAmount transportExemptMonths")
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .populate("routeId", "routeName routeCode")
    .populate("stopId", "stopName")
    .lean();

  if (!students.length)
    return res.status(200).json(new apiResponse(200, { list: [], summary: {}, pagination: { totalRows: 0, totalPages: 0 } }, "No transport students found"));

  const studentIds = students.map((s) => s._id);

  // All active transport fee records
  const allFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: sessionOId,
    isActive: true,
  }).lean();

  // Build map: studentId → { period → feeRecord }
  const feeMap = {};
  for (const f of allFees) {
    const sid = f.studentId.toString();
    if (!feeMap[sid]) feeMap[sid] = {};
    const existing = feeMap[sid][f.period];
    if (!existing || new Date(f.updatedAt) > new Date(existing.updatedAt)) {
      feeMap[sid][f.period] = f;
    }
  }

  // Build paid map
  const paidMap = await buildPaidMap(req.db, sessionOId, studentIds);

  // Build per-student summary
  const rows = [];
  let grandTotal = 0, grandPaid = 0;

  for (const s of students) {
    const sid = s._id.toString();
    const fees = Object.values(feeMap[sid] || {});

    const totalBilled = fees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const totalPaid   = fees.reduce((sum, f) => sum + (paidMap[f._id.toString()] || 0), 0);
    const balance     = Math.max(0, totalBilled - totalPaid);

    grandTotal += totalBilled;
    grandPaid  += totalPaid;

    // Month-wise breakdown
    const monthBreakdown = ACADEMIC_MONTHS.map((month) => {
      const fee = feeMap[sid]?.[month];
      const isExempt = (s.transportExemptMonths || []).includes(month);
      if (isExempt) return { month, status: "EXEMPT", amount: 0, paid: 0, due: 0 };
      if (!fee)     return { month, status: "INACTIVE", amount: 0, paid: 0, due: 0 };
      const paid = paidMap[fee._id.toString()] || 0;
      const due  = Math.max(0, Number(fee.amount) - paid);
      return {
        month,
        status: paid >= Number(fee.amount) ? "PAID" : due > 0 ? "DUE" : "PAID",
        amount: Number(fee.amount),
        paid,
        due,
      };
    });

    rows.push({
      _id:          s._id,
      studentId:    s.studentId,
      studentName:  `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.trim(),
      fatherName:   s.fatherName || "",
      phone:        s.phone || "",
      rollNumber:   s.rollNumber || "",
      className:    s.currentClass?.name || "",
      sectionName:  s.currentSection?.name || "",
      routeName:    s.routeId?.routeName || "",
      stopName:     s.stopId?.stopName || "",
      transportType: s.transportType || "",
      monthlyAmount: s.transportAmount || 0,
      totalBilled,
      totalPaid,
      balance,
      status:       balance <= 0 ? "CLEAR" : "PENDING",
      monthBreakdown,
    });
  }

  // Sort: pending first, then by balance desc
  rows.sort((a, b) => (b.balance - a.balance));

  const totalRows  = rows.length;
  const totalPages = Math.ceil(totalRows / Number(limit));
  const skip       = (Number(page) - 1) * Number(limit);
  const list       = rows.slice(skip, skip + Number(limit));

  res.status(200).json(new apiResponse(200, {
    list,
    summary: {
      totalStudents:  totalRows,
      grandTotalBilled: grandTotal,
      grandTotalPaid:   grandPaid,
      grandBalance:     Math.max(0, grandTotal - grandPaid),
      clearStudents:   rows.filter((r) => r.status === "CLEAR").length,
      pendingStudents: rows.filter((r) => r.status === "PENDING").length,
    },
    pagination: { totalRows, totalPages, currentPage: Number(page), perPage: Number(limit) },
  }, "Transport fee collection report fetched"));
});

/* ═══════════════════════════════════════════════════════════
   3. TRANSPORT DEFAULTERS — students with balance > 0
      GET /transport/report/defaulters?sessionId=&routeId=&stopId=&classId=&month=
═══════════════════════════════════════════════════════════ */
const getTransportDefaulters = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const TransportFee     = getTransportFeeModel(req.db);

  const {
    sessionId, routeId, stopId, classId, sectionId,
    month,  // optional: filter to specific month
    page = 1, limit = 20,
  } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const sessionOId = new mongoose.Types.ObjectId(sessionId);

  const studentMatch = { transportRequired: "YES", status: "Studying", session: sessionOId };
  if (routeId   && mongoose.Types.ObjectId.isValid(routeId))   studentMatch.routeId        = new mongoose.Types.ObjectId(routeId);
  if (stopId    && mongoose.Types.ObjectId.isValid(stopId))    studentMatch.stopId         = new mongoose.Types.ObjectId(stopId);
  if (classId   && mongoose.Types.ObjectId.isValid(classId))   studentMatch.currentClass   = new mongoose.Types.ObjectId(classId);
  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId)) studentMatch.currentSection = new mongoose.Types.ObjectId(sectionId);

  const students = await StudentEnrolment.find(studentMatch)
    .select("firstName middleName lastName phone fatherName rollNumber studentId currentClass currentSection routeId stopId transportType transportAmount transportExemptMonths")
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .populate("routeId", "routeName routeCode")
    .populate("stopId", "stopName")
    .lean();

  if (!students.length)
    return res.status(200).json(new apiResponse(200, { list: [], summary: {}, pagination: { totalRows: 0, totalPages: 0 } }, "No students"));

  const studentIds = students.map((s) => s._id);

  // Fee query — optionally filter by specific month
  // Only fees whose dueDate has passed (overdue) = actual defaulters
  // If dueDate is null, use period-based fallback (compare with current academic month)
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const feeQuery = {
    studentId: { $in: studentIds },
    sessionId: sessionOId,
    isActive: true,
    $or: [
      { dueDate: { $lte: today } },          // dueDate set aur past hai
      { dueDate: { $exists: false } },        // dueDate set nahi — period se decide hoga
      { dueDate: null },                      // dueDate null
    ],
  }
  if (month && ACADEMIC_MONTHS.includes(month.toUpperCase())) feeQuery.period = month.toUpperCase();

  const allFees = await TransportFee.find(feeQuery).lean();

  // Dedup by period per student
  const feeMap = {};
  for (const f of allFees) {
    const sid = f.studentId.toString();
    if (!feeMap[sid]) feeMap[sid] = {};
    const existing = feeMap[sid][f.period];
    if (!existing || new Date(f.updatedAt) > new Date(existing.updatedAt)) {
      feeMap[sid][f.period] = f;
    }
  }

  const paidMap = await buildPaidMap(req.db, sessionOId, studentIds);

  const rows = [];

  for (const s of students) {
    const sid  = s._id.toString()
    const fees = Object.values(feeMap[sid] || {})
    const exemptMonths = new Set(s.transportExemptMonths || [])

    const pendingMonths = [];
    let totalDue = 0;

    for (const f of fees) {
      // Skip exempt months
      if (exemptMonths.has(f.period)) continue;

      // If dueDate is null/missing, use period-based check (same as fee defaulters isPeriodDue)
      if (f.dueDate) {
        const fDueDate = new Date(f.dueDate)
        if (fDueDate > today) continue; // future due date — not a defaulter yet
      } else {
        // No dueDate — check period against current academic month
        const currentMonthIdx = ACADEMIC_MONTHS.indexOf(
          new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase()
        )
        const periodIdx = ACADEMIC_MONTHS.indexOf(f.period)
        if (periodIdx > currentMonthIdx && currentMonthIdx !== -1) continue; // future period
      }

      const paid = paidMap[f._id.toString()] || 0;
      const due  = Math.max(0, Number(f.amount) - paid);
      if (due > 0) {
        pendingMonths.push({ month: f.period, amount: Number(f.amount), paid, due });
        totalDue += due;
      }
    }

    if (totalDue <= 0) continue; // not a defaulter

    // Sort pending months in academic order
    pendingMonths.sort((a, b) => ACADEMIC_MONTHS.indexOf(a.month) - ACADEMIC_MONTHS.indexOf(b.month));

    rows.push({
      _id:          s._id,
      studentId:    s.studentId,
      studentName:  `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.trim(),
      fatherName:   s.fatherName || "",
      phone:        s.phone || "",
      rollNumber:   s.rollNumber || "",
      className:    s.currentClass?.name || "",
      sectionName:  s.currentSection?.name || "",
      routeName:    s.routeId?.routeName || "",
      stopName:     s.stopId?.stopName || "",
      transportType: s.transportType || "",
      monthlyAmount: s.transportAmount || 0,
      totalDue,
      pendingMonthsCount: pendingMonths.length,
      pendingMonths,
    });
  }

  rows.sort((a, b) => b.totalDue - a.totalDue);

  const totalRows  = rows.length;
  const totalPages = Math.ceil(totalRows / Number(limit));
  const skip       = (Number(page) - 1) * Number(limit);
  const list       = rows.slice(skip, skip + Number(limit));

  res.status(200).json(new apiResponse(200, {
    list,
    summary: {
      totalDefaulters: totalRows,
      totalOutstanding: rows.reduce((s, r) => s + r.totalDue, 0),
    },
    pagination: { totalRows, totalPages, currentPage: Number(page), perPage: Number(limit) },
  }, "Transport defaulter report fetched"));
});

/* ═══════════════════════════════════════════════════════════
   4. ROUTE-WISE COLLECTION SUMMARY
      GET /transport/report/route-wise?sessionId=
═══════════════════════════════════════════════════════════ */
const getRouteWiseCollection = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const TransportFee     = getTransportFeeModel(req.db);

  const { sessionId } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const sessionOId = new mongoose.Types.ObjectId(sessionId);

  // All transport students this session
  const students = await StudentEnrolment.find({
    transportRequired: "YES",
    status: "Studying",
    session: sessionOId,
  }).select("_id routeId stopId").lean();

  const studentIds = students.map((s) => s._id);

  if (!studentIds.length)
    return res.status(200).json(new apiResponse(200, { list: [] }, "No transport students"));

  const paidMap = await buildPaidMap(req.db, sessionOId, studentIds);

  const allFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: sessionOId,
    isActive: true,
  }).populate("routeId", "routeName routeCode")
    .lean();

  // Group by route
  const routeMap = {};

  for (const f of allFees) {
    const routeKey  = f.routeId?._id?.toString() || "unknown";
    const routeName = f.routeId?.routeName || "Unknown Route";
    const routeCode = f.routeId?.routeCode || "";

    if (!routeMap[routeKey]) {
      routeMap[routeKey] = {
        routeId: routeKey,
        routeName,
        routeCode,
        studentSet: new Set(),
        totalBilled: 0,
        totalPaid: 0,
      };
    }

    const studentId = f.studentId.toString();
    routeMap[routeKey].studentSet.add(studentId);

    const amount = Number(f.amount || 0);
    const paid   = paidMap[f._id.toString()] || 0;

    routeMap[routeKey].totalBilled += amount;
    routeMap[routeKey].totalPaid   += paid;
  }

  const list = Object.values(routeMap).map((r) => ({
    routeId:     r.routeId,
    routeName:   r.routeName,
    routeCode:   r.routeCode,
    totalStudents: r.studentSet.size,
    totalBilled:  r.totalBilled,
    totalPaid:    r.totalPaid,
    balance:      Math.max(0, r.totalBilled - r.totalPaid),
    collectionPct: r.totalBilled > 0
      ? parseFloat(((r.totalPaid / r.totalBilled) * 100).toFixed(1))
      : 0,
  })).sort((a, b) => b.balance - a.balance);

  const grandBilled = list.reduce((s, r) => s + r.totalBilled, 0);
  const grandPaid   = list.reduce((s, r) => s + r.totalPaid, 0);

  res.status(200).json(new apiResponse(200, {
    list,
    summary: {
      totalRoutes:  list.length,
      grandBilled,
      grandPaid,
      grandBalance: Math.max(0, grandBilled - grandPaid),
    },
  }, "Route-wise collection fetched"));
});

/* ═══════════════════════════════════════════════════════════
   5. MONTH-WISE FEE STATUS — across entire session
      GET /transport/report/month-wise?sessionId=
═══════════════════════════════════════════════════════════ */
const getMonthWiseFeeStatus = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const TransportFee     = getTransportFeeModel(req.db);

  const { sessionId } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const sessionOId = new mongoose.Types.ObjectId(sessionId);

  const students = await StudentEnrolment.find({
    transportRequired: "YES",
    status: "Studying",
    session: sessionOId,
  }).select("_id transportExemptMonths").lean();

  const studentIds = students.map((s) => s._id);
  if (!studentIds.length)
    return res.status(200).json(new apiResponse(200, { list: [] }, "No transport students"));

  // Build exempt set per student
  const exemptMap = {};
  for (const s of students) {
    exemptMap[s._id.toString()] = new Set(s.transportExemptMonths || []);
  }

  const allFees = await TransportFee.find({
    studentId: { $in: studentIds },
    sessionId: sessionOId,
  }).lean();

  const paidMap = await buildPaidMap(req.db, sessionOId, studentIds);

  // Dedup per student per period
  const feeMap = {};
  for (const f of allFees) {
    const sid = f.studentId.toString();
    if (!feeMap[sid]) feeMap[sid] = {};
    const existing = feeMap[sid][f.period];
    if (!existing || new Date(f.updatedAt) > new Date(existing.updatedAt)) {
      feeMap[sid][f.period] = f;
    }
  }

  // For each month — aggregate across all students
  const list = ACADEMIC_MONTHS.map((month) => {
    let activeCount  = 0;
    let exemptCount  = 0;
    let inactiveCount = 0;
    let totalBilled  = 0;
    let totalPaid    = 0;

    for (const s of students) {
      const sid = s._id.toString();
      const isExempt = exemptMap[sid]?.has(month);
      const fee = feeMap[sid]?.[month];

      if (isExempt) {
        exemptCount++;
        continue;
      }
      if (!fee || !fee.isActive) {
        inactiveCount++;
        continue;
      }
      activeCount++;
      const amount = Number(fee.amount || 0);
      const paid   = paidMap[fee._id.toString()] || 0;
      totalBilled += amount;
      totalPaid   += paid;
    }

    return {
      month,
      activeStudents:   activeCount,
      exemptStudents:   exemptCount,
      inactiveStudents: inactiveCount,
      totalBilled,
      totalPaid,
      balance:    Math.max(0, totalBilled - totalPaid),
      paidCount:  0,  // filled below
      dueCount:   0,
      collectionPct: totalBilled > 0
        ? parseFloat(((totalPaid / totalBilled) * 100).toFixed(1))
        : 0,
    };
  });

  // Fill paidCount / dueCount — requires per-fee check
  for (const monthRow of list) {
    let paidC = 0, dueC = 0;
    for (const s of students) {
      const sid = s._id.toString();
      const fee = feeMap[sid]?.[monthRow.month];
      if (!fee || !fee.isActive) continue;
      const paid = paidMap[fee._id.toString()] || 0;
      if (paid >= Number(fee.amount)) paidC++;
      else dueC++;
    }
    monthRow.paidCount = paidC;
    monthRow.dueCount  = dueC;
  }

  res.status(200).json(new apiResponse(200, {
    list,
    summary: {
      totalStudents: studentIds.length,
      grandBilled:   list.reduce((s, m) => s + m.totalBilled, 0),
      grandPaid:     list.reduce((s, m) => s + m.totalPaid, 0),
      grandBalance:  list.reduce((s, m) => s + m.balance, 0),
    },
  }, "Month-wise transport fee status fetched"));
});

/* ═══════════════════════════════════════════════════════════
   6. EXEMPT MONTHS SUMMARY — audit of vacation/exempt settings
      GET /transport/report/exempt-summary?sessionId=
═══════════════════════════════════════════════════════════ */
const getExemptMonthsSummary = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const { sessionId, page = 1, limit = 20 } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const sessionOId = new mongoose.Types.ObjectId(sessionId);

  // Only students who have at least 1 exempt month
  const students = await StudentEnrolment.find({
    session: sessionOId,
    status: "Studying",
    transportRequired: "YES",
    transportExemptMonths: { $exists: true, $not: { $size: 0 } },
  })
    .select("firstName middleName lastName phone studentId fatherName currentClass currentSection routeId transportExemptMonths transportHistory transportAmount")
    .populate("currentClass", "name")
    .populate("currentSection", "name")
    .populate("routeId", "routeName routeCode")
    .lean();

  const totalRows  = students.length;
  const totalPages = Math.ceil(totalRows / Number(limit));
  const skip       = (Number(page) - 1) * Number(limit);

  const list = students.slice(skip, skip + Number(limit)).map((s) => ({
    _id:           s._id,
    studentId:     s.studentId,
    studentName:   `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.trim(),
    fatherName:    s.fatherName || "",
    phone:         s.phone || "",
    className:     s.currentClass?.name || "",
    sectionName:   s.currentSection?.name || "",
    routeName:     s.routeId?.routeName || "",
    monthlyAmount: s.transportAmount || 0,
    exemptMonths:  s.transportExemptMonths || [],
    exemptCount:   s.transportExemptMonths?.length || 0,
    // Last relevant history entry
    lastHistoryEntry: (s.transportHistory || [])
      .filter((h) => h.action === "EXEMPT_UPDATE")
      .slice(-1)[0] || null,
  }));

  // Month-wise count: how many students exempt in each month
  const monthExemptCount = {};
  for (const m of ACADEMIC_MONTHS) monthExemptCount[m] = 0;
  for (const s of students) {
    for (const m of (s.transportExemptMonths || [])) {
      if (monthExemptCount[m] !== undefined) monthExemptCount[m]++;
    }
  }

  res.status(200).json(new apiResponse(200, {
    list,
    monthExemptCount,  // { JUNE: 45, JULY: 45, MAY: 3, ... }
    summary: {
      totalExemptStudents: totalRows,
      totalStudentsInSession: await StudentEnrolment.countDocuments({
        session: sessionOId, transportRequired: "YES", status: "Studying",
      }),
    },
    pagination: { totalRows, totalPages, currentPage: Number(page), perPage: Number(limit) },
  }, "Exempt months summary fetched"));
});

export {
  getTransportReport,
  getTransportFeeCollection,
  getTransportDefaulters,
  getRouteWiseCollection,
  getMonthWiseFeeStatus,
  getExemptMonthsSummary,
};
