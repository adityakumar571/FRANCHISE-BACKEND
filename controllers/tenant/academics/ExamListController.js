import { getExamListModel } from "../../../models/tenant/master/ExamList.model.js";
import { getExamModel } from "../../../models/tenant/master/Exam.model.js";
import { getClassModel } from "../../../models/tenant/master/Class.modal.js";
import { getSectionModel } from "../../../models/tenant/master/Section.modal.js";

import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

/* ================= CREATE EXAM LIST ================= */
const createExamList = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db); // ✅
  const Exam = getExamModel(req.db); // ✅
  const Class = getClassModel(req.db); // ✅
  const Section = getSectionModel(req.db); // ✅

  const { examMasterId, sessionId, classId, streamId, fromDate, toDate, subjects } =
    req.body;

  if (!examMasterId || !mongoose.Types.ObjectId.isValid(examMasterId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid examMasterId is required"));
  }

  if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid classId is required"));
  }

  if (!fromDate || !toDate) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "fromDate and toDate are required"));
  }

  /* ===== DUPLICATE CHECK ===== */
  const alreadyExists = await ExamList.findOne({
    examMasterId,
    classId,
    streamId,
    sessionId: sessionId || null,
    isActive: true,
  });

  if (alreadyExists) {
    return res
      .status(409)
      .json(
        new apiResponse(409, null, "Exam already scheduled for this class"),
      );
  }

  // Validate subjects array (optional but recommended)
  const validatedSubjects = Array.isArray(subjects)
    ? subjects
        .filter((s) => s.subjectId && mongoose.Types.ObjectId.isValid(s.subjectId))
        .map((s) => ({
          subjectId: s.subjectId,
          maxMarks: Number(s.maxMarks) || 0,
          passingMarks: Number(s.passingMarks) || 0,
        }))
    : [];

  const examList = await ExamList.create({
    examMasterId,
    sessionId: sessionId || null,
    classId,
    streamId,
    fromDate,
    toDate,
    isActive: true,
    subjects: validatedSubjects,
  });

  const populated = await ExamList.findById(examList._id)
    .populate("examMasterId", "examName category")
    .populate("classId", "name")
    .populate("streamId", "name")
    .populate("subjects.subjectId", "name");

  res
    .status(201)
    .json(new apiResponse(201, populated, "Exam list created successfully"));
});

/* ================= GET ALL EXAM LIST ================= */
const getAllExamList_old = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db);
  const {
    classId,
    examMasterId,
    category,
    isActive,
    search,
    page = 1,
    limit = 10,
    isPagination = "true",
    sortBy = "recent",
    session,
  } = req.query;

  const match = {};
  if (session && mongoose.Types.ObjectId.isValid(session)) {
    match.sessionId = new mongoose.Types.ObjectId(session);
  }

  if (isActive !== undefined) {
    match.isActive = isActive === "true";
  }

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    match.classId = new mongoose.Types.ObjectId(classId);
  }

  if (examMasterId && mongoose.Types.ObjectId.isValid(examMasterId)) {
    match.examMasterId = new mongoose.Types.ObjectId(examMasterId);
  }

  const pipeline = [
    { $match: match },

    /* ===== Exam Master ===== */
    {
      $lookup: {
        from: "exammasters",
        localField: "examMasterId",
        foreignField: "_id",
        as: "examMaster",
      },
    },
    { $unwind: "$examMaster" },

    /* ===== Class ===== */
    {
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "_id",
        as: "class",
      },
    },
    { $unwind: "$class" },
  ];

  /* ===== CATEGORY FILTER (AFTER LOOKUP) ===== */
  if (category) {
    pipeline.push({
      $match: {
        "examMaster.category": category,
      },
    });
  }
  /* ===== SEARCH ===== */
  if (search) {
    pipeline.push({
      $match: {
        "examMaster.examName": { $regex: search, $options: "i" },
      },
    });
  }

  /* ===== SORT ===== */
  pipeline.push({
    $sort: sortBy === "oldest" ? { createdAt: 1 } : { createdAt: -1 },
  });

  /* ===== PROJECT ===== */
  pipeline.push({
    $project: {
      fromDate: 1,
      toDate: 1,
      isActive: 1,
      createdAt: 1,

      examMaster: {
        _id: "$examMaster._id",
        examName: "$examMaster.examName",
        category: "$examMaster.category",
      },

      class: {
        _id: "$class._id",
        className: "$class.name",
      },
    },
  });

  /* ===== COUNT ===== */
  const countPipeline = [...pipeline, { $count: "count" }];
  const countResult = await ExamList.aggregate(countPipeline);
  const total = countResult[0]?.count || 0;

  /* ===== PAGINATION ===== */
  if (isPagination === "true") {
    pipeline.push({ $skip: (page - 1) * limit }, { $limit: Number(limit) });
  }

  const examLists = await ExamList.aggregate(pipeline);

  res.status(200).json(
    new apiResponse(
      200,
      {
        examLists,
        totalExamLists: total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
      },
      "Exam lists fetched successfully",
    ),
  );
});

const getAllExamList = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db);
  const {
    classId,
    streamId, // ✅ NEW
    examMasterId,
    category,
    isActive,
    search,
    page = 1,
    limit = 10,
    isPagination = "true",
    sortBy = "recent",
    session,
  } = req.query;

  const match = {};

  /* ================= SESSION ================= */
  if (session && mongoose.Types.ObjectId.isValid(session)) {
    match.sessionId = new mongoose.Types.ObjectId(session);
  }

  /* ================= ACTIVE ================= */
  if (isActive !== undefined) {
    match.isActive = isActive === "true";
  }

  /* ================= CLASS ================= */
  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    match.classId = new mongoose.Types.ObjectId(classId);
  }

  /* ================= STREAM (NEW) ================= */
  if (streamId && mongoose.Types.ObjectId.isValid(streamId)) {
    match.streamId = new mongoose.Types.ObjectId(streamId);
  }

  /* ================= EXAM MASTER ================= */
  if (examMasterId && mongoose.Types.ObjectId.isValid(examMasterId)) {
    match.examMasterId = new mongoose.Types.ObjectId(examMasterId);
  }

  const pipeline = [
    { $match: match },

    /* ===== Exam Master ===== */
    {
      $lookup: {
        from: "exammasters",
        localField: "examMasterId",
        foreignField: "_id",
        as: "examMaster",
      },
    },
    { $unwind: "$examMaster" },

    /* ===== Class ===== */
    {
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "_id",
        as: "class",
      },
    },
    { $unwind: "$class" },

    /* ===== Stream (NEW) ===== */
    {
      $lookup: {
        from: "streams",
        localField: "streamId",
        foreignField: "_id",
        as: "stream",
      },
    },
    {
      $unwind: {
        path: "$stream",
        preserveNullAndEmptyArrays: true, // 🔥 important (if no stream)
      },
    },

    /* ===== Subjects — populate name from Subject collection ===== */
    {
      $lookup: {
        from: "subjects",
        localField: "subjects.subjectId",
        foreignField: "_id",
        as: "subjectDocs",
      },
    },
    // merge subjectDocs name back into subjects array
    {
      $addFields: {
        subjects: {
          $map: {
            input: "$subjects",
            as: "sub",
            in: {
              subjectId: {
                $let: {
                  vars: {
                    matched: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$subjectDocs",
                            as: "doc",
                            cond: { $eq: ["$$doc._id", "$$sub.subjectId"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: "$$matched._id",
                    name: "$$matched.name",
                  },
                },
              },
              maxMarks: "$$sub.maxMarks",
              passingMarks: "$$sub.passingMarks",
            },
          },
        },
      },
    },
  ];

  /* ================= CATEGORY FILTER ================= */
  if (category) {
    pipeline.push({
      $match: {
        "examMaster.category": category,
      },
    });
  }

  /* ================= SEARCH ================= */
  if (search) {
    pipeline.push({
      $match: {
        "examMaster.examName": { $regex: search, $options: "i" },
      },
    });
  }

  /* ================= SORT ================= */
  pipeline.push({
    $sort:
      sortBy === "order"
        ? { order: 1 } // 🔥 FIXED
        : sortBy === "oldest"
          ? { createdAt: 1 }
          : { createdAt: -1 },
  });

  /* ================= PROJECT ================= */
  pipeline.push({
    $project: {
      fromDate: 1,
      toDate: 1,
      isActive: 1,
      isPublished: 1,
      createdAt: 1,
      subjects: 1,

      examMaster: {
        _id: "$examMaster._id",
        examName: "$examMaster.examName",
        category: "$examMaster.category",
      },

      class: {
        _id: "$class._id",
        className: "$class.name",
      },

      /* ===== STREAM OUTPUT (NEW) ===== */
      stream: {
        _id: "$stream._id",
        streamName: "$stream.name",
      },
    },
  });

  /* ================= COUNT ================= */
  const countPipeline = [...pipeline, { $count: "count" }];
  const countResult = await ExamList.aggregate(countPipeline);
  const total = countResult[0]?.count || 0;

  /* ================= PAGINATION ================= */
  if (isPagination === "true") {
    pipeline.push(
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
    );
  }

  const examLists = await ExamList.aggregate(pipeline);

  /* ================= RESPONSE ================= */
  res.status(200).json(
    new apiResponse(
      200,
      {
        examLists,
        totalExamLists: total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
      },
      "Exam lists fetched successfully",
    ),
  );
});

const reorderExamList = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db);
  const { exams } = req.body;

  /* ================= VALIDATION ================= */

  if (!Array.isArray(exams) || exams.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "exams array is required"));
  }

  /* ================= BUILD BULK OPS ================= */

  const bulkOps = exams.map((item) => {
    if (!mongoose.Types.ObjectId.isValid(item.id)) {
      throw new Error(`Invalid ID: ${item.id}`);
    }

    return {
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(item.id) },
        update: {
          $set: { order: item.order },
        },
      },
    };
  });

  /* ================= EXECUTE ================= */

  await ExamList.bulkWrite(bulkOps);

  res
    .status(200)
    .json(new apiResponse(200, null, "Exam list order updated successfully"));
});

/* ================= GET EXAM LIST BY ID ================= */
const getExamByIdList = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db);
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Exam List ID"));
  }

  const examList = await ExamList.findById(id)
    .populate("examMasterId", "examName category")
    .populate("classId", "name");

  if (!examList) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Exam List not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, examList, "Exam list fetched successfully"));
});

/* ================= UPDATE EXAM LIST ================= */
const updateExamList_old = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db);
  const { id } = req.params;
  const { examMasterId, sessionId, classId, fromDate, toDate, isActive } =
    req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Exam List ID"));
  }

  const examList = await ExamList.findById(id);
  if (!examList) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Exam List not found"));
  }

  examList.examMasterId = examMasterId ?? examList.examMasterId;
  examList.sessionId = sessionId ?? examList.sessionId;
  examList.classId = classId ?? examList.classId;
  examList.fromDate = fromDate ?? examList.fromDate;
  examList.toDate = toDate ?? examList.toDate;
  examList.isActive = isActive ?? examList.isActive;

  await examList.save();

  const populated = await ExamList.findById(id)
    .populate("examMasterId", "examName category")
    .populate("classId", "name");

  res
    .status(200)
    .json(new apiResponse(200, populated, "Exam list updated successfully"));
});

/* ================= UPDATE EXAM LIST ================= */
const updateExamList = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db);
  const { id } = req.params;

  const {
    examMasterId,
    sessionId,
    classId,
    streamId, // ✅ NEW
    fromDate,
    toDate,
    isActive,
    subjects,  // ✅ NEW — subject-wise maxMarks & passingMarks
  } = req.body;

  /* ================= VALIDATION ================= */

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Exam List ID"));
  }

  const examList = await ExamList.findById(id);

  if (!examList) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Exam List not found"));
  }

  /* ================= UPDATE FIELDS ================= */

  if (examMasterId && mongoose.Types.ObjectId.isValid(examMasterId)) {
    examList.examMasterId = examMasterId;
  }

  if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
    examList.sessionId = sessionId;
  }

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    examList.classId = classId;
  }

  /* ================= STREAM UPDATE (NEW) ================= */

  if (streamId !== undefined) {
    // allow null also (for classes without stream)
    examList.streamId =
      streamId && mongoose.Types.ObjectId.isValid(streamId) ? streamId : null;
  }

  if (fromDate) examList.fromDate = fromDate;
  if (toDate) examList.toDate = toDate;

  if (isActive !== undefined) {
    examList.isActive = isActive;
  }

  // Update subjects if provided
  if (Array.isArray(subjects)) {
    examList.subjects = subjects
      .filter((s) => s.subjectId && mongoose.Types.ObjectId.isValid(s.subjectId))
      .map((s) => ({
        subjectId: s.subjectId,
        maxMarks: Number(s.maxMarks) || 0,
        passingMarks: Number(s.passingMarks) || 0,
      }));
  }

  await examList.save();

  /* ================= POPULATE ================= */

  const populated = await ExamList.findById(id)
    .populate("examMasterId", "examName category")
    .populate("classId", "name")
    .populate("streamId", "name") // ✅ NEW
    .populate("subjects.subjectId", "name"); // ✅ NEW

  /* ================= RESPONSE ================= */

  res
    .status(200)
    .json(new apiResponse(200, populated, "Exam list updated successfully"));
});

/* ================= DELETE EXAM LIST ================= */
const deleteExamList = asyncHandler(async (req, res) => {
  const ExamList = getExamListModel(req.db);
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Exam List ID"));
  }

  const examList = await ExamList.findByIdAndDelete(id);

  if (!examList) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Exam List not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, examList, "Exam list deleted successfully"));
});

export {
  createExamList,
  getAllExamList,
  getExamByIdList,
  updateExamList,
  deleteExamList,
  reorderExamList,
};
