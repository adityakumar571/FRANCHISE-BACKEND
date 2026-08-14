import mongoose from "mongoose";
import { getAdditionalFeeWaiverModel } from "../../../models/tenant/master/AdditionalFeeWaiver.model.js";
import { getAdditionalFeeModel } from "../../../models/tenant/master/AdditionalFee.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

// Guard helper — all tenant controllers need req.db
const requireDb = (req, res) => {
  if (!req.db) {
    res.status(500).json(new apiResponse(500, null, "Tenant DB not available. Check x-tenant-id header."));
    return false;
  }
  return true;
};

/* ================================================================
   GET PENDING ADDITIONAL FEES FOR A STUDENT
   GET /additional-fees/pending-for-student
   Query: sessionId, studentId, classId
   Returns ALL active additional fees applicable to the student
   that are NOT yet fully waived.
================================================================ */
const getPendingFeesForStudent = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const AdditionalFee       = getAdditionalFeeModel(req.db);
  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(req.db);
  const StudentEnrolment    = getStudentEnrolmentModel(req.db);

  const { sessionId, studentId, classId } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId is required"));
  }
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid studentId is required"));
  }

  const sessionObjId = new mongoose.Types.ObjectId(sessionId);

  // Fetch student to get currentClass and stream
  const student = await StudentEnrolment.findById(studentId).lean();
  if (!student) {
    return res.status(404).json(new apiResponse(404, null, "Student not found"));
  }

  // Resolve classId — prefer from student enrollment, fallback to query param
  const classObjId = student.currentClass
    ? new mongoose.Types.ObjectId(student.currentClass.toString())
    : (classId && mongoose.Types.ObjectId.isValid(classId)
        ? new mongoose.Types.ObjectId(classId)
        : null);

  const streamObjId = student.stream
    ? new mongoose.Types.ObjectId(student.stream.toString())
    : null;

  // Build $or clauses:
  // 1. Global fees (classId = null) — apply to everyone
  // 2. Class-specific fees (no stream)
  // 3. Class + stream specific fees (senior classes)
  const orClauses = [
    { classId: null },
    { classId: { $exists: false } },
  ];

  if (classObjId) {
    orClauses.push({ classId: classObjId, streamId: null });
    orClauses.push({ classId: classObjId, streamId: { $exists: false } });
    if (streamObjId) {
      orClauses.push({ classId: classObjId, streamId: streamObjId });
    }
  }

  const allFees = await AdditionalFee.find({
    sessionId: sessionObjId,
    isActive:  true,
    $or:       orClauses,
  }).lean();

  if (!allFees.length) {
    return res.status(200).json(new apiResponse(200, { list: [] }, "No additional fees found for this student"));
  }

  // Fetch existing waiver records for this student
  const feeIds = allFees.map((f) => f._id);
  const waiverRecords = await AdditionalFeeWaiver.find({
    studentId:       new mongoose.Types.ObjectId(studentId),
    additionalFeeId: { $in: feeIds },
  }).lean();

  // Build map: additionalFeeId.toString() → waiverRecord
  const waiverMap = {};
  for (const w of waiverRecords) {
    waiverMap[w.additionalFeeId.toString()] = w;
  }

  // Return only fees that are NOT yet fully waived
  const pendingFees = allFees.filter((fee) => {
    const waiver = waiverMap[fee._id.toString()];
    if (!waiver) return true;          // no waiver at all → pending
    return !waiver.isWaived;           // partially waived → still pending
  });

  const list = pendingFees.map((fee) => ({
    _id:     fee._id,
    feeName: fee.feeName,
    period:  fee.period,
    amount:  fee.amount,
    dueDate: fee.dueDate,
    feeType: fee.feeType,
  }));

  return res.status(200).json(new apiResponse(200, { list }, "Pending additional fees fetched successfully"));
});

/* ================================================================
   GET ADDITIONAL FEE WAIVERS LIST
   GET /additional-fees/waiver
   Query: sessionId, classId?, sectionId?, studentId?, feeName?, page, limit
================================================================ */
const getAdditionalFeeWaivers = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(req.db);

  const {
    sessionId,
    classId,
    sectionId,
    studentId,
    feeName,
    page  = 1,
    limit = 10,
  } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId is required"));
  }

  const currentPage = Number(page);
  const perPage     = Number(limit);
  const skip        = (currentPage - 1) * perPage;

  const match = {
    sessionId:  new mongoose.Types.ObjectId(sessionId),
    $or: [{ isWaived: true }, { waivedAmount: { $gt: 0 } }],
  };

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    match.classId = new mongoose.Types.ObjectId(classId);
  }
  if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
    match.studentId = new mongoose.Types.ObjectId(studentId);
  }
  if (feeName) {
    match.feeName = { $regex: feeName, $options: "i" };
  }

  const result = await AdditionalFeeWaiver.aggregate([
    { $match: match },

    { $lookup: { from: "studentenrolments", localField: "studentId", foreignField: "_id", as: "student" } },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },

    ...(sectionId && mongoose.Types.ObjectId.isValid(sectionId)
      ? [{ $match: { "student.currentSection": new mongoose.Types.ObjectId(sectionId) } }]
      : []),

    { $lookup: { from: "classes",   localField: "student.currentClass",   foreignField: "_id", as: "class"   } },
    { $lookup: { from: "sections",  localField: "student.currentSection", foreignField: "_id", as: "section" } },
    { $unwind: { path: "$class",   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        studentName: { $trim: { input: { $concat: [
          { $ifNull: ["$student.firstName", ""] }, " ",
          { $ifNull: ["$student.lastName",  ""] },
        ]}}},
        fatherName:      "$student.fatherName",
        className:       "$class.name",
        sectionName:     "$section.name",
        feeName:         1,
        period:          1,
        amount:          1,
        waivedAmount:    1,
        isWaived:        1,
        waiverReason:    1,
        waivedAt:        1,
        additionalFeeId: 1,
        studentId:       1,
        createdAt:       1,
      },
    },

    { $sort: { createdAt: -1 } },
    { $facet: {
      list:       [{ $skip: skip }, { $limit: perPage }],
      totalCount: [{ $count: "count" }],
    }},
  ]);

  const list      = result[0]?.list || [];
  const totalRows = result[0]?.totalCount?.[0]?.count || 0;

  return res.status(200).json(new apiResponse(200, {
    list,
    pagination: { totalRows, totalPages: Math.ceil(totalRows / perPage), currentPage, perPage },
  }, "Additional fee waiver list fetched successfully"));
});

/* ================================================================
   WAIVE ADDITIONAL FEE
   POST /additional-fees/waiver
   Body: { sessionId, studentId, additionalFeeId, waivedAmount?, waiverReason? }
================================================================ */
const waiveAdditionalFee = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(req.db);
  const AdditionalFee       = getAdditionalFeeModel(req.db);
  const StudentEnrolment    = getStudentEnrolmentModel(req.db);

  const { sessionId, studentId, additionalFeeId, waivedAmount, waiverReason } = req.body;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId is required"));
  }
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid studentId is required"));
  }
  if (!additionalFeeId || !mongoose.Types.ObjectId.isValid(additionalFeeId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid additionalFeeId is required"));
  }

  const fee = await AdditionalFee.findById(additionalFeeId).lean();
  if (!fee) {
    return res.status(404).json(new apiResponse(404, null, "Additional fee not found"));
  }

  const student = await StudentEnrolment.findById(studentId).lean();
  if (!student) {
    return res.status(404).json(new apiResponse(404, null, "Student not found"));
  }

  let waiverRecord = await AdditionalFeeWaiver.findOne({ studentId, additionalFeeId });

  if (waiverRecord && waiverRecord.isWaived) {
    return res.status(400).json(new apiResponse(400, null, "This fee is already fully waived"));
  }

  const feeAmount      = Number(fee.amount);
  const existingWaived = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
  const remaining      = Math.max(0, feeAmount - existingWaived);

  if (remaining <= 0) {
    return res.status(400).json(new apiResponse(400, null, "This fee has already been fully waived"));
  }

  // blank waivedAmount → full waiver of remaining
  const requestedWaiver =
    waivedAmount !== undefined && waivedAmount !== null && waivedAmount !== ""
      ? parseFloat(waivedAmount)
      : remaining;

  if (isNaN(requestedWaiver) || requestedWaiver <= 0) {
    return res.status(400).json(new apiResponse(400, null, "waivedAmount must be a positive number"));
  }
  if (requestedWaiver > remaining) {
    return res.status(400).json(new apiResponse(400, null, `Cannot waive ₹${requestedWaiver}. Only ₹${remaining} remaining.`));
  }

  const newWaivedAmount = parseFloat((existingWaived + requestedWaiver).toFixed(2));
  const isFullWaiver    = newWaivedAmount >= feeAmount;

  if (waiverRecord) {
    waiverRecord.waivedAmount = newWaivedAmount;
    waiverRecord.isWaived     = isFullWaiver;
    waiverRecord.waivedBy     = req.user?._id || null;
    waiverRecord.waiverReason = waiverReason || null;
    waiverRecord.waivedAt     = new Date();
    await waiverRecord.save();
  } else {
    waiverRecord = await AdditionalFeeWaiver.create({
      sessionId,
      studentId,
      additionalFeeId,
      classId:      fee.classId || student.currentClass || null,
      sectionId:    student.currentSection || null,
      feeName:      fee.feeName,
      period:       fee.period,
      amount:       feeAmount,
      waivedAmount: newWaivedAmount,
      isWaived:     isFullWaiver,
      waivedBy:     req.user?._id || null,
      waiverReason: waiverReason || null,
      waivedAt:     new Date(),
    });
  }

  const remainingDue = parseFloat(Math.max(0, feeAmount - newWaivedAmount).toFixed(2));

  return res.status(200).json(new apiResponse(200,
    { ...waiverRecord.toObject(), remainingDue, isFullWaiver },
    isFullWaiver
      ? "Additional fee fully waived"
      : `Partial waiver of ₹${requestedWaiver} applied successfully`
  ));
});

/* ================================================================
   UPDATE WAIVER REASON
   POST /additional-fees/waiver/:id/reason
================================================================ */
const updateWaiverReason = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(req.db);

  const { id } = req.params;
  const { waiverReason } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(new apiResponse(400, null, "Valid waiver id is required"));
  }

  const waiverRecord = await AdditionalFeeWaiver.findById(id);
  if (!waiverRecord) {
    return res.status(404).json(new apiResponse(404, null, "Waiver record not found"));
  }

  waiverRecord.waiverReason = waiverReason ?? null;
  await waiverRecord.save();

  return res.status(200).json(new apiResponse(200, waiverRecord, "Waiver reason updated successfully"));
});

/* ================================================================
   UNWAIVE ADDITIONAL FEE
   POST /additional-fees/waiver/unwaive
   Body: { waiverId }
================================================================ */
const unwaiveAdditionalFee = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const AdditionalFeeWaiver = getAdditionalFeeWaiverModel(req.db);

  const { waiverId } = req.body;

  if (!waiverId || !mongoose.Types.ObjectId.isValid(waiverId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid waiverId is required"));
  }

  const waiverRecord = await AdditionalFeeWaiver.findById(waiverId);
  if (!waiverRecord) {
    return res.status(404).json(new apiResponse(404, null, "Waiver record not found"));
  }

  if (!waiverRecord.isWaived && !(Number(waiverRecord.waivedAmount) > 0)) {
    return res.status(400).json(new apiResponse(400, null, "This fee has no active waiver to reverse"));
  }

  waiverRecord.isWaived     = false;
  waiverRecord.waivedAmount = 0;
  waiverRecord.waivedBy     = null;
  waiverRecord.waiverReason = null;
  waiverRecord.waivedAt     = null;

  await waiverRecord.save();

  return res.status(200).json(new apiResponse(200, waiverRecord, "Additional fee waiver reversed successfully"));
});

export {
  getPendingFeesForStudent,
  getAdditionalFeeWaivers,
  waiveAdditionalFee,
  updateWaiverReason,
  unwaiveAdditionalFee,
};
