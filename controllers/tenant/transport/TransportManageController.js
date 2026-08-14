/**
 * TransportManageController.js
 *
 * Handles:
 *  1. Set/update exempt months for a student (vacation months, personal leave, etc.)
 *  2. Stop transport from a specific month (mid-session)
 *  3. Restart transport from a specific month (mid-session)
 *  4. Get transport status & history for a student
 *
 * All operations respect already-paid months — paid periods are never deactivated.
 */

import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getTransportFeeModel } from "../../../models/tenant/master/TransportFee.model.js";
import { getStudentPaymentAllocationModel } from "../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { getStudentPaymentModel } from "../../../models/tenant/master/StudentPayment.model.js";
import {
  generateTransportFees,
} from "../../../utils/transportFeeHelper.js";

const VALID_MONTHS = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
];

/* ─────────────────────────────────────────────────────────────
   HELPER: get paid periods for a student in a session
───────────────────────────────────────────────────────────── */
const getPaidTransportPeriods = async (db, studentId, sessionId) => {
  const TransportFee             = getTransportFeeModel(db);
  const StudentPayment           = getStudentPaymentModel(db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);

  const records = await TransportFee.find({ studentId, sessionId }).lean();
  if (!records.length) return new Set();

  const recordIds = records.map(r => r._id);

  const successPayIds = await StudentPayment.find({
    studentId, sessionId, paymentStatus: "SUCCESS",
  }).distinct("_id");

  const paidAllocs = await StudentPaymentAllocation.find({
    feeType: "TRANSPORT",
    referenceId: { $in: recordIds },
    paymentId: { $in: successPayIds },
    allocatedAmount: { $gt: 0 },
  }).lean();

  const paidRefIds = new Set(paidAllocs.map(a => a.referenceId.toString()));
  const paidPeriods = new Set();
  for (const r of records) {
    if (paidRefIds.has(r._id.toString())) paidPeriods.add(r.period);
  }
  return paidPeriods;
};

/* ─────────────────────────────────────────────────────────────
   1. GET transport status for a student
      GET /transport-manage/:studentId?sessionId=xxx
───────────────────────────────────────────────────────────── */
export const getStudentTransportStatus = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const TransportFee     = getTransportFeeModel(req.db);

  const { studentId } = req.params;
  const { sessionId } = req.query;

  if (!mongoose.Types.ObjectId.isValid(studentId))
    return res.status(400).json(new apiResponse(400, null, "Invalid studentId"));
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const enrolment = await StudentEnrolment.findById(studentId)
    .select("transportRequired transportExemptMonths transportHistory routeId stopId transportType transportAmount transportEnrollmentDate")
    .populate("routeId", "routeName routeCode")
    .populate("stopId", "stopName feeAmount feeHomeToSchool feeSchoolToHome feeBoth")
    .lean();

  if (!enrolment)
    return res.status(404).json(new apiResponse(404, null, "Student not found"));

  // Fetch all 12 monthly TransportFee records for this session
  const fees = await TransportFee.find({
    studentId: new mongoose.Types.ObjectId(studentId),
    sessionId: new mongoose.Types.ObjectId(sessionId),
  }).lean();

  // Deduplicate by period — pick active/latest
  const feeByPeriod = {};
  for (const f of fees) {
    const existing = feeByPeriod[f.period];
    if (!existing) { feeByPeriod[f.period] = f; continue; }
    if (f.isActive && !existing.isActive) { feeByPeriod[f.period] = f; continue; }
    if (new Date(f.updatedAt) > new Date(existing.updatedAt)) feeByPeriod[f.period] = f;
  }

  const paidPeriods = await getPaidTransportPeriods(
    req.db,
    new mongoose.Types.ObjectId(studentId),
    new mongoose.Types.ObjectId(sessionId),
  );

  const monthSummary = VALID_MONTHS.map(month => ({
    month,
    isExempt: (enrolment.transportExemptMonths || []).includes(month),
    isPaid: paidPeriods.has(month),
    isActive: feeByPeriod[month]?.isActive ?? false,
    amount: feeByPeriod[month]?.amount ?? 0,
    feeId: feeByPeriod[month]?._id ?? null,
  }));

  res.status(200).json(new apiResponse(200, {
    transportRequired: enrolment.transportRequired,
    transportExemptMonths: enrolment.transportExemptMonths || [],
    transportHistory: enrolment.transportHistory || [],
    route: enrolment.routeId,
    stop: enrolment.stopId,
    transportType: enrolment.transportType,
    transportAmount: enrolment.transportAmount,
    transportEnrollmentDate: enrolment.transportEnrollmentDate,
    monthSummary,
  }, "Transport status fetched"));
});

/* ─────────────────────────────────────────────────────────────
   2. SET EXEMPT MONTHS — vacation/summer break/specific months
      PATCH /transport-manage/:studentId/exempt-months
      Body: { sessionId, exemptMonths: ["JUNE","JULY"], reason: "Summer vacation" }
───────────────────────────────────────────────────────────── */
export const setTransportExemptMonths = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const { studentId } = req.params;
  const { sessionId, exemptMonths = [], reason = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(studentId))
    return res.status(400).json(new apiResponse(400, null, "Invalid studentId"));
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const invalidMonths = exemptMonths.filter(m => !VALID_MONTHS.includes(m.toUpperCase()));
  if (invalidMonths.length)
    return res.status(400).json(new apiResponse(400, null, `Invalid months: ${invalidMonths.join(", ")}`));

  const normalizedExempt = [...new Set(exemptMonths.map(m => m.toUpperCase()))];

  // Check which months are already paid — cannot exempt paid months
  const paidPeriods = await getPaidTransportPeriods(
    req.db,
    new mongoose.Types.ObjectId(studentId),
    new mongoose.Types.ObjectId(sessionId),
  );

  const alreadyPaid = normalizedExempt.filter(m => paidPeriods.has(m));
  if (alreadyPaid.length) {
    return res.status(400).json(new apiResponse(400, null,
      `Cannot exempt already-paid months: ${alreadyPaid.join(", ")}. Please adjust payment first.`
    ));
  }

  // Save exempt months on enrolment
  await StudentEnrolment.findByIdAndUpdate(studentId, {
    transportExemptMonths: normalizedExempt,
    // Log in history
    $push: {
      transportHistory: {
        action: "EXEMPT_UPDATE",
        month: normalizedExempt.join(",") || "NONE",
        date: new Date(),
        reason: reason || "Exempt months updated",
      },
    },
  });

  // Re-generate transport fees respecting exempt months
  const enrolment = await StudentEnrolment.findById(studentId)
    .select("routeId stopId transportType transportAmount transportEnrollmentDate session")
    .lean();

  if (enrolment?.routeId && enrolment?.stopId) {
    await generateTransportFees({
      db: req.db,
      studentId,
      sessionId,
      routeId: enrolment.routeId,
      stopId: enrolment.stopId,
      transportType: enrolment.transportType,
      amount: enrolment.transportAmount || undefined,
      enrollmentDate: enrolment.transportEnrollmentDate,
      exemptMonths: normalizedExempt,
    });
  }

  res.status(200).json(new apiResponse(200, {
    exemptMonths: normalizedExempt,
    paidMonths: [...paidPeriods],
  }, "Transport exempt months updated and fees recalculated"));
});

/* ─────────────────────────────────────────────────────────────
   3. STOP TRANSPORT from a specific month (mid-session)
      PATCH /transport-manage/:studentId/stop
      Body: { sessionId, fromMonth: "SEPTEMBER", reason: "Student leaving bus" }

      Effect: All unpaid months from `fromMonth` onwards → isActive: false
───────────────────────────────────────────────────────────── */
export const stopTransportFromMonth = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const TransportFee     = getTransportFeeModel(req.db);

  const { studentId } = req.params;
  const { sessionId, fromMonth, reason = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(studentId))
    return res.status(400).json(new apiResponse(400, null, "Invalid studentId"));
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));
  if (!fromMonth || !VALID_MONTHS.includes(fromMonth.toUpperCase()))
    return res.status(400).json(new apiResponse(400, null, `Invalid fromMonth. Valid: ${VALID_MONTHS.join(", ")}`));

  const month = fromMonth.toUpperCase();
  const fromIdx = VALID_MONTHS.indexOf(month);

  // Months from `fromMonth` to end of session
  const monthsToStop = VALID_MONTHS.slice(fromIdx);

  const paidPeriods = await getPaidTransportPeriods(
    req.db,
    new mongoose.Types.ObjectId(studentId),
    new mongoose.Types.ObjectId(sessionId),
  );

  // Only deactivate unpaid months
  const canDeactivate = monthsToStop.filter(m => !paidPeriods.has(m));

  if (canDeactivate.length) {
    await TransportFee.updateMany(
      {
        studentId: new mongoose.Types.ObjectId(studentId),
        sessionId: new mongoose.Types.ObjectId(sessionId),
        period: { $in: canDeactivate },
      },
      { $set: { isActive: false } }
    );
  }

  // Log in history
  await StudentEnrolment.findByIdAndUpdate(studentId, {
    $push: {
      transportHistory: {
        action: "STOP",
        month,
        date: new Date(),
        reason: reason || `Transport stopped from ${month}`,
      },
    },
  });

  const skippedPaid = monthsToStop.filter(m => paidPeriods.has(m));

  res.status(200).json(new apiResponse(200, {
    stoppedMonths: canDeactivate,
    skippedPaidMonths: skippedPaid,
    message: skippedPaid.length
      ? `Stopped transport from ${month}. Note: ${skippedPaid.join(", ")} already paid — cannot stop.`
      : `Transport stopped from ${month} onwards`,
  }, "Transport stopped successfully"));
});

/* ─────────────────────────────────────────────────────────────
   4. RESTART TRANSPORT from a specific month (mid-session)
      PATCH /transport-manage/:studentId/restart
      Body: { sessionId, fromMonth: "OCTOBER", reason: "Rejoining bus" }

      Effect: Re-activates transport fees from `fromMonth` onwards
              (respects exempt months and enrollment cutoff)
───────────────────────────────────────────────────────────── */
export const restartTransportFromMonth = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const { studentId } = req.params;
  const { sessionId, fromMonth, reason = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(studentId))
    return res.status(400).json(new apiResponse(400, null, "Invalid studentId"));
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));
  if (!fromMonth || !VALID_MONTHS.includes(fromMonth.toUpperCase()))
    return res.status(400).json(new apiResponse(400, null, `Invalid fromMonth. Valid: ${VALID_MONTHS.join(", ")}`));

  const month = fromMonth.toUpperCase();

  const enrolment = await StudentEnrolment.findById(studentId)
    .select("routeId stopId transportType transportAmount transportExemptMonths session")
    .lean();

  if (!enrolment)
    return res.status(404).json(new apiResponse(404, null, "Student not found"));
  if (!enrolment.routeId || !enrolment.stopId)
    return res.status(400).json(new apiResponse(400, null, "Student has no route/stop assigned. Assign transport first."));

  // Set transportEnrollmentDate to the 1st of `fromMonth` so fees regenerate from there
  const sessionDoc = await req.db.collection("sessions").findOne({ _id: new mongoose.Types.ObjectId(sessionId) });
  const startYear = sessionDoc ? Number(sessionDoc.sessionName.split("-")[0]) : new Date().getFullYear();

  // VALID_MONTHS = ["APRIL"(idx0), "MAY"(idx1), ..., "MARCH"(idx11)]
  // Calendar months: APRIL=4, MAY=5, ..., DECEMBER=12, JANUARY=1, ..., MARCH=3
  const CALENDAR_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const monthIdx = VALID_MONTHS.indexOf(month);
  const calendarMonth = CALENDAR_MONTHS[monthIdx]; // 1-12
  const calendarYear = calendarMonth >= 4 ? startYear : startYear + 1;
  const fromDate = new Date(calendarYear, calendarMonth - 1, 1);

  await generateTransportFees({
    db: req.db,
    studentId,
    sessionId,
    routeId: enrolment.routeId,
    stopId: enrolment.stopId,
    transportType: enrolment.transportType,
    amount: enrolment.transportAmount || undefined,
    enrollmentDate: fromDate,  // fees start from this month
    exemptMonths: enrolment.transportExemptMonths || [],
  });

  // Also update transportRequired to YES and set new enrollment date
  await StudentEnrolment.findByIdAndUpdate(studentId, {
    transportRequired: "YES",
    transportEnrollmentDate: fromDate,
    $push: {
      transportHistory: {
        action: "START",
        month,
        date: new Date(),
        reason: reason || `Transport restarted from ${month}`,
      },
    },
  });

  res.status(200).json(new apiResponse(200, {
    restartedFrom: month,
    fromDate,
  }, `Transport restarted from ${month} successfully`));
});
