import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getMarksheetModel } from "../../../models/tenant/report/Marksheet.model.js";
import { getExamModel } from "../../../models/tenant/master/Exam.model.js";
import { getExamListModel } from "../../../models/tenant/master/ExamList.model.js";

/**
 * GET /reports/result-analysis
 * Query: sessionId (required), examMasterId (required), fromClassId (optional), toClassId (optional)
 *
 * Returns class-section wise result analysis:
 * - Total Students, Passed, Passed%, Students above 90/80/70/60/50/40/33%
 * - Grand Total row
 */
export const resultAnalysis = asyncHandler(async (req, res) => {
  const db = req.db;
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const Marksheet = getMarksheetModel(db);
  const ExamMaster = getExamModel(db);
  const ExamList = getExamListModel(db);

  const { sessionId, examMasterId, fromClassId, toClassId } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  if (!examMasterId || !mongoose.Types.ObjectId.isValid(examMasterId))
    return res.status(400).json(new apiResponse(400, null, "Valid examMasterId required"));

  const sessionOId = new mongoose.Types.ObjectId(sessionId);
  const examMasterOId = new mongoose.Types.ObjectId(examMasterId);

  // 1. Get all ExamLists for this exam master + session
  const examLists = await ExamList.find({
    examMasterId: examMasterOId,
    sessionId: sessionOId,
  }).lean();

  const examListIds = examLists.map((e) => e._id);

  if (examListIds.length === 0)
    return res.status(200).json(new apiResponse(200, { list: [], grandTotal: null }, "No exam lists found"));

  // 2. Get all classes for ordering (from DB)
  const allClasses = await db.collection("classes").find({}).toArray();
  const allSections = await db.collection("sections").find({}).toArray();

  const classMap = Object.fromEntries(allClasses.map((c) => [c._id.toString(), c]));
  const sectionMap = Object.fromEntries(allSections.map((s) => [s._id.toString(), s]));

  // Build ordered class list for from/to filter
  const orderedClasses = [...allClasses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const orderedClassIds = orderedClasses.map((c) => c._id.toString());

  let fromIdx = 0;
  let toIdx = orderedClassIds.length - 1;

  if (fromClassId && mongoose.Types.ObjectId.isValid(fromClassId)) {
    const idx = orderedClassIds.indexOf(fromClassId);
    if (idx !== -1) fromIdx = idx;
  }
  if (toClassId && mongoose.Types.ObjectId.isValid(toClassId)) {
    const idx = orderedClassIds.indexOf(toClassId);
    if (idx !== -1) toIdx = idx;
  }

  const filteredClassIds = orderedClassIds
    .slice(fromIdx, toIdx + 1)
    .map((id) => new mongoose.Types.ObjectId(id));

  // 3. Get all studying students in filtered classes
  const students = await StudentEnrolment.find({
    session: sessionOId,
    status: "Studying",
    currentClass: { $in: filteredClassIds },
  }).lean();

  const studentIds = students.map((s) => s._id);

  // 4. Get marksheets for these students + exam lists
  const marksheets = await Marksheet.find({
    studentId: { $in: studentIds },
    examListId: { $in: examListIds },
  }).lean();

  // Build: studentId -> best percentage across all examLists of this exam
  const studentPercentMap = {};
  for (const m of marksheets) {
    const sid = m.studentId.toString();
    const pct = Number(m.percentage || 0);
    if (!studentPercentMap[sid] || pct > studentPercentMap[sid]) {
      studentPercentMap[sid] = pct;
    }
  }

  // 5. Group students by class+section
  // key: classId_sectionId
  const groupMap = {};

  for (const student of students) {
    const cid = student.currentClass?.toString();
    const sid = student.currentSection?.toString() || "NO_SECTION";
    if (!cid) continue;
    const key = `${cid}_${sid}`;
    if (!groupMap[key]) {
      groupMap[key] = {
        classId: cid,
        sectionId: sid === "NO_SECTION" ? null : sid,
        className: classMap[cid]?.name || "",
        sectionName: sid === "NO_SECTION" ? "" : (sectionMap[sid]?.name || ""),
        classOrder: classMap[cid]?.order ?? 999,
        students: [],
      };
    }
    groupMap[key].students.push(student);
  }

  // 6. Calculate stats per group
  const THRESHOLDS = [90, 80, 70, 60, 50, 40, 33];

  const list = [];

  for (const group of Object.values(groupMap)) {
    const total = group.students.length;
    let passed = 0;
    const aboveCounts = Object.fromEntries(THRESHOLDS.map((t) => [t, 0]));

    for (const student of group.students) {
      const pct = studentPercentMap[student._id.toString()] ?? null;
      if (pct === null) continue; // no marksheet = not counted as passed

      if (pct >= 33) passed++;

      for (const threshold of THRESHOLDS) {
        if (pct >= threshold) aboveCounts[threshold]++;
      }
    }

    const passedPct = total > 0 ? parseFloat(((passed / total) * 100).toFixed(2)) : 0;

    list.push({
      className: group.className,
      sectionName: group.sectionName,
      classOrder: group.classOrder,
      totalStudents: total,
      passedStudents: passed,
      passedPct,
      above90: aboveCounts[90],
      above80: aboveCounts[80],
      above70: aboveCounts[70],
      above60: aboveCounts[60],
      above50: aboveCounts[50],
      above40: aboveCounts[40],
      above33: aboveCounts[33],
    });
  }

  // Sort by class order then section name
  list.sort((a, b) => a.classOrder - b.classOrder || a.sectionName.localeCompare(b.sectionName));

  // 7. Grand Total
  const grandTotal = {
    totalStudents: list.reduce((s, r) => s + r.totalStudents, 0),
    passedStudents: list.reduce((s, r) => s + r.passedStudents, 0),
    above90: list.reduce((s, r) => s + r.above90, 0),
    above80: list.reduce((s, r) => s + r.above80, 0),
    above70: list.reduce((s, r) => s + r.above70, 0),
    above60: list.reduce((s, r) => s + r.above60, 0),
    above50: list.reduce((s, r) => s + r.above50, 0),
    above40: list.reduce((s, r) => s + r.above40, 0),
    above33: list.reduce((s, r) => s + r.above33, 0),
  };
  grandTotal.passedPct =
    grandTotal.totalStudents > 0
      ? parseFloat(((grandTotal.passedStudents / grandTotal.totalStudents) * 100).toFixed(2))
      : 0;

  return res.status(200).json(
    new apiResponse(200, { list, grandTotal }, "Result analysis fetched successfully")
  );
});
