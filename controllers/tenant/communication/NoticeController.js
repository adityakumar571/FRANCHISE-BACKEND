import { getNoticeModel } from "../../../models/tenant/Notice.model.js";
import { getTeacherModel } from "../../../models/tenant/teacher/Teacher.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getUserModel } from "../../../models/tenant/user.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendFCMToMultiple } from "../../../utils/sendFCMNotification.js";
import mongoose from "mongoose";
import { getNotificationModel } from "../../../models/tenant/Notification.model.js";

/* =========================================================
   🔹 HELPER — COLLECT FCM TOKENS BASED ON RECIPIENTS
========================================================= */
const collectFCMTokens = async (recipients, db) => {
  const User = getUserModel(db);
  const Teacher = getTeacherModel(db);
  const StudentEnrolment = getStudentEnrolmentModel(db);

  const tokenSet = new Set();

  // 1. Role-based — fetch all users with that role
  if (recipients.roles?.length) {
    const users = await User.find({
      role: { $in: recipients.roles },
      fcmToken: { $exists: true, $ne: null },
    }).select("fcmToken");
    users.forEach((u) => u.fcmToken && tokenSet.add(u.fcmToken));
  }

  // 2. Specific Admins
  if (recipients.specificAdmins?.length) {
    const users = await User.find({
      _id: { $in: recipients.specificAdmins },
      fcmToken: { $exists: true, $ne: null },
    }).select("fcmToken");
    users.forEach((u) => u.fcmToken && tokenSet.add(u.fcmToken));
  }

  // 3. Specific Teachers → get their userId → get fcmToken
  if (recipients.specificTeachers?.length) {
    const teachers = await Teacher.find({
      _id: { $in: recipients.specificTeachers },
    }).select("userId");
    const userIds = teachers.map((t) => t.userId);
    const users = await User.find({
      _id: { $in: userIds },
      fcmToken: { $exists: true, $ne: null },
    }).select("fcmToken");
    users.forEach((u) => u.fcmToken && tokenSet.add(u.fcmToken));
  }

  // 4. Specific Students → get their userId → get fcmToken
  if (recipients.specificStudents?.length) {
    const enrolments = await StudentEnrolment.find({
      _id: { $in: recipients.specificStudents },
    }).select("userId");
    const userIds = enrolments.map((e) => e.userId);
    const users = await User.find({
      _id: { $in: userIds },
      fcmToken: { $exists: true, $ne: null },
    }).select("fcmToken");
    users.forEach((u) => u.fcmToken && tokenSet.add(u.fcmToken));
  }

  // 5. Class + Section based students
  if (recipients.classIds?.length || recipients.sectionIds?.length) {
    const query = {};
    if (recipients.classIds?.length)
      query.currentClass = { $in: recipients.classIds };
    if (recipients.sectionIds?.length)
      query.currentSection = { $in: recipients.sectionIds };

    const enrolments = await StudentEnrolment.find(query).select("userId");
    const userIds = enrolments.map((e) => e.userId);
    const users = await User.find({
      _id: { $in: userIds },
      fcmToken: { $exists: true, $ne: null },
    }).select("fcmToken");
    users.forEach((u) => u.fcmToken && tokenSet.add(u.fcmToken));
  }

  return [...tokenSet];
};

/* =========================================================
   🔹 VALIDATE RECIPIENTS BASED ON SENDER ROLE
========================================================= */
const validateRecipients = async (
  senderRole,
  recipients = {},
  senderMeta = {},
  db,
) => {
  const Teacher = getTeacherModel(db);
  const StudentEnrolment = getStudentEnrolmentModel(db);
  const User = getUserModel(db);

  const validated = { ...recipients };

  switch (senderRole) {
    /* ================= SUPERADMIN ================= */
    case "SuperAdmin":
      if (validated.roles && validated.roles.some((r) => r !== "Admin")) {
        throw new Error("SuperAdmin can only send to Admin");
      }
      if (
        validated.specificTeachers?.length ||
        validated.specificStudents?.length ||
        validated.classIds?.length ||
        validated.sectionIds?.length
      ) {
        throw new Error("SuperAdmin can only send to Admin");
      }
      break;

    /* ================= ADMIN ================= */
    case "Admin":
      if (validated.roles?.includes("SuperAdmin")) {
        throw new Error("Admin cannot send to SuperAdmin");
      }
      break;

    /* ================= TEACHER ================= */
    case "Teacher":
      if (validated.roles) {
        const invalidRoles = validated.roles.filter(
          (r) => !["Student", "Teacher", "Admin"].includes(r),
        );
        if (invalidRoles.length) {
          throw new Error("Teacher cannot send to " + invalidRoles.join(", "));
        }
      }

      if (validated.roles?.includes("Student")) {
        if (!validated.classIds?.length) {
          validated.classIds = undefined;
        }

        if (
          validated.classIds?.length &&
          senderMeta?.classIds?.length &&
          !validated.classIds.every((id) =>
            senderMeta.classIds.includes(id.toString()),
          )
        ) {
          throw new Error("Teacher can only send to their own classes");
        }
      }
      break;

    /* ================= STUDENT ================= */
    case "Student":
      if (validated.roles && validated.roles.some((r) => r !== "Admin")) {
        throw new Error("Student can only send to Admin");
      }
      if (
        validated.specificStudents?.length ||
        validated.classIds?.length ||
        validated.sectionIds?.length ||
        validated.specificAdmins?.length
      ) {
        throw new Error("Student can only send to specific Teachers or Admin");
      }
      break;

    default:
      throw new Error("Invalid sender role");
  }

  /* ================= ID VALIDATION ================= */
  if (validated.specificTeachers?.length) {
    const teachers = await Teacher.find({
      _id: { $in: validated.specificTeachers },
    }).select("_id");
    validated.specificTeachers = teachers.map((t) => t._id);
  }

  if (validated.specificStudents?.length) {
    const students = await StudentEnrolment.find({
      _id: { $in: validated.specificStudents },
    }).select("_id");
    validated.specificStudents = students.map((s) => s._id);
  }

  if (validated.specificAdmins?.length) {
    const admins = await User.find({
      _id: { $in: validated.specificAdmins },
    }).select("_id");
    validated.specificAdmins = admins.map((a) => a._id);
  }

  return validated;
};

/* =========================================================
   🔹 CREATE NOTICE
========================================================= */
const createNotice = asyncHandler(async (req, res) => {
  const Notice = getNoticeModel(req.db);
  const Teacher = getTeacherModel(req.db);

  const { title, description, sender, recipients,attachment, session } = req.body;
console.log("sdasdfsadf",title, description, attachment, sender, recipients, session )
  if (!title?.trim())
    return res.status(400).json(new apiResponse(400, null, "Title required"));

  if (!description?.trim())
    return res
      .status(400)
      .json(new apiResponse(400, null, "Description required"));

  if (!sender?.id || !sender?.role)
    return res
      .status(400)
      .json(new apiResponse(400, null, "Sender info required"));

  if (!session || !mongoose.Types.ObjectId.isValid(session))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid session is required"));

  /* ================= SENDER META ================= */
  let senderMeta = {};
console.log(senderMeta)
  if (sender.role === "Teacher") {
    const teacher = await Teacher.findOne({ userId: sender.id }).select(
      "classIds",
    );
    if (!teacher)
      return res
        .status(404)
        .json(new apiResponse(404, null, "Teacher not found"));

    senderMeta.classIds = Array.isArray(teacher.classIds)
      ? teacher.classIds.map((id) => id.toString())
      : [];
  }

  /* ================= VALIDATE RECIPIENTS ================= */
  const validatedRecipients = await validateRecipients(
    sender.role,
    recipients,
    senderMeta,
    req.db,
  );

  /* ================= CREATE NOTICE ================= */
  const notice = await Notice.create({
    title: title.trim(),
    description: description.trim(),
    sender,
    attachment,
    recipients: validatedRecipients,
    session,
  });
  const Notification = getNotificationModel(req.db);
  const User = getUserModel(req.db);

  let usersToNotify = [];

  /* ROLE BASED USERS */
  if (validatedRecipients.roles?.length) {
    const roleUsers = await User.find({
      role: { $in: validatedRecipients.roles },
    }).select("_id role");

    usersToNotify.push(...roleUsers);
  }

  /* CLASS BASED STUDENTS */
  if (validatedRecipients.classIds?.length) {
    const enrolments = await getStudentEnrolmentModel(req.db)
      .find({
        currentClass: {
          $in: validatedRecipients.classIds,
        },
      })
      .select("userId");

    const studentUsers = enrolments.map((e) => ({
      _id: e.userId,
      role: "Student",
    }));

    usersToNotify.push(...studentUsers);
  }

  /* SPECIFIC STUDENTS */
  if (validatedRecipients.specificStudents?.length) {
    const enrolments = await getStudentEnrolmentModel(req.db)
      .find({
        _id: {
          $in: validatedRecipients.specificStudents,
        },
      })
      .select("userId");

    const studentUsers = enrolments.map((e) => ({
      _id: e.userId,
      role: "Student",
    }));

    usersToNotify.push(...studentUsers);
  }

  /* REMOVE DUPLICATES */
  const uniqueUsers = [
    ...new Map(usersToNotify.map((u) => [u._id.toString(), u])).values(),
  ];

  /* SAVE IN DB */
  if (uniqueUsers.length > 0) {
    await Notification.insertMany(
      uniqueUsers.map((user) => ({
        userId: user._id,
        userRole: user.role,
        title: title.trim(),
        message: description.trim(),
        payload: {
          type: "notice",
          screen: "Notice",
          entityId: notice._id,
        },
      })),
    );
  }
  // 🔔 FCM Push Notification — recipients ke devices pe bhejo
  try {
    const fcmTokens = await collectFCMTokens(validatedRecipients, req.db);
    if (fcmTokens.length > 0) {
      await sendFCMToMultiple(
        fcmTokens,
        `📢 New Notice: ${title.trim()}`,
        description.trim().substring(0, 100),
        {
          type: "notice",
          screen: "NoticeDetails",
          entityId: notice._id.toString(),
        },
      );
    }
  } catch (fcmError) {
    console.error("FCM notice push failed:", fcmError.message);
    // FCM fail hone pe notice create hona nahi rukna chahiye
  }

  res
    .status(201)
    .json(new apiResponse(201, notice, "Notice created successfully"));
});

/* =========================================================
   🔹 GET ALL NOTICES
========================================================= */
const getAllNotices = asyncHandler(async (req, res) => {
  const Notice = getNoticeModel(req.db);
  const Teacher = getTeacherModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const {
    page = 1,
    limit = 10,
    search,
    fromDate,
    toDate,
    sortBy = "recent",
    isPagination = "true",
    session,
  } = req.query;

  const userId = req.user._id;
  const userRole = req.user.role;

  const match = {};

  /* ================= SEARCH ================= */
  if (search) {
    const regex = new RegExp(search, "i");
    match.$or = [{ title: regex }, { description: regex }];
  }

  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      match.createdAt.$lte = endDate;
    }
  }

  if (session && mongoose.Types.ObjectId.isValid(session)) {
    match.session = new mongoose.Types.ObjectId(session);
  }

  /* ================= ACCESS CONTROL ================= */
  const accessConditions = [];

  if (userRole === "SuperAdmin") {
    // SuperAdmin → all notices visible
  } else if (userRole === "Admin") {
    accessConditions.push(
      { "sender.id": userId },
      { "recipients.roles": "Admin" },
      { "recipients.specificAdmins": userId },
    );
  } else if (userRole === "Teacher") {
    const teacher = await Teacher.findOne({ userId }).select(
      "_id classesAssigned",
    );

    if (!teacher)
      return res
        .status(404)
        .json(new apiResponse(404, null, "Teacher profile not found"));

    const classIds = teacher.classesAssigned
      ?.map((c) => c.classId)
      .filter(Boolean);

    accessConditions.push(
      { "sender.id": userId },
      { "recipients.roles": "Teacher" },
      { "recipients.specificTeachers": teacher._id },
      {
        $and: [
          { "recipients.roles": "Student" },
          { "recipients.classIds": { $in: classIds } },
        ],
      },
    );
  } else if (userRole === "Student") {
    const enrolments = await StudentEnrolment.find({ userId }).select(
      "_id currentClass currentSection",
    );

    const studentIds = enrolments.map((e) => e._id);
    const classIds = enrolments.map((e) => e.currentClass).filter(Boolean);
    const sectionIds = enrolments.map((e) => e.currentSection).filter(Boolean);

    accessConditions.push(
      { "sender.id": userId },
      { "recipients.roles": "Student" },
      { "recipients.specificStudents": { $in: studentIds } },
      {
        $and: [
          { "recipients.classIds": { $in: classIds } },
          { "recipients.sectionIds": { $in: sectionIds } },
        ],
      },
    );
  }

  if (accessConditions.length) {
    match.$and = match.$and || [];
    match.$and.push({ $or: accessConditions });
  }

  /* ================= AGGREGATION ================= */
  const pipeline = [{ $match: match }];

  pipeline.push({
    $sort: sortBy === "oldest" ? { createdAt: 1 } : { createdAt: -1 },
  });

  const totalArr = await Notice.aggregate([...pipeline, { $count: "count" }]);
  const total = totalArr[0]?.count || 0;

  if (isPagination === "true") {
    pipeline.push(
      { $skip: (page - 1) * Number(limit) },
      { $limit: Number(limit) },
    );
  }

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "sender.id",
        foreignField: "_id",
        as: "senderUser",
      },
    },
    { $unwind: { path: "$senderUser", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        isRead: { $in: [userId, { $ifNull: ["$readBy", []] }] },
      },
    },
  );

  const notices = await Notice.aggregate(pipeline);

  res.status(200).json(
    new apiResponse(200, {
      notices,
      totalNotices: total,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
    }),
  );
});

/* =========================================================
   🔹 GET NOTICE BY ID
========================================================= */
const getNoticeById = asyncHandler(async (req, res) => {
  const Notice = getNoticeModel(req.db);
  const Teacher = getTeacherModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Notice ID"));

  const userId = req.user._id;
  const userRole = req.user.role;

  /* ================= FETCH NOTICE ================= */
  const notice = await Notice.findById(id)
    .populate("recipients.specificTeachers", "name")
    .populate("recipients.specificStudents", "name")
    .populate("recipients.specificAdmins", "name");

  if (!notice)
    return res.status(404).json(new apiResponse(404, null, "Notice not found"));

  /* ================= ACCESS CONTROL ================= */
  let canView = false;

  if (userRole === "SuperAdmin") {
    canView = true;
  }

  if (userRole === "Admin") {
    if (
      notice.recipients.roles?.includes("Admin") ||
      notice.recipients.specificAdmins?.some(
        (a) => a._id.toString() === userId.toString(),
      )
    ) {
      canView = true;
    }
  }

  if (userRole === "Teacher") {
    const teacher = await Teacher.findOne({ userId }).select(
      "_id classesAssigned",
    );

    const teacherClassIds = teacher?.classesAssigned
      ?.map((c) => c.classId?.toString())
      .filter(Boolean);

    if (
      notice.recipients.roles?.includes("Teacher") ||
      notice.recipients.specificTeachers?.some(
        (t) => t._id.toString() === teacher?._id.toString(),
      ) ||
      (notice.recipients.roles?.includes("Student") &&
        notice.recipients.classIds?.some((cid) =>
          teacherClassIds?.includes(cid.toString()),
        ))
    ) {
      canView = true;
    }
  }

  if (userRole === "Student") {
    const enrolments = await StudentEnrolment.find({ userId }).select(
      "_id currentClass currentSection",
    );

    const classIds = enrolments.map((e) => e.currentClass?.toString());
    const sectionIds = enrolments.map((e) => e.currentSection?.toString());

    if (
      notice.recipients.roles?.includes("Student") ||
      (notice.recipients.classIds?.some((cid) =>
        classIds.includes(cid.toString()),
      ) &&
        notice.recipients.sectionIds?.some((sid) =>
          sectionIds.includes(sid.toString()),
        ))
    ) {
      canView = true;
    }
  }

  if (!canView)
    return res
      .status(403)
      .json(
        new apiResponse(
          403,
          null,
          "You are not authorized to view this notice",
        ),
      );

  res.status(200).json(new apiResponse(200, notice));
});

/* =========================================================
   🔹 UPDATE NOTICE
========================================================= */
const updateNotice = asyncHandler(async (req, res) => {
  const Notice = getNoticeModel(req.db);
  const Teacher = getTeacherModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Notice ID"));

  const notice = await Notice.findById(id);
  if (!notice)
    return res.status(404).json(new apiResponse(404, null, "Notice not found"));

  /* ================= ACCESS CONTROL ================= */
  const userId = req.user._id;
  const userRole = req.user.role;

  let canUpdate = false;

  if (notice.sender.id.toString() === userId.toString()) canUpdate = true;
  if (userRole === "SuperAdmin") canUpdate = true;

  if (!canUpdate)
    return res
      .status(403)
      .json(
        new apiResponse(
          403,
          null,
          "You are not authorized to update this notice",
        ),
      );

  /* ================= SENDER META ================= */
  let senderMeta = {};

  if (notice.sender.role === "Teacher") {
    const teacher = await Teacher.findOne({ userId: notice.sender.id }).select(
      "classIds",
    );
    if (!teacher)
      return res
        .status(404)
        .json(new apiResponse(404, null, "Teacher not found"));

    senderMeta.classIds = Array.isArray(teacher.classIds)
      ? teacher.classIds.map((id) => id.toString())
      : [];
  }

  /* ================= VALIDATE RECIPIENTS ================= */
  if (req.body.recipients) {
    req.body.recipients = await validateRecipients(
      notice.sender.role,
      req.body.recipients,
      senderMeta,
      req.db,
    );
  }

  /* ================= UPDATE ================= */
  const updatedNotice = await Notice.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate("sender.id", "name role")
    .populate("recipients.specificTeachers", "name")
    .populate("recipients.specificStudents", "name")
    .populate("recipients.specificAdmins", "name");

  res.status(200).json(new apiResponse(200, updatedNotice, "Notice updated"));
});

/* =========================================================
   🔹 DELETE NOTICE
========================================================= */
const deleteNotice = asyncHandler(async (req, res) => {
  const Notice = getNoticeModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid Notice ID"));

  const notice = await Notice.findById(id);
  if (!notice)
    return res.status(404).json(new apiResponse(404, null, "Notice not found"));

  /* ================= ACCESS CONTROL ================= */
  const userId = req.user._id;
  const userRole = req.user.role;

  let canDelete = false;

  if (notice.sender.id.toString() === userId.toString()) canDelete = true;
  if (userRole === "SuperAdmin") canDelete = true;

  if (!canDelete)
    return res
      .status(403)
      .json(
        new apiResponse(
          403,
          null,
          "You are not authorized to delete this notice",
        ),
      );

  await Notice.findByIdAndDelete(id);

  res.status(200).json(new apiResponse(200, notice, "Notice deleted"));
});

/* =========================================================
   🔹 MARK NOTICES AS READ
========================================================= */
const markNoticesAsRead = asyncHandler(async (req, res) => {
  const Notice = getNoticeModel(req.db);
  const userId = req.user._id;

  // noticeIds array body mein aaye, ya empty hone pe user ki saari notices mark karo
  const { noticeIds } = req.body;

  const filter = noticeIds?.length
    ? { _id: { $in: noticeIds }, readBy: { $ne: userId } }
    : { readBy: { $ne: userId } };

  await Notice.updateMany(filter, { $addToSet: { readBy: userId } });

  res.status(200).json(new apiResponse(200, null, "Marked as read"));
});

export {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
  markNoticesAsRead,
};
