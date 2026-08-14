import mongoose from "mongoose";



/* ✅ MULTI-TENANT IMPORT (ADD) */
import { getTransportFeeModel } from "../models/tenant/master/TransportFee.model.js";
import { getStudentPaymentAllocationModel } from "../models/tenant/master/StudentPaymentAllocation.model.js";
import { getSessionModel } from "../models/tenant/master/Session.model.js";
import { getRouteStopModel } from "../models/tenant/master/RouteStops.model.js";
import { getStudentEnrolmentModel } from "../models/tenant/student/StudentEnrolment.model.js";
const MONTHLY_PERIODS = [
  { period: "APRIL", month: 4 },
  { period: "MAY", month: 5 },
  { period: "JUNE", month: 6 },
  { period: "JULY", month: 7 },
  { period: "AUGUST", month: 8 },
  { period: "SEPTEMBER", month: 9 },
  { period: "OCTOBER", month: 10 },
  { period: "NOVEMBER", month: 11 },
  { period: "DECEMBER", month: 12 },
  { period: "JANUARY", month: 1 },
  { period: "FEBRUARY", month: 2 },
  { period: "MARCH", month: 3 },
];

/* ================= HELPER ================= */

export const resolveTransportFee = (stop, transportType) => {
  if (!stop) return 0;
  if (transportType === "HOME_TO_SCHOOL") return stop.feeHomeToSchool || stop.feeAmount || 0;
  if (transportType === "SCHOOL_TO_HOME") return stop.feeSchoolToHome || stop.feeAmount || 0;
  return stop.feeBoth || stop.feeAmount || 0;
};

/* ================= PAID PERIODS ================= */

const getPaidPeriods = async (db, studentId, sessionId) => {

  const TransportFee = getTransportFeeModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const allRecords = await TransportFee.find({ studentId, sessionId });
  if (!allRecords.length) return new Set();

  const allIds = allRecords.map(r => r._id);

  const paidAllocations = await StudentPaymentAllocation.find({
    feeType: "TRANSPORT",
    referenceId: { $in: allIds },
    allocatedAmount: { $gt: 0 },
  });

  const paidRefIds = new Set(paidAllocations.map(a => a.referenceId.toString()));

  const paidPeriods = new Set();
  allRecords.forEach(r => {
    if (paidRefIds.has(r._id.toString())) {
      paidPeriods.add(r.period);
    }
  });

  return paidPeriods;
};

/* ================= GENERATE ================= */

export const generateTransportFees = async ({
  db, // ✅ ADD
  studentId,
  sessionId,
  routeId,
  stopId,
  transportType,
  amount,
  enrollmentDate,
  exemptMonths = [], // NEW: array of period strings to skip, e.g. ["JUNE","JULY"]
}) => {

  /* ✅ MODEL OVERRIDE */
  const TransportFee = getTransportFeeModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const Session = getSessionModel(db);
  const RouteStop = getRouteStopModel(db);
  const StudentEnrolment = getStudentEnrolmentModel(db);

  if (!studentId || !sessionId) return;

  const studentObjId = typeof studentId === "string"
    ? new mongoose.Types.ObjectId(studentId)
    : studentId;
  const sessionObjId = typeof sessionId === "string"
    ? new mongoose.Types.ObjectId(sessionId)
    : sessionId;

  let resolvedAmount = Number(amount) || 0;

  if (!resolvedAmount && stopId) {
    const stopDoc = await RouteStop.findById(stopId);
    resolvedAmount = resolveTransportFee(stopDoc, transportType || "BOTH");
  }

  if (!resolvedAmount) return;

  const session = await Session.findById(sessionObjId);
  if (!session) return;

  // If exemptMonths not provided, fetch from StudentEnrolment + Session vacation rules
  let finalExemptMonths = exemptMonths;
  if (!finalExemptMonths.length) {
    const enrolment = await StudentEnrolment.findById(studentObjId)
      .select("transportExemptMonths currentClass")
      .lean();
    finalExemptMonths = enrolment?.transportExemptMonths || [];

    // ── Read vacation rules embedded in Session ──
    const sessionWithVacation = await Session.findById(sessionObjId)
      .select("transportVacations")
      .lean();

    const vacations = (sessionWithVacation?.transportVacations || []).filter(
      (v) => v.isActive !== false
    );

    const classIdStr = enrolment?.currentClass?.toString();

    for (const v of vacations) {
      if (v.level === "SCHOOL") {
        // School-wide — apply to everyone
        finalExemptMonths = [...new Set([...finalExemptMonths, ...(v.months || [])])];
      } else if (v.level === "CLASS" && classIdStr) {
        // Class-level — only if student's class is in the list
        const matches = (v.classIds || []).some(
          (cid) => cid?.toString() === classIdStr
        );
        if (matches) {
          finalExemptMonths = [...new Set([...finalExemptMonths, ...(v.months || [])])];
        }
      }
    }
  }
  const exemptSet = new Set(finalExemptMonths.map(m => m.toUpperCase()));

  const [startYearStr] = session.sessionName.split("-");
  const startYear = Number(startYearStr);
  const endYear = startYear + 1;

  const fromDate = enrollmentDate ? new Date(enrollmentDate) : null;
  const cutoff = fromDate
    ? fromDate.getFullYear() * 100 + (fromDate.getMonth() + 1)
    : 0;

  const paidPeriods = await getPaidPeriods(db, studentObjId, sessionObjId);

  const existingRecords = await TransportFee.find({ studentId: studentObjId, sessionId: sessionObjId });

  const existingByPeriod = {};
  existingRecords.forEach(r => {
    if (!existingByPeriod[r.period]) existingByPeriod[r.period] = [];
    existingByPeriod[r.period].push(r);
  });

  const bulkOps = [];

  for (const { period, month } of MONTHLY_PERIODS) {
    const year = month >= 4 ? startYear : endYear;
    const periodTime = year * 100 + month;
    const dueDate = new Date(year, month - 1, 15);

    /* 🔥 IMPORTANT LOGIC (UNCHANGED) */
    if (paidPeriods.has(period)) {
      const records = existingByPeriod[period] || [];

      if (records.length > 1) {
        const allIds = records.map(r => r._id);

        const paidAllocs = await StudentPaymentAllocation.find({
          feeType: "TRANSPORT",
          referenceId: { $in: allIds },
          allocatedAmount: { $gt: 0 },
        });

        const paidRefIds = new Set(paidAllocs.map(a => a.referenceId.toString()));

        const unpaidDuplicates = records
          .filter(r => !paidRefIds.has(r._id.toString()))
          .map(r => r._id);

        if (unpaidDuplicates.length > 0) {
          bulkOps.push({
            updateMany: {
              filter: { _id: { $in: unpaidDuplicates } },
              update: { $set: { isActive: false } },
            },
          });
        }
      }

      continue;
    }

    // NEW: If this month is in the exempt list → deactivate it (no fee charged)
    if (exemptSet.has(period)) {
      bulkOps.push({
        updateOne: {
          filter: { studentId: studentObjId, sessionId: sessionObjId, period },
          update: { $set: { isActive: false } },
        },
      });
      continue;
    }

    if (periodTime >= cutoff) {
      bulkOps.push({
        updateOne: {
          filter: { studentId: studentObjId, sessionId: sessionObjId, period },
          update: {
            $set: {
              studentId: studentObjId,
              sessionId: sessionObjId,
              routeId: routeId ? new mongoose.Types.ObjectId(routeId) : null,
              stopId: stopId ? new mongoose.Types.ObjectId(stopId) : null,
              transportType: transportType || "BOTH",
              amount: resolvedAmount,
              dueDate,
              isActive: true,
            },
          },
          upsert: true,
        },
      });
    } else {
      bulkOps.push({
        updateOne: {
          filter: { studentId: studentObjId, sessionId: sessionObjId, period },
          update: { $set: { isActive: false } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await TransportFee.bulkWrite(bulkOps, { ordered: false });
  }
};

/* ================= REMOVE ================= */

export const removeTransportFees = async ({ db, studentId, sessionId }) => {

  const TransportFee = getTransportFeeModel(db);

  const studentObjId = new mongoose.Types.ObjectId(studentId);
  const sessionObjId = new mongoose.Types.ObjectId(sessionId);

  const paidPeriods = await getPaidPeriods(db, studentObjId, sessionObjId);

  const periodsToDeactivate = MONTHLY_PERIODS
    .map(p => p.period)
    .filter(p => !paidPeriods.has(p));

  if (periodsToDeactivate.length > 0) {
    await TransportFee.updateMany(
      { studentId: studentObjId, sessionId: sessionObjId, period: { $in: periodsToDeactivate } },
      { $set: { isActive: false } }
    );
  }
};

/* ================= DELETE ================= */

export const deleteUnpaidTransportFees = async ({ db, studentId, sessionId }) => {

  const TransportFee = getTransportFeeModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const studentObjId = new mongoose.Types.ObjectId(studentId);

  const allRecords = await TransportFee.find({ studentId: studentObjId });
  if (!allRecords.length) return;

  const allIds = allRecords.map(r => r._id);

  const paidAllocations = await StudentPaymentAllocation.find({
    feeType: "TRANSPORT",
    referenceId: { $in: allIds },
    allocatedAmount: { $gt: 0 },
  });

  const paidRefIds = new Set(paidAllocations.map(a => a.referenceId.toString()));

  const unpaidIds = allRecords
    .filter(r => !paidRefIds.has(r._id.toString()))
    .map(r => r._id);

  if (unpaidIds.length > 0) {
    await TransportFee.deleteMany({ _id: { $in: unpaidIds } });
  }
};