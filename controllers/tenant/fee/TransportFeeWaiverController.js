import mongoose from "mongoose";
import { getTransportFeeWaiverModel } from "../../../models/tenant/master/TransportFeeWaiver.model.js";
import { getTransportFeeModel } from "../../../models/tenant/master/TransportFee.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

const requireDb = (req, res) => {
  if (!req.db) {
    res.status(500).json(new apiResponse(500, null, "Tenant DB not available"));
    return false;
  }
  return true;
};

/* ================================================================
   GET PENDING TRANSPORT FEES FOR A STUDENT
   GET /transport-fees/pending-for-student
   Query: sessionId, studentId
   Returns all active transport fee records not yet fully waived
================================================================ */
export const getPendingTransportFeesForStudent = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const TransportFee        = getTransportFeeModel(req.db);
  const TransportFeeWaiver  = getTransportFeeWaiverModel(req.db);

  const { sessionId, studentId } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId))
    return res.status(400).json(new apiResponse(400, null, "Valid studentId required"));

  const fees = await TransportFee.find({
    studentId,
    sessionId,
    isActive: true,
  }).lean();

  if (!fees.length)
    return res.status(200).json(new apiResponse(200, { list: [] }, "No transport fees found"));

  const feeIds = fees.map(f => f._id);
  const waiverRecords = await TransportFeeWaiver.find({
    studentId,
    transportFeeId: { $in: feeIds },
  }).lean();

  const waiverMap = {};
  for (const w of waiverRecords) {
    waiverMap[w.transportFeeId.toString()] = w;
  }

  // Return only fees not yet fully waived
  const pending = fees
    .filter(f => {
      const w = waiverMap[f._id.toString()];
      return !w || !w.isWaived;
    })
    .map(f => {
      const w = waiverMap[f._id.toString()];
      return {
        _id:          f._id,
        period:       f.period,
        amount:       f.amount,
        dueDate:      f.dueDate,
        waivedAmount: w ? w.waivedAmount : 0,
        remaining:    Math.max(0, f.amount - (w ? w.waivedAmount : 0)),
      };
    });

  return res.status(200).json(new apiResponse(200, { list: pending }, "Pending transport fees fetched"));
});

/* ================================================================
   GET TRANSPORT FEE WAIVERS LIST
   GET /transport-fees/waiver
   Query: sessionId, classId?, sectionId?, studentId?, page, limit
================================================================ */
export const getTransportFeeWaivers = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const TransportFeeWaiver = getTransportFeeWaiverModel(req.db);

  const { sessionId, classId, sectionId, studentId, page = 1, limit = 10 } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));

  const currentPage = Number(page);
  const perPage     = Number(limit);
  const skip        = (currentPage - 1) * perPage;

  const match = {
    sessionId: new mongoose.Types.ObjectId(sessionId),
    $or: [{ isWaived: true }, { waivedAmount: { $gt: 0 } }],
  };

  if (classId   && mongoose.Types.ObjectId.isValid(classId))
    match.classId   = new mongoose.Types.ObjectId(classId);
  if (studentId && mongoose.Types.ObjectId.isValid(studentId))
    match.studentId = new mongoose.Types.ObjectId(studentId);

  const result = await TransportFeeWaiver.aggregate([
    { $match: match },

    { $lookup: { from: "studentenrolments", localField: "studentId", foreignField: "_id", as: "student" } },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },

    ...(sectionId && mongoose.Types.ObjectId.isValid(sectionId)
      ? [{ $match: { "student.currentSection": new mongoose.Types.ObjectId(sectionId) } }]
      : []),

    { $lookup: { from: "classes",  localField: "student.currentClass",   foreignField: "_id", as: "class"   } },
    { $lookup: { from: "sections", localField: "student.currentSection", foreignField: "_id", as: "section" } },
    { $unwind: { path: "$class",   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        studentName: { $trim: { input: { $concat: [
          { $ifNull: ["$student.firstName", ""] }, " ",
          { $ifNull: ["$student.lastName",  ""] },
        ]}}},
        fatherName:     "$student.fatherName",
        className:      "$class.name",
        sectionName:    "$section.name",
        period:         1,
        amount:         1,
        waivedAmount:   1,
        isWaived:       1,
        waiverReason:   1,
        waivedAt:       1,
        transportFeeId: 1,
        studentId:      1,
        createdAt:      1,
      },
    },

    { $sort: { createdAt: -1 } },
    { $facet: {
      list:       [{ $skip: skip }, { $limit: perPage }],
      totalCount: [{ $count: "count" }],
    }},
  ]);

  const list      = result[0]?.list       || [];
  const totalRows = result[0]?.totalCount?.[0]?.count || 0;

  return res.status(200).json(new apiResponse(200, {
    list,
    pagination: { totalRows, totalPages: Math.ceil(totalRows / perPage), currentPage, perPage },
  }, "Transport fee waiver list fetched"));
});

/* ================================================================
   WAIVE TRANSPORT FEE
   POST /transport-fees/waiver
   Body: { sessionId, studentId, transportFeeId, waivedAmount?, waiverReason? }
   - waivedAmount blank → full waiver of remaining amount
================================================================ */
export const waiveTransportFee = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const TransportFeeWaiver = getTransportFeeWaiverModel(req.db);
  const TransportFee       = getTransportFeeModel(req.db);
  const StudentEnrolment   = getStudentEnrolmentModel(req.db);

  const { sessionId, studentId, transportFeeId, waivedAmount, waiverReason } = req.body;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId))
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId))
    return res.status(400).json(new apiResponse(400, null, "Valid studentId required"));
  if (!transportFeeId || !mongoose.Types.ObjectId.isValid(transportFeeId))
    return res.status(400).json(new apiResponse(400, null, "Valid transportFeeId required"));

  const fee = await TransportFee.findById(transportFeeId).lean();
  if (!fee)
    return res.status(404).json(new apiResponse(404, null, "Transport fee record not found"));

  const student = await StudentEnrolment.findById(studentId).lean();
  if (!student)
    return res.status(404).json(new apiResponse(404, null, "Student not found"));

  let waiverRecord = await TransportFeeWaiver.findOne({ studentId, transportFeeId });

  if (waiverRecord && waiverRecord.isWaived)
    return res.status(400).json(new apiResponse(400, null, "This transport fee is already fully waived"));

  const feeAmount      = Number(fee.amount);
  const existingWaived = waiverRecord ? Number(waiverRecord.waivedAmount || 0) : 0;
  const remaining      = Math.max(0, feeAmount - existingWaived);

  if (remaining <= 0)
    return res.status(400).json(new apiResponse(400, null, "This fee has already been fully waived"));

  // blank waivedAmount → full waiver of remaining
  const requestedWaiver =
    waivedAmount !== undefined && waivedAmount !== null && waivedAmount !== ""
      ? parseFloat(waivedAmount)
      : remaining;

  if (isNaN(requestedWaiver) || requestedWaiver <= 0)
    return res.status(400).json(new apiResponse(400, null, "waivedAmount must be a positive number"));
  if (requestedWaiver > remaining)
    return res.status(400).json(new apiResponse(400, null, `Cannot waive ₹${requestedWaiver}. Only ₹${remaining} remaining.`));

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
    waiverRecord = await TransportFeeWaiver.create({
      sessionId,
      studentId,
      transportFeeId,
      classId:      student.currentClass   || null,
      sectionId:    student.currentSection || null,
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
      ? "Transport fee fully waived"
      : `Partial waiver of ₹${requestedWaiver} applied successfully`
  ));
});

/* ================================================================
   UNWAIVE TRANSPORT FEE
   POST /transport-fees/waiver/unwaive
   Body: { waiverId }
================================================================ */
export const unwaiveTransportFee = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const TransportFeeWaiver = getTransportFeeWaiverModel(req.db);

  const { waiverId } = req.body;

  if (!waiverId || !mongoose.Types.ObjectId.isValid(waiverId))
    return res.status(400).json(new apiResponse(400, null, "Valid waiverId required"));

  const waiverRecord = await TransportFeeWaiver.findById(waiverId);
  if (!waiverRecord)
    return res.status(404).json(new apiResponse(404, null, "Waiver record not found"));

  if (!waiverRecord.isWaived && !(Number(waiverRecord.waivedAmount) > 0))
    return res.status(400).json(new apiResponse(400, null, "No active waiver to reverse"));

  waiverRecord.isWaived     = false;
  waiverRecord.waivedAmount = 0;
  waiverRecord.waivedBy     = null;
  waiverRecord.waiverReason = null;
  waiverRecord.waivedAt     = null;
  await waiverRecord.save();

  return res.status(200).json(new apiResponse(200, waiverRecord, "Transport fee waiver reversed successfully"));
});

/* ================================================================
   UPDATE WAIVER REASON
   POST /transport-fees/waiver/:id/reason
================================================================ */
export const updateTransportWaiverReason = asyncHandler(async (req, res) => {
  if (!requireDb(req, res)) return;

  const TransportFeeWaiver = getTransportFeeWaiverModel(req.db);

  const { id } = req.params;
  const { waiverReason } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json(new apiResponse(400, null, "Valid waiver id required"));

  const waiverRecord = await TransportFeeWaiver.findById(id);
  if (!waiverRecord)
    return res.status(404).json(new apiResponse(404, null, "Waiver record not found"));

  waiverRecord.waiverReason = waiverReason ?? null;
  await waiverRecord.save();

  return res.status(200).json(new apiResponse(200, waiverRecord, "Waiver reason updated"));
});
