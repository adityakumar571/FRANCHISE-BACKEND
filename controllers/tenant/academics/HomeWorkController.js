import mongoose from "mongoose";

import { getSessionModel } from "../../../models/tenant/master/Session.model.js";
import { getTeacherModel } from "../../../models/tenant/teacher/Teacher.model.js";
import { getHomeworkModel } from "../../../models/tenant/master/HomeWork.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getNotificationModel } from "../../../models/tenant/Notification.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { sendFCMToMultiple } from "../../../utils/sendFCMNotification.js";
import { getUserModel } from "../../../models/tenant/user.model.js";

export const createHomework_old = asyncHandler(async (req, res) => {
  const Session = getSessionModel(req.db);
  const Teacher = getTeacherModel(req.db);
  const Homework = getHomeworkModel(req.db);
  const Notification = getNotificationModel(req.db);

  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const User = getUserModel(req.db);
  const {
    classId,
    sectionId,
    subjectId,
    title,
    description,
    homeworkType,
    assignDate,
    dueDate,
    attachments,

  } = req.body;

  const user = req.user;

  if (user.role !== "Teacher") {
    return res
      .status(403)
      .json(new apiResponse(403, null, "Only teachers allowed"));
  }

  const session = await Session.findOne({ isCurrent: true });

  const teacher = await Teacher.findOne({ userId: user._id });

  const isAllowed = teacher.classesAssigned.some(
    (c) =>
      c.classId.toString() === classId &&
      c.sectionId.toString() === sectionId &&
      c.subjectId.toString() === subjectId &&
      c.session.toString() === session._id.toString(),
  );

  if (!isAllowed) {
    return res
      .status(403)
      .json(
        new apiResponse(
          403,
          null,
          "Not allowed for this class/section/subject",
        ),
      );
  }

  const homework = await Homework.create({
    sessionId: session._id,
    classId,
    sectionId,
    subjectId,
    teacherId: teacher._id,
    title,
    description,
    homeworkType,
    assignDate,
    dueDate,
    attachments,

  });

  res.status(201).json(new apiResponse(201, homework, "Homework created"));
});

export const createHomework = asyncHandler(async (req, res) => {
  const Session = getSessionModel(req.db);
  const Notification = getNotificationModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const User = getUserModel(req.db);
  const Teacher = getTeacherModel(req.db);
  const Homework = getHomeworkModel(req.db);
  const {
    classId,
    sectionId,
    subjectId,
    streamId,
    sessionId, // ✅ Admin can pass sessionId directly
    title,
    description,
    homeworkType,
    assignDate,
    dueDate,
    attachments,

  } = req.body;

  const user = req.user;
  const isAdmin = user.role === "Admin" || user.role === "SuperAdmin";

  // Only block if not Teacher AND not Admin
  if (!isAdmin && user.role !== "Teacher") {
    return res
      .status(403)
      .json(new apiResponse(403, null, "Only teachers or admins allowed"));
  }

  // Resolve session
  let resolvedSessionId;
  if (sessionId) {
    resolvedSessionId = sessionId;
  } else {
    const session = await Session.findOne({ isCurrent: true });
    if (!session) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "No active session found"));
    }
    resolvedSessionId = session._id;
  }

  // For teachers: validate they are assigned to this class/section/subject
  let resolvedTeacherId = null;
  if (!isAdmin) {
    const teacher = await Teacher.findOne({ userId: user._id });
    if (!teacher) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Teacher not found"));
    }

    const isAllowed = teacher.classesAssigned.some(
      (c) =>
        c.classId.toString() === classId &&
        c.sectionId.toString() === sectionId &&
        c.subjectId.toString() === subjectId &&
        c.session.toString() === resolvedSessionId.toString(),
    );

    if (!isAllowed) {
      return res
        .status(403)
        .json(
          new apiResponse(
            403,
            null,
            "Not allowed for this class/section/subject/stream",
          ),
        );
    }
    resolvedTeacherId = teacher._id;
  } else {
    // Admin: find any teacher assigned to this class/section, or leave null
    const teacher = await Teacher.findOne({
      "classesAssigned.classId": classId,
      "classesAssigned.sectionId": sectionId,
    });
    resolvedTeacherId = teacher?._id || null;
  }

  // teacherId is required in model — if admin and no teacher found, still allow but warn
  const homeworkData = {
    sessionId: resolvedSessionId,
    classId,
    sectionId,
    streamId: streamId || null,
    subjectId,
    title,
    description,
    homeworkType,
    assignDate,
    dueDate,
    attachments: attachments || [],
  };

  if (resolvedTeacherId) {
    homeworkData.teacherId = resolvedTeacherId;
  } else if (isAdmin) {
    // Admin assigned — use a system placeholder or skip if model allows null
    // We'll patch the model to allow null for admin-assigned homework
    homeworkData.teacherId = null;
  } else {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          "No teacher found for this class/section. Please assign a teacher first.",
        ),
      );
  }

  const homework = await Homework.create(homeworkData);
  // ================= STUDENTS FIND =================

  const students = await StudentEnrolment.find({
    currentClass: classId,
    currentSection: sectionId,
  }).select("userId");

  const userIds = students.map((s) => s.userId);

  // ================= SAVE NOTIFICATIONS =================

  if (userIds.length > 0) {
    await Notification.insertMany(
      userIds.map((id) => ({
        userId: id,
        userRole: "Student",

        title: title,

        message: description || "New homework assigned",

        payload: {
          type: "homework",
          screen: "Homework",
          entityId: homework._id,
          assignDate,
          dueDate,
        },
      })),
    );
  }

  // ================= FCM TOKENS =================

  const users = await User.find({
    _id: { $in: userIds },
    fcmToken: { $exists: true, $ne: null },
  }).select("fcmToken");

  const fcmTokens = users.map((u) => u.fcmToken);

  // ================= SEND PUSH =================

  if (fcmTokens.length > 0) {
    await sendFCMToMultiple(fcmTokens, "📚 New Homework Assigned", title, {
      type: "homework",
      screen: "Homework",
      entityId: homework._id.toString(),
    });
  }
  res.status(201).json(new apiResponse(201, homework, "Homework created"));
});

export const getAllHomework_old = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  let {
    page = 1,
    limit = 10,
    classId,
    sectionId,
    subjectId,
    streamId,
    isPagination = "true",
  } = req.query;

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  const filter = {};

  if (classId) filter.classId = classId;
  if (sectionId) filter.sectionId = sectionId;
  if (subjectId) filter.subjectId = subjectId;
  if (streamId) filter.streamId = streamId;

  const totalRows = await Homework.countDocuments(filter);

  let query = Homework.find(filter)
    .populate("classId", "name")
    .populate("sectionId", "name")
    .populate("subjectId", "name")
    .populate("teacherId", "firstName lastName")
    .sort({ createdAt: -1 });

  if (isPagination === "true") {
    query = query.skip(skip).limit(limit);
  }

  const data = await query;

  res.status(200).json(
    new apiResponse(
      200,
      {
        list: data,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "Homework list fetched",
    ),
  );
});

export const getAllHomework = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  let {
    page = 1,
    limit = 10,
    classId,
    sectionId,
    subjectId,
    streamId,
    fromDate,
    toDate,
    isPagination = "true",
  } = req.query;

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  const filter = {};

  if (classId) filter.classId = classId;
  if (sectionId) filter.sectionId = sectionId;
  if (subjectId) filter.subjectId = subjectId;
  if (streamId) filter.streamId = streamId;

  /* ================= DATE FILTER ================= */
  if (fromDate || toDate) {
    filter.assignDate = {};

    if (fromDate) {
      filter.assignDate.$gte = new Date(fromDate);
    }

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999); // 🔥 include full day
      filter.assignDate.$lte = end;
    }
  }

  const totalRows = await Homework.countDocuments(filter);

  let query = Homework.find(filter)
    .populate("classId", "name")
    .populate("sectionId", "name")
    .populate("subjectId", "name")
    .populate("streamId", "name")
    .populate("teacherId", "firstName lastName")
    .sort({ createdAt: -1 });

  if (isPagination === "true") {
    query = query.skip(skip).limit(limit);
  }

  const data = await query;

  res.status(200).json(
    new apiResponse(
      200,
      {
        list: data,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "Homework list fetched",
    ),
  );
});

export const getStudentHomework_old = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  let {
    classId,
    sectionId,
    subjectId,
    streamId,
    page = 1,
    limit = 10,
    isPagination = "true",
  } = req.query;

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  const filter = {
    classId,
    sectionId,
    isActive: true,
  };

  if (subjectId) filter.subjectId = subjectId;
  if (streamId) filter.streamId = streamId;

  const totalRows = await Homework.countDocuments(filter);

  let query = Homework.find(filter)
    .populate("subjectId", "name")
    .populate("teacherId", "firstName lastName")
    .sort({ createdAt: -1 });

  if (isPagination === "true") {
    query = query.skip(skip).limit(limit);
  }

  const data = await query;

  res.status(200).json(
    new apiResponse(
      200,
      {
        list: data,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "Student homework fetched",
    ),
  );
});

export const getStudentHomework = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  let {
    classId,
    sectionId,
    studentId,
    subjectId,
    streamId,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
    isPagination = "true",
  } = req.query;

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  const filter = {
    classId,
    sectionId,
    isActive: true,
  };

  if (subjectId) filter.subjectId = subjectId;
  if (streamId) filter.streamId = streamId;

  /* ================= DATE FILTER ================= */
  if (fromDate || toDate) {
    filter.assignDate = {};

    if (fromDate) {
      filter.assignDate.$gte = new Date(fromDate);
    }

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      filter.assignDate.$lte = end;
    }
  }

  const totalRows = await Homework.countDocuments(filter);

  let query = Homework.find(filter)
    .populate("subjectId", "name")
    .populate("teacherId", "firstName lastName")
    .sort({ createdAt: -1 });

  if (isPagination === "true") {
    query = query.skip(skip).limit(limit);
  }

  const data = await query;
  console.log("===== READ CHECK =====");

  console.log("studentId =>", studentId);

  console.log("classId =>", classId);

  console.log("sectionId =>", sectionId);

  if (studentId) {
    const updateResult = await Homework.updateMany(
      {
        classId,
        sectionId,

        "readBy.studentId": {
          $ne: studentId,
        },
      },
      {
        $push: {
          readBy: {
            studentId,
            readAt: new Date(),
          },
        },
      },
    );

    console.log("UPDATE RESULT =>", updateResult);
  }
  res.status(200).json(
    new apiResponse(
      200,
      {
        list: data,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "Student homework fetched",
    ),
  );
});

export const getHomeworkById = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  const { id } = req.params;

  const homework = await Homework.findById(id)
    .populate("classId", "name")
    .populate("sectionId", "name")
    .populate("subjectId", "name")
    .populate("teacherId", "firstName lastName");

  if (!homework) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Homework not found"));
  }

  res.status(200).json(new apiResponse(200, homework, "Homework fetched"));
});

export const getHomeworkByTeacher = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  let {
    teacherId,
    classId,
    sectionId,
    subjectId,
    streamId,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
    isPagination = "true",
  } = req.query;

  /* ================= VALIDATION ================= */
  if (!teacherId || !mongoose.Types.ObjectId.isValid(teacherId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid teacherId required"));
  }

  page = Number(page);
  limit = Number(limit);
  const skip = (page - 1) * limit;

  /* ================= FILTER ================= */
  const filter = {
    teacherId: new mongoose.Types.ObjectId(teacherId),
  };

  if (classId) filter.classId = classId;
  if (sectionId) filter.sectionId = sectionId;
  if (subjectId) filter.subjectId = subjectId;
  if (streamId) filter.streamId = streamId;

  /* ================= DATE FILTER ================= */
  if (fromDate || toDate) {
    filter.assignDate = {};

    if (fromDate) {
      filter.assignDate.$gte = new Date(fromDate);
    }

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      filter.assignDate.$lte = end;
    }
  }

  /* ================= COUNT ================= */
  const totalRows = await Homework.countDocuments(filter);

  /* ================= QUERY ================= */
  let query = Homework.find(filter)
    .populate("classId", "name")
    .populate("sectionId", "name")
    .populate("subjectId", "name")
    .populate("streamId", "name")
    .populate("teacherId", "firstName lastName")
    .sort({ createdAt: -1 });

  if (isPagination === "true") {
    query = query.skip(skip).limit(limit);
  }

  const data = await query;

  /* ================= RESPONSE ================= */
  res.status(200).json(
    new apiResponse(
      200,
      {
        list: data,
        pagination: {
          totalRows,
          totalPages: Math.ceil(totalRows / limit),
          currentPage: page,
          perPage: limit,
        },
      },
      "Teacher homework fetched successfully",
    ),
  );
});

export const updateHomework = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  const { id } = req.params;

  const homework = await Homework.findById(id);

  if (!homework) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Homework not found"));
  }

  Object.assign(homework, req.body);

  await homework.save();

  res.status(200).json(new apiResponse(200, homework, "Homework updated"));
});

export const deleteHomework = asyncHandler(async (req, res) => {
  const Homework = getHomeworkModel(req.db);
  const { id } = req.params;

  const homework = await Homework.findByIdAndDelete(id);

  if (!homework) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Homework not found"));
  }

  res.status(200).json(new apiResponse(200, null, "Homework deleted"));
});
