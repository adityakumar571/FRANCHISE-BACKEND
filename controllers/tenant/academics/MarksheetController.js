import { getMarksheetModel } from "../../../models/tenant/report/Marksheet.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getExamListModel } from "../../../models/tenant/master/ExamList.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import mongoose from "mongoose";
import { getTeacherModel } from "../../../models/tenant/teacher/Teacher.model.js";
import { getNotificationModel } from "../../../models/tenant/Notification.model.js";
import { getUserModel } from "../../../models/tenant/user.model.js";
import { sendFCMToMultiple } from "../../../utils/sendFCMNotification.js";

// Helper to get Session model from tenant db
const getSessionModel = (db) => {
  const schema = new mongoose.Schema(
    { sessionName: String, isCurrent: Boolean, isActive: Boolean },
    { strict: false },
  );
  return db.models.Session || db.model("Session", schema);
};

const getSubjectModel = (db) => {
  const schema = new mongoose.Schema(
    {
      name: String,
      classes: [mongoose.Schema.Types.ObjectId],
      streamId: mongoose.Schema.Types.ObjectId,
    },
    { strict: false },
  );
  return db.models.Subject || db.model("Subject", schema);
};

const createMarks = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  const Session = getSessionModel(req.db);
  const { examListId, studentId, classId, sectionId, streamId, subjects } =
    req.body;

  if (!examListId || !mongoose.Types.ObjectId.isValid(examListId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid examListId is required"));
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid studentId is required"));
  if (!classId || !mongoose.Types.ObjectId.isValid(classId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid classId is required"));
  if (!sectionId || !mongoose.Types.ObjectId.isValid(sectionId))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sectionId is required"));
  if (!subjects || !Array.isArray(subjects) || subjects.length === 0)
    return res
      .status(400)
      .json(new apiResponse(400, null, "Subjects are required"));

  const currentSession = await Session.findOne({ isCurrent: true });
  if (!currentSession)
    return res
      .status(400)
      .json(new apiResponse(400, null, "Current session not found"));

  const alreadyExists = await Marksheet.findOne({
    examListId,
    studentId,
    sessionId: currentSession._id,
  });
  if (alreadyExists)
    return res
      .status(409)
      .json(
        new apiResponse(409, null, "Marksheet already exists for this student"),
      );

  let totalObtained = 0,
    totalMax = 0;
  subjects.forEach((sub) => {
    totalObtained += sub.marksObtained || 0;
    totalMax += sub.maxMarks || 0;
  });
  const percentage =
    totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;

  const marksheet = await Marksheet.create({
    examListId,
    studentId,
    classId,
    sectionId,
    streamId: streamId || null,
    sessionId: currentSession._id,
    subjects,
    totalObtainedMarks: totalObtained,
    totalMarks: totalMax,
    percentage,
    result: percentage >= 33 ? "PASS" : "FAIL",
  });

  res
    .status(201)
    .json(new apiResponse(201, marksheet, "Marksheet created successfully"));
});

const getAllMarks = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  const {
    examListId,
    classId,
    sectionId,
    streamId,
    studentId,
    result,
    page = 1,
    limit = 10,
    isPagination = "true",
    sessionId,
  } = req.query;

  const match = {};
  if (examListId && mongoose.Types.ObjectId.isValid(examListId))
    match.examListId = new mongoose.Types.ObjectId(examListId);
  if (classId && mongoose.Types.ObjectId.isValid(classId))
    match.classId = new mongoose.Types.ObjectId(classId);
  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId))
    match.sectionId = new mongoose.Types.ObjectId(sectionId);
  if (streamId && mongoose.Types.ObjectId.isValid(streamId))
    match.streamId = new mongoose.Types.ObjectId(streamId);
  if (studentId && mongoose.Types.ObjectId.isValid(studentId))
    match.studentId = new mongoose.Types.ObjectId(studentId);
  if (sessionId && mongoose.Types.ObjectId.isValid(sessionId))
    match.sessionId = new mongoose.Types.ObjectId(sessionId);
  if (result) match.result = result;

  const total = await Marksheet.countDocuments(match);
  const skip = isPagination === "true" ? (page - 1) * limit : 0;
  const lim = isPagination === "true" ? Number(limit) : total;

  const marksheets = await Marksheet.find(match)
    .populate({ path: "examListId", populate: { path: "examMasterId" } })
    .populate("studentId")
    .populate("classId")
    .populate("sectionId")
    .populate("streamId")
    .populate({
      path: "studentId",
      populate: { path: "currentSection", model: "Section" },
    })
    .populate({ path: "subjects.subjectId" })
    .populate("sessionId")
    .skip(skip)
    .limit(lim)
    .sort({ createdAt: -1 });

  const formatted = marksheets.map((m) => ({
    _id: m._id,
    createdAt: m.createdAt,
    totalObtainedMarks: m.totalObtainedMarks,
    totalMarks: m.totalMarks,
    percentage: m.percentage,
    result: m.result,
    exam: {
      _id: m.examListId?.examMasterId?._id || null,
      examName: m.examListId?.examMasterId?.examName || "",
      category: m.examListId?.examMasterId?.category || "",
      fromDate: m.examListId?.fromDate || "",
      toDate: m.examListId?.toDate || "",
    },
    student: {
      _id: m.studentId?._id || null,
      studentId: m.studentId?.studentId || "",
      rollNumber: m.studentId?.rollNumber || "",
      name: `${m.studentId?.firstName || ""} ${m.studentId?.lastName || ""}`.trim(),
      fatherName: m.studentId?.fatherName || "",
      currentClass: m.classId?.name || "",
      currentSection: m.studentId?.currentSection?.name || "",
    },
    session: {
      _id: m.sessionId?._id || null,
      name: m.sessionId?.sessionName || "",
    },
    class: { _id: m.classId?._id || null, className: m.classId?.name || "" },
    section: {
      _id: m.sectionId?._id || null,
      sectionName: m.sectionId?.name || "",
    },
    stream: m.streamId
      ? { _id: m.streamId?._id, name: m.streamId?.name }
      : null,
    subjects: m.subjects.map((s) => {
      const subjectPercentage =
        s.maxMarks > 0 ? (s.marksObtained / s.maxMarks) * 100 : 0;
      return {
        subjectId: s.subjectId?._id || null,
        subjectName: s.subjectId?.name || "",
        marksObtained: s.marksObtained,
        maxMarks: s.maxMarks,
        subjectPercentage: Number(subjectPercentage.toFixed(2)),
        subjectResult: subjectPercentage >= 33 ? "PASS" : "FAIL",
      };
    }),
  }));

  res.status(200).json(
    new apiResponse(
      200,
      {
        marksheets: formatted,
        totalMarksheets: total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
      },
      "Marksheets fetched successfully",
    ),
  );
});

const getMarksById = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Marksheet ID"));
  const marksheet = await Marksheet.findById(req.params.id)
    .populate("examListId")
    .populate("studentId")
    .populate("classId")
    .populate("streamId")
    .populate("sessionId")
    .populate("subjects.subjectId");
  if (!marksheet)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Marksheet not found"));

  const formatted = {
    ...marksheet.toObject(),
    subjects: marksheet.subjects.map((s) => {
      const subjectPercentage =
        s.maxMarks > 0 ? (s.marksObtained / s.maxMarks) * 100 : 0;
      return {
        subjectId: s.subjectId?._id || null,
        subjectName: s.subjectId?.name || "",
        marksObtained: s.marksObtained,
        maxMarks: s.maxMarks,
        subjectPercentage: Number(subjectPercentage.toFixed(2)),
        subjectResult: subjectPercentage >= 33 ? "PASS" : "FAIL",
      };
    }),
  };
  res
    .status(200)
    .json(new apiResponse(200, formatted, "Marksheet fetched successfully"));
});

const updateMarks = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  const { id } = req.params;
  const { subjects } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Marksheet ID"));

  const marksheet = await Marksheet.findById(id);
  if (!marksheet)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Marksheet not found"));

  let totalObtained = 0,
    totalMax = 0;
  subjects.forEach((sub) => {
    totalObtained += sub.marksObtained || 0;
    totalMax += sub.maxMarks || 0;
  });
  const percentage =
    totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;

  marksheet.subjects = subjects;
  marksheet.totalObtainedMarks = totalObtained;
  marksheet.totalMarks = totalMax;
  marksheet.percentage = percentage;
  marksheet.result = percentage >= 33 ? "PASS" : "FAIL";
  await marksheet.save();

  const formatted = {
    ...marksheet.toObject(),
    subjects: marksheet.subjects.map((s) => {
      const subjectPercentage =
        s.maxMarks > 0 ? (s.marksObtained / s.maxMarks) * 100 : 0;
      return {
        subjectId: s.subjectId?._id || null,
        subjectName: s.subjectId?.name || "",
        marksObtained: s.marksObtained,
        maxMarks: s.maxMarks,
        subjectPercentage: Number(subjectPercentage.toFixed(2)),
        subjectResult: subjectPercentage >= 33 ? "PASS" : "FAIL",
      };
    }),
  };
  res
    .status(200)
    .json(new apiResponse(200, formatted, "Marksheet updated successfully"));
});

const updateStudentMarks = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);

  let {
    studentId,
    examListId,
    sessionId,
    classId,
    sectionId,
    streamId,
    subjects,
  } = req.body;

  /* ================= VALIDATION ================= */

  if (!studentId || !examListId || !sessionId) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "studentId, examListId & sessionId required",
        ),
      );
  }

  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Subjects array required"));
  }

  // ✅ streamId fix
  if (streamId === "" || !mongoose.Types.ObjectId.isValid(streamId)) {
    streamId = null;
  }

  /* ================= FIND OR CREATE ================= */

  let marksheet = await Marksheet.findOne({
    studentId,
    examListId,
    sessionId,
  });

  if (!marksheet) {
    marksheet = new Marksheet({
      studentId,
      examListId,
      sessionId,
      classId,
      sectionId,
      streamId,
      subjects: [],
    });
  }

  /* ================= UPDATE SUBJECTS ================= */

  subjects.forEach((sub) => {
    const subjectId = sub.subjectId?._id || sub.subjectId;

    if (!subjectId) return;

    const existing = marksheet.subjects.find(
      (s) => String(s.subjectId) === String(subjectId),
    );

    if (existing) {
      // ✅ SAME LOGIC (update)
      existing.maxMarks = sub.maxMarks;
      existing.marksObtained = sub.marksObtained;
    } else {
      // ✅ SAME LOGIC (add)
      marksheet.subjects.push({
        subjectId,
        maxMarks: sub.maxMarks,
        marksObtained: sub.marksObtained,
      });
    }
  });

  /* ================= CALCULATE ================= */

  let totalObtained = 0;
  let totalMarks = 0;

  marksheet.subjects.forEach((s) => {
    totalObtained += Number(s.marksObtained || 0);
    totalMarks += Number(s.maxMarks || 0);
  });

  const percentage =
    totalMarks > 0
      ? Number(((totalObtained / totalMarks) * 100).toFixed(2))
      : 0;

  marksheet.totalObtainedMarks = totalObtained;
  marksheet.totalMarks = totalMarks;
  marksheet.percentage = percentage;
  marksheet.result = percentage >= 33 ? "PASS" : "FAIL";

  /* ================= SAVE ================= */

  await marksheet.save();

  return res
    .status(200)
    .json(new apiResponse(200, marksheet, "Marks updated successfully"));
});

const deleteMarks = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Marksheet ID"));
  const marksheet = await Marksheet.findByIdAndDelete(req.params.id);
  if (!marksheet)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Marksheet not found"));
  res
    .status(200)
    .json(new apiResponse(200, marksheet, "Marksheet deleted successfully"));
});

const getClassWiseMarksSummary = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { classId, sessionId, sectionId, streamId, examListId, examMasterId } =
    req.query;
  let { page = 1, limit = 10 } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  if (!classId || !sessionId)
    return res
      .status(400)
      .json(new apiResponse(400, null, "classId and sessionId are required"));

  const filter = { currentClass: classId, session: sessionId };
  if (sectionId) filter.currentSection = sectionId;
  if (streamId) filter.stream = streamId;

  const totalStudents = await StudentEnrolment.countDocuments(filter);
  if (!totalStudents)
    return res
      .status(404)
      .json(new apiResponse(404, null, "No students found"));

  // isPagination=false → fetch all students, else paginate
  const isPagination = req.query.isPagination !== 'false';
  const totalPages = isPagination ? Math.ceil(totalStudents / limit) : 1;

  const studentsQuery = StudentEnrolment.find(filter)
    .populate("currentClass")
    .populate("currentSection")
    .populate("stream");

  if (isPagination) {
    studentsQuery.skip((page - 1) * limit).limit(limit);
  }

  const students = await studentsQuery;

  const resultData = [];
  for (const student of students) {
    const marksheetFilter = {
      studentId: student._id,
      classId,
      sessionId,
    };
    if (sectionId) marksheetFilter.sectionId = sectionId;
    if (streamId) marksheetFilter.streamId = streamId;
    if (examListId) marksheetFilter.examListId = examListId;

    const marksheets = await Marksheet.find(marksheetFilter)
      .populate({
        path: "examListId",
        populate: { path: "examMasterId" },
      })
      .populate({
        path: "subjects.subjectId",
        select: "name",
      });
    let filteredMarkSheets = examMasterId
      ? marksheets.filter(
          (m) => m.examListId?.examMasterId?._id?.toString() === examMasterId,
        )
      : marksheets;

    let totalObtained = 0,
      totalMarks = 0;
    const allSubjects = [];
    const termsMap = new Map(); // examListId → { examListId, examName, obtained, maxMarks }

    filteredMarkSheets.forEach((m) => {
      totalObtained += m.totalObtainedMarks || 0;
      totalMarks += m.totalMarks || 0;

      // term-wise summary
      const eid = m.examListId?._id?.toString() || m.examListId?.toString() || "unknown";
      const ename =
        m.examListId?.examMasterId?.examName ||
        m.examListId?.examMasterId?.name ||
        "Unknown Exam";
      if (!termsMap.has(eid)) {
        termsMap.set(eid, { examListId: eid, examName: ename, obtained: 0, maxMarks: 0 });
      }
      const term = termsMap.get(eid);
      term.obtained += m.totalObtainedMarks || 0;
      term.maxMarks += m.totalMarks || 0;

      // collect subject-wise marks
      if (m.subjects && Array.isArray(m.subjects)) {
        m.subjects.forEach((sub) => {
          allSubjects.push({
            subjectId: sub.subjectId?._id || sub.subjectId,
            subjectName: sub.subjectId?.name || "Unknown Subject",
            marksObtained: sub.marksObtained || 0,
            maxMarks: sub.maxMarks || 0,
            examListId: eid,
            examName: ename,
          });
        });
      }
    });

    // build terms array with percentage per term
    const terms = [...termsMap.values()].map((t) => ({
      ...t,
      percentage: t.maxMarks > 0 ? Number(((t.obtained / t.maxMarks) * 100).toFixed(2)) : 0,
    }));
    const percentage =
      totalMarks > 0
        ? Number(((totalObtained / totalMarks) * 100).toFixed(2))
        : 0;

    resultData.push({
      studentId: student._id,
      name: `${student.firstName} ${student.lastName}`,
      fatherName: student.fatherName,
      motherName: student.motherName,
      profilePic: student.profilePic,
      rollNumber: student.rollNumber,
      class: student.currentClass?.name,
      section: student.currentSection?.name,
      stream: student.stream || null,
      subjects: allSubjects,
      terms,
      totalObtained,
      totalMarks,
      percentage,
      result: percentage >= 33 ? "PASS" : "FAIL",
    });
  }

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { page, limit, totalStudents, totalPages, students: resultData },
        "Student marks summary fetched",
      ),
    );
});

const getFullMarksheet = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const Session = getSessionModel(req.db);
  const Subject = getSubjectModel(req.db);
  const ExamList = getExamListModel(req.db);

  const { studentId, sessionId, publishedOnly } = req.query;
  if (!studentId)
    return res
      .status(400)
      .json(new apiResponse(400, null, "studentId is required"));

  let finalSessionId = sessionId;
  if (!sessionId) {
    const currentSession = await Session.findOne({ isCurrent: true });
    if (!currentSession)
      return res
        .status(400)
        .json(new apiResponse(400, null, "Session not found"));
    finalSessionId = currentSession._id;
  }

  const student = await StudentEnrolment.findById(studentId)
    .populate("currentClass")
    .populate("currentSection")
    .populate("stream")
    .populate("session");
  if (!student)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Student not found"));

  const classId = student.currentClass?._id;
  const streamId = student.stream?._id;

  const subjects = await Subject.find({
    classes: classId,
    ...(streamId ? { streamId } : {}),
  });
  const examQuery = {
    classId,
    sessionId: finalSessionId,
  };
  // If student view (publishedOnly), only show exams that are published
  if (publishedOnly === "true") examQuery.isPublished = true;

  const exams = await ExamList.find(examQuery).populate("examMasterId");
  if (!exams.length)
    return res.status(404).json(new apiResponse(404, null, "No exams found"));

  const marksheetQuery = {
    studentId,
    sessionId: finalSessionId,
  };
  if (publishedOnly === "true") marksheetQuery.isPublished = true;

  const marksheets = await Marksheet.find(marksheetQuery)
    .populate("subjects.subjectId")
    .populate("examListId");
  const marksheetMap = {};
  marksheets.forEach((m) => {
    marksheetMap[m.examListId?._id] = m;
  });

  const examWiseData = [];

  for (const exam of exams) {
    const classRankings = await Marksheet.find({
      examListId: exam._id,
      classId: student.currentClass?._id,
      sectionId: student.currentSection?._id,
      sessionId: finalSessionId,
    }).sort({ percentage: -1 });
    const rank =
      classRankings.findIndex(
        (item) => item.studentId.toString() === studentId.toString(),
      ) + 1;
    const ms = marksheetMap[exam._id];
    const subjectWiseData = subjects.map((sub) => {
      const subMarks = ms?.subjects?.find(
        (s) => String(s.subjectId?._id) === String(sub._id),
      );
      return {
        subjectId: sub._id,
        subjectName: sub.name,
        maxMarks: subMarks?.maxMarks || 0,
        marksObtained: subMarks?.marksObtained || 0,
        percentage:
          subMarks?.maxMarks > 0
            ? Number(
                ((subMarks.marksObtained / subMarks.maxMarks) * 100).toFixed(2),
              )
            : 0,
        result: subMarks?.maxMarks
          ? subMarks.marksObtained >= subMarks.maxMarks * 0.33
            ? "PASS"
            : "FAIL"
          : "",
      };
    });
    examWiseData.push({
      examId: exam._id,
      examName: exam.examMasterId?.examName,
      examType: exam.examMasterId?.type,
      fromDate: exam.fromDate,
      toDate: exam.toDate,
      subjects: subjectWiseData,
      totalObtained: ms?.totalObtainedMarks || 0,
      totalMarks: ms?.totalMarks || 0,
      percentage: ms?.percentage || 0,
      result: ms?.result || "",
      rank,
    });
  }

  let overallTotalObtained = 0,
    overallTotalMarks = 0;
  examWiseData.forEach((e) => {
    overallTotalObtained += e.totalObtained;
    overallTotalMarks += e.totalMarks;
  });
  const overallPercentage =
    overallTotalMarks > 0
      ? Number(((overallTotalObtained / overallTotalMarks) * 100).toFixed(2))
      : 0;

  return res.status(200).json(
    new apiResponse(
      200,
      {
        studentDetails: {
          studentId: student._id,
          name: `${student.firstName} ${student.middleName || ""} ${student.lastName}`,
          admissionNo: student.studentId || "",
          formNo: student.formNo || "",
          rollNumber: student.rollNumber,
          profilePic: student.profilePic,
          fatherName: student.fatherName,
          motherName: student.motherName,
          dob: student.dob,
          session: student.session?.name,
          class: student.currentClass?.name,
          classId: student.currentClass?._id,
          section: student.currentSection?.name,
          sectionId: student.currentSection?._id,
          stream: student.stream?.name || "",
          streamId: student.stream?._id || "",
        },
        subjects: subjects.map((s) => ({ subjectId: s._id, name: s.name })),
        exams: examWiseData,
        overallSummary: {
          overallTotalObtained,
          overallTotalMarks,
          overallPercentage,
          overallResult: overallPercentage >= 33 ? "PASS" : "FAIL",
        },
      },
      "Full marksheet fetched successfully",
    ),
  );
});

const publishResult = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  const ExamList = getExamListModel(req.db);
  const Notification = getNotificationModel(req.db);
  const User = getUserModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { examListId, classId, sectionId } = req.body;

  // ✅ Validation
  if (!examListId || !mongoose.Types.ObjectId.isValid(examListId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid examListId is required"));
  }

  // 🔥 Build Filter (Tenant-safe)
  const filter = {
    examListId: new mongoose.Types.ObjectId(examListId),
  };

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    filter.classId = new mongoose.Types.ObjectId(classId);
  }

  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId)) {
    filter.sectionId = new mongoose.Types.ObjectId(sectionId);
  }

  // 🔍 Check if any marksheet exists
  const existingCount = await Marksheet.countDocuments(filter);
  if (existingCount === 0) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "No marksheets found for this exam"));
  }

  // ✅ Update Marksheet
  const result = await Marksheet.updateMany(filter, {
    $set: {
      isPublished: true,
      publishedAt: new Date(),
      publishedBy: req.user?._id || null,
    },
  });

  // ✅ Update ExamList
  await ExamList.findByIdAndUpdate(examListId, {
    isPublished: true,
  });
  // ================= FIND STUDENTS =================

  const marksheets = await Marksheet.find(filter).select("studentId");

  const studentIds = marksheets.map((m) => m.studentId);

  // ================= GET USER IDS =================

  const students = await StudentEnrolment.find({
    _id: { $in: studentIds },
  }).select("userId");

  const userIds = students.map((s) => s.userId);

  // ================= SAVE NOTIFICATIONS =================

  if (userIds.length > 0) {
    await Notification.insertMany(
      userIds.map((id) => ({
        userId: id,
        userRole: "Student",
        title: "📄 Result Published",
        message: "Your marksheet has been published",
        payload: {
          type: "marksheet",
          screen: "Result",
          examListId,
        },
      })),
    );
  }

  // ================= GET FCM TOKENS =================

  const users = await User.find({
    _id: { $in: userIds },
    fcmToken: { $exists: true, $ne: null },
  }).select("fcmToken");

  const fcmTokens = users.map((u) => u.fcmToken);

  // ================= SEND PUSH =================

  if (fcmTokens.length > 0) {
    await sendFCMToMultiple(
      fcmTokens,
      "📄 Result Published",
      "Your marksheet has been published",
      {
        type: "marksheet",
        screen: "Result",
        examListId: examListId.toString(),
      },
    );
  }
  return res.status(200).json(
    new apiResponse(
      200,
      {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      },
      "Result published successfully",
    ),
  );
});

const unpublishResult = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);
  const ExamList = getExamListModel(req.db);

  const { examListId, classId, sectionId } = req.body;

  // ✅ Validation
  if (!examListId || !mongoose.Types.ObjectId.isValid(examListId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid examListId is required"));
  }

  // 🔥 Build Filter
  const filter = {
    examListId: new mongoose.Types.ObjectId(examListId),
  };

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    filter.classId = new mongoose.Types.ObjectId(classId);
  }

  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId)) {
    filter.sectionId = new mongoose.Types.ObjectId(sectionId);
  }

  // 🔍 Check existence
  const existingCount = await Marksheet.countDocuments(filter);
  if (existingCount === 0) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "No marksheets found for this exam"));
  }

  // ✅ Update Marksheet
  const result = await Marksheet.updateMany(filter, {
    $set: {
      isPublished: false,
      publishedAt: null,
      publishedBy: null,
    },
  });

  // ✅ Update ExamList
  await ExamList.findByIdAndUpdate(examListId, {
    isPublished: false,
  });

  return res.status(200).json(
    new apiResponse(
      200,
      {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      },
      "Result unpublished successfully",
    ),
  );
});

const teacherCreateMarks = asyncHandler(async (req, res) => {
  const { examListId, studentId, subjects } = req.body;

  const loggedInUser = req.user;

  // ✅ Tenant Models
  const Session = getSessionModel(req.db);
  const Teacher = getTeacherModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const Marksheet = getMarksheetModel(req.db);

  /* ================= ROLE CHECK ================= */
  if (loggedInUser.role !== "Teacher") {
    return res
      .status(403)
      .json(new apiResponse(403, null, "Only teachers can add marks"));
  }

  /* ================= VALIDATION ================= */
  if (
    !mongoose.Types.ObjectId.isValid(examListId) ||
    !mongoose.Types.ObjectId.isValid(studentId)
  ) {
    return res.status(400).json(new apiResponse(400, null, "Invalid IDs"));
  }

  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Subjects are required"));
  }

  /* ================= SESSION ================= */
  const currentSession = await Session.findOne({ isCurrent: true });

  if (!currentSession) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Current session not found"));
  }

  /* ================= TEACHER ================= */
  const teacher = await Teacher.findOne({ userId: loggedInUser._id });

  if (!teacher) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Teacher profile not found"));
  }

  /* ================= STUDENT ================= */
  const student = await StudentEnrolment.findById(studentId);

  if (!student) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Student not found"));
  }

  const classId = student.currentClass;
  const sectionId = student.currentSection;
  const streamId = student.stream || null;

  /* ================= SECURITY CHECK ================= */
  // 👉 Ensure teacher belongs to same class (optional but recommended)
  if (teacher.classId && String(teacher.classId) !== String(classId)) {
    return res
      .status(403)
      .json(new apiResponse(403, null, "You are not assigned to this class"));
  }

  /* ================= FIND EXISTING ================= */
  let marksheet = await Marksheet.findOne({
    examListId,
    studentId,
    sessionId: currentSession._id,
  });

  /* ================= CREATE ================= */
  if (!marksheet) {
    marksheet = new Marksheet({
      examListId,
      studentId,
      classId,
      sectionId,
      streamId,
      sessionId: currentSession._id,
      subjects: [],
      isPublished: false,
    });
  }

  /* ================= MERGE SUBJECTS ================= */
  subjects.forEach((newSub) => {
    let subjectId = newSub.subjectId;

    // ✅ normalize
    if (typeof subjectId === "object") {
      subjectId = subjectId._id;
    }

    if (!mongoose.Types.ObjectId.isValid(subjectId)) return;

    const index = marksheet.subjects.findIndex(
      (s) => String(s.subjectId) === String(subjectId),
    );

    if (index > -1) {
      // ✅ update
      marksheet.subjects[index].marksObtained = Number(
        newSub.marksObtained || 0,
      );
      marksheet.subjects[index].maxMarks = Number(newSub.maxMarks || 0);
    } else {
      // ✅ add
      marksheet.subjects.push({
        subjectId,
        marksObtained: Number(newSub.marksObtained || 0),
        maxMarks: Number(newSub.maxMarks || 0),
      });
    }
  });

  /* ================= CALCULATION ================= */
  let totalObtained = 0;
  let totalMax = 0;

  marksheet.subjects.forEach((s) => {
    totalObtained += Number(s.marksObtained || 0);
    totalMax += Number(s.maxMarks || 0);
  });

  marksheet.totalObtainedMarks = totalObtained;
  marksheet.totalMarks = totalMax;
  marksheet.percentage =
    totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;

  marksheet.result = marksheet.percentage >= 33 ? "PASS" : "FAIL";

  /* ================= SAVE ================= */
  await marksheet.save();

  return res
    .status(200)
    .json(new apiResponse(200, marksheet, "Marks saved/updated successfully"));
});

// ================= CLASS WISE TOPPER API =================

const getClassWiseTopper = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);

  const { classId, sectionId, examListId, sessionId } = req.query;

  // ================= VALIDATION =================

  if (!sessionId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "sessionId is required"));
  }

  // ================= FILTER =================

  const filter = {
    sessionId: new mongoose.Types.ObjectId(sessionId),
  };

  // ================= OPTIONAL FILTERS =================

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    filter.classId = new mongoose.Types.ObjectId(classId);
  }

  if (sectionId && mongoose.Types.ObjectId.isValid(sectionId)) {
    filter.sectionId = new mongoose.Types.ObjectId(sectionId);
  }

  if (examListId && mongoose.Types.ObjectId.isValid(examListId)) {
    filter.examListId = new mongoose.Types.ObjectId(examListId);
  }

  console.log("FILTER =>", filter);

  // ================= GET DATA =================

  const marksheets = await Marksheet.find(filter)
    .populate("studentId")
    .populate("classId")
    .populate("sectionId")
    .sort({
      classId: 1,
      percentage: -1,
      totalObtainedMarks: -1,
    });

  console.log("MARKSHEETS FOUND =>", marksheets.length);

  if (!marksheets.length) {
    return res.status(404).json(new apiResponse(404, null, "No results found"));
  }

  // ================= GROUP CLASSWISE =================

  const grouped = {};

  marksheets.forEach((item) => {
    const clsId = item.classId?._id?.toString();

    if (!clsId) return;

    // Create array for class
    if (!grouped[clsId]) {
      grouped[clsId] = [];
    }

    // Only top 3 per class
    if (grouped[clsId].length < 3) {
      grouped[clsId].push({
        rank: grouped[clsId].length + 1,

        student: {
          _id: item.studentId?._id,
          studentId: item.studentId?.studentId,
          rollNumber: item.studentId?.rollNumber,
          name: `${item.studentId?.firstName || ""} ${item.studentId?.lastName || ""}`.trim(),
          fatherName: item.studentId?.fatherName || "",
          profilePic: item.studentId?.profilePic || "",
        },

        class: {
          _id: item.classId?._id,
          className: item.classId?.name || "",
        },

        section: {
          _id: item.sectionId?._id,
          sectionName: item.sectionId?.name || "",
        },

        totalObtainedMarks: item.totalObtainedMarks || 0,
        totalMarks: item.totalMarks || 0,
        percentage: item.percentage || 0,
        result: item.result || "",
      });
    }
  });

  // ================= FINAL ARRAY =================

  const finalData = Object.values(grouped).flat();

  return res.status(200).json(
    new apiResponse(
      200,
      {
        toppers: finalData,
      },
      "Class wise toppers fetched successfully",
    ),
  );
});

// ================= SCHOOL WISE TOPPER API =================

// ================= SCHOOL WISE TOPPER API =================

const getSchoolWiseTopper = asyncHandler(async (req, res) => {
  const Marksheet = getMarksheetModel(req.db);

  const { examListId, sessionId } = req.query;

  // ================= VALIDATION =================

  if (!sessionId) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "sessionId is required"));
  }

  // ================= FILTER =================

  const filter = {
    sessionId: new mongoose.Types.ObjectId(sessionId),
  };

  // OPTIONAL EXAM FILTER

  if (examListId && mongoose.Types.ObjectId.isValid(examListId)) {
    filter.examListId = new mongoose.Types.ObjectId(examListId);
  }

  // ================= GET DATA =================

  const marksheets = await Marksheet.find(filter)
    .populate("studentId")
    .populate("classId")
    .populate("sectionId")
    .sort({
      percentage: -1,
      totalObtainedMarks: -1,
    });

  if (!marksheets.length) {
    return res.status(404).json(new apiResponse(404, null, "No results found"));
  }

  // ================= RANKING =================

  const rankedStudents = marksheets.map((item, index) => ({
    rank: index + 1,

    student: {
      _id: item.studentId?._id,
      studentId: item.studentId?.studentId,
      rollNumber: item.studentId?.rollNumber,
      name: `${item.studentId?.firstName || ""} ${item.studentId?.lastName || ""}`.trim(),
      fatherName: item.studentId?.fatherName || "",
      profilePic: item.studentId?.profilePic || "",
    },

    class: {
      _id: item.classId?._id,
      className: item.classId?.name || "",
    },

    section: {
      _id: item.sectionId?._id,
      sectionName: item.sectionId?.name || "",
    },

    totalObtainedMarks: item.totalObtainedMarks,
    totalMarks: item.totalMarks,
    percentage: item.percentage,
    result: item.result,
  }));

  // ================= TOP 3 =================

  const top3 = rankedStudents.slice(0, 3);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        toppers: rankedStudents,
        top3,
      },
      "School wise toppers fetched successfully",
    ),
  );
});

export {
  createMarks,
  getAllMarks,
  getMarksById,
  updateMarks,
  updateStudentMarks,
  deleteMarks,
  getClassWiseMarksSummary,
  getFullMarksheet,
  publishResult,
  unpublishResult,
  teacherCreateMarks,
  getClassWiseTopper,
  getSchoolWiseTopper,
};
