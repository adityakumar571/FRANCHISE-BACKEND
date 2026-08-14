import mongoose from "mongoose";
import { getLateFeeModel } from "../../../models/tenant/master/LateFee.model.js";
import { getLateFeeSettingModel } from "../../../models/tenant/master/LateFeeSetting.model.js";
import { getFeeInstallmentModel } from "../../../models/tenant/master/FeeInstallment.model.js";
import { getFeeStructureModel } from "../../../models/tenant/master/FeeStructure.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getStudentPaymentModel } from "../../../models/tenant/master/StudentPayment.model.js";
import { getStudentPaymentAllocationModel } from "../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { syncLateFees } from "../../../utils/lateFeeHelper.js";

/* ================================================================
   GET LATE FEE LIST
   GET /late-fee?sessionId&classId&sectionId&period&studentId&isWaived&page&limit
================================================================ */
const getLateFeeList = asyncHandler(async (req, res) => {
  const LateFee = getLateFeeModel(req.db);

  const {
    sessionId,
    period,
    studentId,
    classId,
    sectionId,   // ✅ added
    isWaived,
    page  = 1,
    limit = 10,
  } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId is required"));
  }

  const currentPage = Number(page);
  const perPage     = Number(limit);
  const skip        = (currentPage - 1) * perPage;

  const match = { sessionId: new mongoose.Types.ObjectId(sessionId) };

  if (period)   match.period    = period.toUpperCase();
  if (studentId && mongoose.Types.ObjectId.isValid(studentId))
    match.studentId = new mongoose.Types.ObjectId(studentId);
  if (classId && mongoose.Types.ObjectId.isValid(classId))
    match.classId = new mongoose.Types.ObjectId(classId);
  if (isWaived !== undefined) {
    if (isWaived === "true") {
      // Show both fully waived AND partially waived records
      match.$or = [
        { isWaived: true },
        { waivedAmount: { $gt: 0 } },
      ];
    } else {
      // pending: not waived and no partial waiver applied
      match.isWaived    = false;
      match.waivedAmount = { $in: [null, 0] };
    }
  }

  const result = await LateFee.aggregate([
    { $match: match },

    // ── If fetching non-waived (pending) fees, exclude those already paid ──
    ...(isWaived === "false" ? [{
      $lookup: {
        from: "studentpaymentallocations",
        let:  { lfId: "$_id" },
        pipeline: [
          { $match: { $expr: {
            $and: [
              { $eq: ["$referenceId", "$$lfId"] },
              { $eq: ["$feeType", "LATE_FEE"] },
              { $gt:  ["$allocatedAmount", 0] },
            ]
          }}}
        ],
        as: "allocations"
      }
    }, {
      $match: { "allocations": { $size: 0 } }  // only unpaid
    }] : []),

    { $lookup: { from: "studentenrolments", localField: "studentId", foreignField: "_id", as: "student" } },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },

    // ✅ Section filter — applied after join since LateFee doesn't store sectionId
    ...(sectionId && mongoose.Types.ObjectId.isValid(sectionId)
      ? [{ $match: { "student.currentSection": new mongoose.Types.ObjectId(sectionId) } }]
      : []),

    { $lookup: { from: "classes",  localField: "student.currentClass",   foreignField: "_id", as: "class"   } },
    { $lookup: { from: "sections", localField: "student.currentSection", foreignField: "_id", as: "section" } },
    { $unwind: { path: "$class",   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        studentCode:   "$student.studentId",
        studentName: {
          $trim: { input: { $concat: [
            { $ifNull: ["$student.firstName", ""] }, " ",
            { $ifNull: ["$student.lastName",  ""] }
          ]}}
        },
        fatherName:   "$student.fatherName",
        phone:        "$student.phone",
        className:    "$class.name",
        sectionName:  "$section.name",
        period:       1,
        referenceType: 1,
        amount:       1,
        paidAmount:   1,
        waivedAmount: 1,
        // isWaived: recalculate — waivedAmount >= amount counts as full waiver too
        isWaived: {
          $or: [
            { $eq: ["$isWaived", true] },
            { $gte: [{ $ifNull: ["$waivedAmount", 0] }, "$amount"] },
          ]
        },
        waiverReason: 1,
        waivedAt:     1,
        createdAt:    1,
      },
    },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        list:       [{ $skip: skip }, { $limit: perPage }],
        totalCount: [{ $count: "count" }],
      },
    },
  ]);

  const list      = result[0]?.list || [];
  const totalRows = result[0]?.totalCount?.[0]?.count || 0;

  res.status(200).json(new apiResponse(200, {
    list,
    pagination: { totalRows, totalPages: Math.ceil(totalRows / perPage), currentPage, perPage },
  }, "Late fee list fetched successfully"));
});

/* ================================================================
   AUTO-GENERATE LATE FEES FOR A SESSION/CLASS
   POST /late-fee/generate
   Body: { sessionId, classId? }
   Loops through all studying students and syncs late fees.
================================================================ */
const generateLateFees = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const FeeStructure     = getFeeStructureModel(req.db);
  const FeeInstallment   = getFeeInstallmentModel(req.db);
  const StudentPayment   = getStudentPaymentModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);
  const LateFeeSetting   = getLateFeeSettingModel(req.db);

  const { sessionId, classId } = req.body;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId required"));
  }

  const setting = await LateFeeSetting.findOne({ sessionId, isActive: true }).lean();
  if (!setting) {
    return res.status(400).json(new apiResponse(400, null, "No active late fee setting found for this session"));
  }

  // Fetch studying students
  const enrollMatch = { session: new mongoose.Types.ObjectId(sessionId), status: "Studying" };
  if (classId && mongoose.Types.ObjectId.isValid(classId))
    enrollMatch.currentClass = new mongoose.Types.ObjectId(classId);

  const students = await StudentEnrolment.find(enrollMatch).lean();

  let generated = 0;
  let updated   = 0;
  let skipped   = 0;

  for (const student of students) {
    const cid      = student.currentClass?.toString();
    const streamId = student.stream?.toString() || null;
    if (!cid) continue;

    // Fee structures for this student — stream-aware query
    // Senior class students ke liye streamId match karo,
    // non-senior students ke liye streamId null/missing wale structures fetch karo
    const feeStructureQuery = streamId
      ? { sessionId, classId: cid, streamId, isActive: true }
      : {
          sessionId,
          classId: cid,
          isActive: true,
          $or: [{ streamId: null }, { streamId: { $exists: false } }],
        };

    const feeStructures = await FeeStructure.find(feeStructureQuery).lean();

    if (!feeStructures.length) { skipped++; continue; }

    const fsIds = feeStructures.map(fs => fs._id);
    const installments = await FeeInstallment.find({ feeStructureId: { $in: fsIds } }).lean();

    // Build allocation map for this student
    const paymentIds = await StudentPayment.find({
      studentId: student._id,
      sessionId,
      paymentStatus: "SUCCESS",
    }).distinct("_id");

    const allocations = paymentIds.length
      ? await StudentPaymentAllocation.find({
          paymentId: { $in: paymentIds },
          feeType:   "TUITION",
        }).lean()
      : [];

    const allocationMap = {};
    for (const a of allocations) {
      const rid = a.referenceId.toString();
      allocationMap[rid] = (allocationMap[rid] || 0) + Number(a.allocatedAmount || 0);
    }

    const results = await syncLateFees({
      db:           req.db,
      sessionId,
      studentId:    student._id,
      classId:      cid,
      installments,
      allocationMap,
    });

    generated += results.filter(r => !r._id).length;
    updated   += results.filter(r =>  r._id).length;
  }

  res.status(200).json(new apiResponse(200, {
    studentsProcessed: students.length,
    generated,
    updated,
    skipped,
  }, "Late fees generated successfully"));
});

/* ================================================================
   WAIVE LATE FEE (single) — supports full or partial waiver
   POST /late-fee-waive
   Body: { lateFeeId, waivedBy, waiverReason?, waivedAmount? }
         waivedAmount: omit or 0 = full waiver
                       number   = partial waiver (must be <= remaining due)
================================================================ */
const waiveLateFee = asyncHandler(async (req, res) => {
  const LateFee                  = getLateFeeModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);

  const { lateFeeId, waivedBy, waiverReason, waivedAmount } = req.body;

  if (!lateFeeId || !mongoose.Types.ObjectId.isValid(lateFeeId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid lateFeeId required"));
  }

  const lateFee = await LateFee.findById(lateFeeId);
  if (!lateFee) {
    return res.status(404).json(new apiResponse(404, null, "Late fee not found"));
  }

  if (lateFee.isWaived) {
    return res.status(400).json(new apiResponse(400, null, "Late fee is already fully waived"));
  }

  // ── Check how much has already been paid ──
  const allocations = await StudentPaymentAllocation.find({
    feeType:         "LATE_FEE",
    referenceId:     lateFee._id,
    allocatedAmount: { $gt: 0 },
  }).lean();

  const alreadyPaid = allocations.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0);
  const remaining   = Math.max(0, Number(lateFee.amount) - alreadyPaid - Number(lateFee.waivedAmount || 0));

  if (remaining <= 0) {
    return res.status(400).json(
      new apiResponse(400, null, "This late fee has already been fully paid or waived")
    );
  }

  // ── Determine waiver amount ──
  const requestedWaiver = waivedAmount !== undefined && waivedAmount !== null
    ? parseFloat(waivedAmount)
    : remaining; // no amount specified = full waiver of remaining

  if (isNaN(requestedWaiver) || requestedWaiver <= 0) {
    return res.status(400).json(new apiResponse(400, null, "waivedAmount must be a positive number"));
  }

  if (requestedWaiver > remaining) {
    return res.status(400).json(
      new apiResponse(400, null, `Cannot waive ₹${requestedWaiver}. Only ₹${remaining} is remaining due.`)
    );
  }

  // ── Apply waiver ──
  const newWaivedAmount = parseFloat((Number(lateFee.waivedAmount || 0) + requestedWaiver).toFixed(2));
  const isFullWaiver    = newWaivedAmount >= Number(lateFee.amount) - alreadyPaid;

  lateFee.waivedAmount  = newWaivedAmount;
  lateFee.isWaived      = isFullWaiver;   // true only if entire remaining amount is waived
  lateFee.waivedBy      = waivedBy || null;
  lateFee.waiverReason  = waiverReason || null;
  lateFee.waivedAt      = new Date();

  await lateFee.save();

  res.status(200).json(new apiResponse(200, {
    ...lateFee.toObject(),
    alreadyPaid,
    waivedAmount:     newWaivedAmount,
    remainingDue:     parseFloat(Math.max(0, Number(lateFee.amount) - alreadyPaid - newWaivedAmount).toFixed(2)),
    isFullWaiver,
  }, isFullWaiver ? "Late fee fully waived" : `Partial waiver of ₹${requestedWaiver} applied successfully`));
});

/* ================================================================
   BULK WAIVE LATE FEES
   POST /late-fee-waive-bulk
   Body: { lateFeeIds: [...], waivedBy, waiverReason? }
        OR { sessionId, classId?, waivedBy, waiverReason? }  ← waive all for session/class
================================================================ */
const bulkWaiveLateFees = asyncHandler(async (req, res) => {
  const LateFee                  = getLateFeeModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);

  const { lateFeeIds, sessionId, classId, sectionId, studentId, period, waivedAmount, waivedBy, waiverReason } = req.body;

  let filter = { isWaived: false, $or: undefined };

  // Also include partially waived (waivedAmount > 0 but not fully waived)
  // We only target records not yet fully waived
  delete filter.$or;

  if (lateFeeIds && Array.isArray(lateFeeIds) && lateFeeIds.length) {
    filter._id = { $in: lateFeeIds.map(id => new mongoose.Types.ObjectId(id)) };
  } else if (sessionId) {
    filter.sessionId = new mongoose.Types.ObjectId(sessionId);
    if (classId   && mongoose.Types.ObjectId.isValid(classId))
      filter.classId   = new mongoose.Types.ObjectId(classId);
    if (studentId && mongoose.Types.ObjectId.isValid(studentId))
      filter.studentId = new mongoose.Types.ObjectId(studentId);
    if (period)
      filter.period = period.toUpperCase();
  } else {
    return res.status(400).json(new apiResponse(400, null, "Provide lateFeeIds or sessionId"));
  }

  // sectionId — requires joining student; handled via two-step: fetch matching students first
  let studentIds = null;
  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId)) {
    const StudentEnrolment = getStudentEnrolmentModel(req.db);
    const enrollments = await StudentEnrolment.find({
      session:        filter.sessionId,
      currentClass:   filter.classId,
      currentSection: new mongoose.Types.ObjectId(sectionId),
    }).select("_id").lean();
    studentIds = enrollments.map(e => e._id);
    if (!studentIds.length) {
      return res.status(200).json(new apiResponse(200, { matched: 0, modified: 0, skipped: 0 }, "No students found in selected section"));
    }
    filter.studentId = { $in: studentIds };
  }

  // ── Exclude late fees that already have payment allocations ──
  const candidateFees = await LateFee.find(filter).select("_id").lean();
  const candidateIds  = candidateFees.map(lf => lf._id);

  const paidAllocations = await StudentPaymentAllocation.find({
    feeType:         "LATE_FEE",
    referenceId:     { $in: candidateIds },
    allocatedAmount: { $gt: 0 },
  }).distinct("referenceId");

  const paidSet = new Set(paidAllocations.map(id => id.toString()));

  // Only waive records that have NOT been paid
  const waivableIds = candidateIds.filter(id => !paidSet.has(id.toString()));

  if (!waivableIds.length) {
    return res.status(400).json(
      new apiResponse(400, null, "No waivable late fees found. All selected records have already been paid.")
    );
  }

  // ── Determine waiver type: partial or full ──
  const requestedWaivedAmount = waivedAmount !== undefined && waivedAmount !== null
    ? parseFloat(waivedAmount)
    : null; // null = full waiver

  let result;

  if (requestedWaivedAmount !== null && !isNaN(requestedWaivedAmount) && requestedWaivedAmount > 0) {
    // ── PARTIAL BULK WAIVER — waive fixed amount per record ──
    // For each waivable record: new waivedAmount = min(existing.waivedAmount + requestedWaivedAmount, existing.amount)
    // isWaived = true only if new waivedAmount >= amount
    result = await LateFee.updateMany(
      { _id: { $in: waivableIds } },
      [
        {
          $set: {
            waivedAmount: {
              $min: [
                "$amount",
                { $add: [{ $ifNull: ["$waivedAmount", 0] }, requestedWaivedAmount] }
              ]
            },
            waivedBy:     waivedBy || null,
            waiverReason: waiverReason || null,
            waivedAt:     new Date(),
          }
        },
        {
          $set: {
            isWaived: { $gte: ["$waivedAmount", "$amount"] }
          }
        }
      ]
    );
  } else {
    // ── FULL BULK WAIVER — waive entire amount per record ──
    result = await LateFee.updateMany(
      { _id: { $in: waivableIds } },
      [
        {
          $set: {
            isWaived:     true,
            waivedAmount: "$amount",
            waivedBy:     waivedBy || null,
            waiverReason: waiverReason || null,
            waivedAt:     new Date(),
          }
        }
      ]
    );
  }

  // ── Fix any records where waivedAmount >= amount but isWaived is still false ──
  await LateFee.updateMany(
    { isWaived: false, $expr: { $gte: ["$waivedAmount", "$amount"] } },
    { $set: { isWaived: true } }
  );

  const isPartialBulk = requestedWaivedAmount !== null && !isNaN(requestedWaivedAmount);
  const msg = isPartialBulk
    ? `Partial waiver of ₹${requestedWaivedAmount} applied to ${result.modifiedCount} record(s)`
    : `${result.modifiedCount} late fee(s) fully waived`;

  res.status(200).json(new apiResponse(200, {
    matched:  result.matchedCount,
    modified: result.modifiedCount,
    skipped:  candidateIds.length - waivableIds.length,
  }, `${msg}${paidSet.size > 0 ? `, ${paidSet.size} skipped (already paid)` : ''}`));
});

/* ================================================================
   UNWAIVE LATE FEE (reverse a waiver)
   POST /late-fee-unwaive
   Body: { lateFeeId }
================================================================ */
const unwaiveLateFee = asyncHandler(async (req, res) => {
  const LateFee = getLateFeeModel(req.db);

  const { lateFeeId } = req.body;

  if (!lateFeeId || !mongoose.Types.ObjectId.isValid(lateFeeId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid lateFeeId required"));
  }

  const lateFee = await LateFee.findById(lateFeeId);
  if (!lateFee) {
    return res.status(404).json(new apiResponse(404, null, "Late fee not found"));
  }

  // Allow reversing both fully waived (isWaived: true) and partially waived (waivedAmount > 0)
  if (!lateFee.isWaived && !(Number(lateFee.waivedAmount) > 0)) {
    return res.status(400).json(new apiResponse(400, null, "Late fee has no active waiver to reverse"));
  }

  lateFee.isWaived     = false;
  lateFee.waivedAmount = 0;
  lateFee.waivedBy     = null;
  lateFee.waiverReason = null;
  lateFee.waivedAt     = null;

  await lateFee.save();

  res.status(200).json(new apiResponse(200, lateFee, "Late fee waiver reversed successfully"));
});

/* ================================================================
   GET LATE FEE SUMMARY FOR A STUDENT
   GET /late-fee/student-summary?sessionId&studentId
================================================================ */
const getStudentLateFeeSummary = asyncHandler(async (req, res) => {
  const LateFee                  = getLateFeeModel(req.db);
  const StudentPayment           = getStudentPaymentModel(req.db);
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(req.db);

  const { sessionId, studentId } = req.query;

  if (!sessionId || !studentId) {
    return res.status(400).json(new apiResponse(400, null, "sessionId and studentId required"));
  }

  const paymentIds = await StudentPayment.find({
    studentId,
    sessionId,
    paymentStatus: "SUCCESS",
  }).distinct("_id");

  const lateFees = await LateFee.find({ sessionId, studentId }).lean();

  const lateFeeIds = lateFees.map(lf => lf._id);

  const allocations = paymentIds.length && lateFeeIds.length
    ? await StudentPaymentAllocation.find({
        paymentId:   { $in: paymentIds },
        feeType:     "LATE_FEE",
        referenceId: { $in: lateFeeIds },
      }).lean()
    : [];

  const paidMap = {};
  for (const a of allocations) {
    const rid = a.referenceId.toString();
    paidMap[rid] = (paidMap[rid] || 0) + Number(a.allocatedAmount || 0);
  }

  const list = lateFees.map(lf => {
    const paid = paidMap[lf._id.toString()] || 0;
    const due  = lf.isWaived ? 0 : Math.max(0, Number(lf.amount) - paid);
    return {
      _id:          lf._id,
      period:       lf.period,
      amount:       lf.amount,
      paidAmount:   paid,
      dueAmount:    due,
      isWaived:     lf.isWaived,
      waiverReason: lf.waiverReason || null,
      waivedAt:     lf.waivedAt || null,
    };
  });

  const totalLateFee  = list.reduce((s, l) => s + Number(l.amount || 0), 0);
  const totalPaid     = list.reduce((s, l) => s + Number(l.paidAmount || 0), 0);
  const totalDue      = list.reduce((s, l) => s + Number(l.dueAmount || 0), 0);
  const totalWaived   = list.filter(l => l.isWaived).reduce((s, l) => s + Number(l.amount || 0), 0);

  res.status(200).json(new apiResponse(200, {
    list,
    summary: {
      totalLateFee:  parseFloat(totalLateFee.toFixed(2)),
      totalPaid:     parseFloat(totalPaid.toFixed(2)),
      totalDue:      parseFloat(totalDue.toFixed(2)),
      totalWaived:   parseFloat(totalWaived.toFixed(2)),
    },
  }, "Student late fee summary fetched"));
});

/* ================================================================
   MANUAL CREATE LATE FEE (admin override)
   POST /late-fee
================================================================ */
const createLateFee = asyncHandler(async (req, res) => {
  const LateFee = getLateFeeModel(req.db);

  const { sessionId, classId, studentId, referenceId, referenceType, period, amount } = req.body;

  if (!sessionId || !studentId || !referenceId || !amount) {
    return res.status(400).json(new apiResponse(400, null, "Required fields missing"));
  }

  // Upsert — if record exists, update amount
  const lateFee = await LateFee.findOneAndUpdate(
    { studentId, referenceId },
    {
      $set: {
        sessionId,
        classId:       classId || null,
        referenceType: referenceType || "TUITION",
        period:        period || null,
        amount:        Number(amount),
      },
      $setOnInsert: { paidAmount: 0, isWaived: false },
    },
    { upsert: true, new: true }
  );

  res.status(201).json(new apiResponse(201, lateFee, "Late fee created/updated"));
});

/* ================================================================
   LATE FEE WAIVER REPORT
   GET /late-fee-waiver-report
   Query: sessionId, classId?, sectionId?, streamId?, fromDate?, toDate?, page, limit
   Returns: yearly/filtered waiver report — both full & partial waivers
================================================================ */
const getLateFeeWaiverReport = asyncHandler(async (req, res) => {
  const LateFee = getLateFeeModel(req.db);

  const {
    sessionId,
    classId,
    sectionId,
    streamId,
    fromDate,
    toDate,
    studentSearch,
    page  = 1,
    limit = 10,
  } = req.query;

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid sessionId is required"));
  }

  const currentPage = Number(page);
  const perPage     = Number(limit);
  const skip        = (currentPage - 1) * perPage;

  // Match: records that have any waiver (full or partial)
  const match = {
    sessionId: new mongoose.Types.ObjectId(sessionId),
    $or: [{ isWaived: true }, { waivedAmount: { $gt: 0 } }],
  };

  if (classId && mongoose.Types.ObjectId.isValid(classId))
    match.classId = new mongoose.Types.ObjectId(classId);

  // fromDate / toDate filter on waivedAt
  if (fromDate || toDate) {
    match.waivedAt = {};
    if (fromDate) match.waivedAt.$gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      match.waivedAt.$lte = end;
    }
  }

  const result = await LateFee.aggregate([
    { $match: match },

    // Join student
    { $lookup: { from: "studentenrolments", localField: "studentId", foreignField: "_id", as: "student" } },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },

    // Student search filter — by name or studentId code
    ...(studentSearch ? [{
      $match: {
        $or: [
          { "student.firstName":  { $regex: studentSearch, $options: "i" } },
          { "student.lastName":   { $regex: studentSearch, $options: "i" } },
          { "student.studentId":  { $regex: studentSearch, $options: "i" } },
        ],
      },
    }] : []),

    // Section filter (after join)
    ...(sectionId && mongoose.Types.ObjectId.isValid(sectionId)
      ? [{ $match: { "student.currentSection": new mongoose.Types.ObjectId(sectionId) } }]
      : []),

    // Stream filter (after join)
    ...(streamId && mongoose.Types.ObjectId.isValid(streamId)
      ? [{ $match: { "student.stream": new mongoose.Types.ObjectId(streamId) } }]
      : []),

    // Join class, section, stream
    { $lookup: { from: "classes",  localField: "student.currentClass",   foreignField: "_id", as: "class"   } },
    { $lookup: { from: "sections", localField: "student.currentSection", foreignField: "_id", as: "section" } },
    { $lookup: { from: "streams",  localField: "student.stream",         foreignField: "_id", as: "stream"  } },
    { $unwind: { path: "$class",   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$stream",  preserveNullAndEmptyArrays: true } },

    {
      $project: {
        studentCode:   "$student.studentId",
        studentName: {
          $trim: { input: { $concat: [
            { $ifNull: ["$student.firstName", ""] }, " ",
            { $ifNull: ["$student.lastName",  ""] },
          ]}},
        },
        fatherName:    "$student.fatherName",
        phone:         "$student.phone",
        className:     "$class.name",
        sectionName:   "$section.name",
        streamName:    "$stream.name",
        period:        1,
        referenceType: 1,
        amount:        1,          // original late fee amount
        waivedAmount:  1,          // how much was waived
        isWaived:      1,          // true = fully waived
        waiverType: {
          $cond: [
            "$isWaived",
            "Full",
            { $cond: [{ $gt: ["$waivedAmount", 0] }, "Partial", "None"] },
          ],
        },
        remainingDue: {
          $max: [0, { $subtract: ["$amount", { $ifNull: ["$waivedAmount", 0] }] }],
        },
        waiverReason:  1,
        waivedAt:      1,
        createdAt:     1,
      },
    },

    { $sort: { waivedAt: -1, createdAt: -1 } },

    {
      $facet: {
        list: [{ $skip: skip }, { $limit: perPage }],
        totalCount: [{ $count: "count" }],
        summary: [
          {
            $group: {
              _id: null,
              totalRecords:      { $sum: 1 },
              totalLateFeeAmt:   { $sum: "$amount" },
              totalWaivedAmt:    { $sum: "$waivedAmount" },
              fullWaiverCount:   { $sum: { $cond: ["$isWaived", 1, 0] } },
              partialWaiverCount:{ $sum: { $cond: [{ $and: [{ $not: ["$isWaived"] }, { $gt: ["$waivedAmount", 0] }] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]);

  const list      = result[0]?.list      || [];
  const totalRows = result[0]?.totalCount?.[0]?.count || 0;
  const summary   = result[0]?.summary?.[0] || {
    totalRecords: 0, totalLateFeeAmt: 0, totalWaivedAmt: 0,
    fullWaiverCount: 0, partialWaiverCount: 0,
  };

  res.status(200).json(new apiResponse(200, {
    list,
    summary: {
      totalRecords:       summary.totalRecords,
      totalLateFeeAmount: parseFloat((summary.totalLateFeeAmt || 0).toFixed(2)),
      totalWaivedAmount:  parseFloat((summary.totalWaivedAmt  || 0).toFixed(2)),
      fullWaiverCount:    summary.fullWaiverCount,
      partialWaiverCount: summary.partialWaiverCount,
    },
    pagination: {
      totalRows,
      totalPages:  Math.ceil(totalRows / perPage),
      currentPage,
      perPage,
    },
  }, "Late fee waiver report fetched successfully"));
});

export {
  getLateFeeList,
  generateLateFees,
  createLateFee,
  waiveLateFee,
  bulkWaiveLateFees,
  unwaiveLateFee,
  getStudentLateFeeSummary,
  getLateFeeWaiverReport,
};
