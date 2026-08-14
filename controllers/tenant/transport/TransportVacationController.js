/**
 * TransportVacationController.js
 *
 * Vacation rules are embedded inside Session.transportVacations[]
 * → NO new collection created → solves MongoDB 500-collection limit.
 *
 * APIs:
 *  GET    /transport-vacation?sessionId=    → all rules for session
 *  POST   /transport-vacation               → add/update school or class rule
 *  PATCH  /transport-vacation/:ruleId       → update a specific rule
 *  DELETE /transport-vacation/:ruleId       → deactivate a rule
 *
 * Query params always include sessionId.
 */

import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getSessionModel } from "../../../models/tenant/master/Session.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { generateTransportFees } from "../../../utils/transportFeeHelper.js";

const VALID_MONTHS = [
  "APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER",
  "OCTOBER","NOVEMBER","DECEMBER","JANUARY","FEBRUARY","MARCH",
];

/* ─────────────────────────────────────────────────────────────
   HELPER: recalculate fees for all affected students
───────────────────────────────────────────────────────────── */
const recalculateAffectedStudents = async (db, sessionId, classIds = []) => {
  const StudentEnrolment = getStudentEnrolmentModel(db);

  const match = {
    session:          new mongoose.Types.ObjectId(sessionId),
    transportRequired: "YES",
    status:           "Studying",
    routeId: { $exists: true, $ne: null },
    stopId:  { $exists: true, $ne: null },
  };

  if (classIds.length) {
    match.currentClass = { $in: classIds.map((id) => new mongoose.Types.ObjectId(id.toString())) };
  }

  const students = await StudentEnrolment.find(match)
    .select("_id routeId stopId transportType transportAmount transportEnrollmentDate")
    .lean();

  const BATCH = 20;
  for (let i = 0; i < students.length; i += BATCH) {
    await Promise.all(
      students.slice(i, i + BATCH).map((s) =>
        generateTransportFees({
          db,
          studentId:      s._id,
          sessionId,
          routeId:        s.routeId,
          stopId:         s.stopId,
          transportType:  s.transportType,
          amount:         s.transportAmount || undefined,
          enrollmentDate: s.transportEnrollmentDate,
          // exemptMonths NOT passed → helper reads vacation from Session + student
        }).catch((err) =>
          console.error(`Fee recalc failed for ${s._id}:`, err.message)
        )
      )
    );
  }
  return students.length;
};

/* ─────────────────────────────────────────────────────────────
   GET  /transport-vacation?sessionId=xxx
───────────────────────────────────────────────────────────── */
export const getVacationRules = asyncHandler(async (req, res) => {
  const Session = getSessionModel(req.db);
  const { sessionId } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const session = await Session.findById(sessionId)
    .populate("transportVacations.classIds", "name")
    .select("transportVacations")
    .lean();

  if (!session)
    return res.status(404).json(new apiResponse(404, null, "Session not found"));

  const active = (session.transportVacations || []).filter((r) => r.isActive !== false);

  res.status(200).json(new apiResponse(200, active, "Vacation rules fetched"));
});

/* ─────────────────────────────────────────────────────────────
   POST /transport-vacation  — create / upsert a rule
   Body: { sessionId, level, classIds?, months[], reason? }
───────────────────────────────────────────────────────────── */
export const setVacationRule = asyncHandler(async (req, res) => {
  const Session = getSessionModel(req.db);
  const { sessionId, level, classIds = [], months = [], reason = "" } = req.body;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));
  if (!["SCHOOL", "CLASS"].includes(level))
    return res.status(400).json(new apiResponse(400, null, "level must be SCHOOL or CLASS"));
  if (!months.length)
    return res.status(400).json(new apiResponse(400, null, "At least one month required"));
  if (level === "CLASS" && !classIds.length)
    return res.status(400).json(new apiResponse(400, null, "classIds required for CLASS level"));

  const invalid = months.filter((m) => !VALID_MONTHS.includes(m.toUpperCase()));
  if (invalid.length)
    return res.status(400).json(new apiResponse(400, null, `Invalid months: ${invalid.join(", ")}`));

  const normalizedMonths = [...new Set(months.map((m) => m.toUpperCase()))];

  const session = await Session.findById(sessionId);
  if (!session)
    return res.status(404).json(new apiResponse(404, null, "Session not found"));

  if (level === "SCHOOL") {
    // Upsert — only one school-level rule per session
    const existing = session.transportVacations.find(
      (r) => r.level === "SCHOOL" && r.isActive !== false
    );
    if (existing) {
      existing.months   = normalizedMonths;
      existing.reason   = reason;
      existing.isActive = true;
    } else {
      session.transportVacations.push({ level: "SCHOOL", classIds: [], months: normalizedMonths, reason, isActive: true });
    }
  } else {
    // CLASS — add new rule
    session.transportVacations.push({
      level:    "CLASS",
      classIds: classIds.map((id) => new mongoose.Types.ObjectId(id)),
      months:   normalizedMonths,
      reason,
      isActive: true,
    });
  }

  await session.save();

  const affectedCount = await recalculateAffectedStudents(
    req.db, sessionId, level === "CLASS" ? classIds : []
  );

  res.status(200).json(new apiResponse(200, {
    rule: session.transportVacations.slice(-1)[0],
    affectedStudents: affectedCount,
    message: `Vacation set for ${normalizedMonths.join(", ")}. ${affectedCount} students recalculated.`,
  }, "Vacation rule saved"));
});

/* ─────────────────────────────────────────────────────────────
   PATCH /transport-vacation/:ruleId  — update months/reason
   Body: { sessionId, months?, reason?, classIds? }
───────────────────────────────────────────────────────────── */
export const updateVacationRule = asyncHandler(async (req, res) => {
  const Session = getSessionModel(req.db);
  const { ruleId } = req.params;
  const { sessionId, months, reason, classIds } = req.body;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const session = await Session.findById(sessionId);
  if (!session) return res.status(404).json(new apiResponse(404, null, "Session not found"));

  const rule = session.transportVacations.id(ruleId);
  if (!rule) return res.status(404).json(new apiResponse(404, null, "Rule not found"));

  if (months?.length) {
    const invalid = months.filter((m) => !VALID_MONTHS.includes(m.toUpperCase()));
    if (invalid.length)
      return res.status(400).json(new apiResponse(400, null, `Invalid months: ${invalid.join(", ")}`));
    rule.months = [...new Set(months.map((m) => m.toUpperCase()))];
  }
  if (reason !== undefined) rule.reason = reason;
  if (classIds?.length)     rule.classIds = classIds.map((id) => new mongoose.Types.ObjectId(id));

  await session.save();

  const affectedCount = await recalculateAffectedStudents(
    req.db, sessionId,
    rule.level === "CLASS" ? rule.classIds.map((c) => c.toString()) : []
  );

  res.status(200).json(new apiResponse(200, {
    rule, affectedStudents: affectedCount,
  }, `Updated. ${affectedCount} students recalculated.`));
});

/* ─────────────────────────────────────────────────────────────
   DELETE /transport-vacation/:ruleId  — deactivate rule
   Query: ?sessionId=xxx
───────────────────────────────────────────────────────────── */
export const deleteVacationRule = asyncHandler(async (req, res) => {
  const Session = getSessionModel(req.db);
  const { ruleId } = req.params;
  const { sessionId } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const session = await Session.findById(sessionId);
  if (!session) return res.status(404).json(new apiResponse(404, null, "Session not found"));

  const rule = session.transportVacations.id(ruleId);
  if (!rule) return res.status(404).json(new apiResponse(404, null, "Rule not found"));

  const savedLevel    = rule.level;
  const savedClassIds = rule.classIds.map((c) => c.toString());

  rule.isActive = false;
  await session.save();

  const affectedCount = await recalculateAffectedStudents(
    req.db, sessionId,
    savedLevel === "CLASS" ? savedClassIds : []
  );

  res.status(200).json(new apiResponse(200, {
    affectedStudents: affectedCount,
  }, `Rule removed. ${affectedCount} students' fees restored.`));
});
