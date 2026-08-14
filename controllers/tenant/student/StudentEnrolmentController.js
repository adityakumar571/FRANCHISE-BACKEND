
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getStudentRegistrationModel } from "../../../models/tenant/student/StudentRegistration.model.js";
import { getUserModel } from "../../../models/tenant/user.model.js";
import { sendCredentialsEmail } from "../../../utils/sendCredentialsEmail.js";

import mongoose from "mongoose";
import {
  generateTransportFees,
  removeTransportFees,
  deleteUnpaidTransportFees,
} from "../../../utils/transportFeeHelper.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import TenantSubscription from "../../../models/TenantSubscription.modal.js";
import { incrementStudentCount, decrementStudentLimit } from "../../../middleware/checkStudentLimit.js";


const generateStudentId = async (db) => {
  const StudentEnrolment = getStudentEnrolmentModel(db);
  let isUnique = false;
  let studentId;

  while (!isUnique) {
    const random = Math.floor(1000 + Math.random() * 9000);
    studentId = `S-${random}`;

    const exists = await StudentEnrolment.findOne({ studentId });
    if (!exists) isUnique = true;
  }

  return studentId;
};

const createStudentEnrolment = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const StudentRegistration = getStudentRegistrationModel(req.db);
  const User = getUserModel(req.db);
  try {

    const {
      studentRegistrationId,
      phone,
      // studentId,
      session,
      firstName,
      income,
      handicapped,
      admissionClass,
      middleName,
      lastName,
      dob,
      gender,
      category,
      religion,
      caste,
      fatherName,
      motherName,
      fatherOccupation,
      motherOccupation,
      studentAdhaarNumber,
      fatherAdhaarNumber,
      motherAdhaarNumber,
      transportRequired,
      transportStoppage,
      guardianName,
      guardianRelation,
      guardianPhone,
      address,
      schoolName,
      medium,
      previousStream,
      previousMedium,
      currentClass,
      currentSection,
      stream,
      remark,
      sibling,
      documents,
      transportWay,
      busNo,
      stationName,
      busFee,
      routeId,
      stopId,
      transportType,
      transportAmount,
      discount,
      discountType,
      profilePic,
      fatherPic,
      motherPic,
      penNo,
      aparId,
      srRegisterNumber,
    } = req.body;

    /* VALIDATION */
    if (!phone) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Phone is required"));
    }

    if (
      !studentRegistrationId ||
      !mongoose.Types.ObjectId.isValid(studentRegistrationId)
    ) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            "Valid Student Registration ID is required",
          ),
        );
    }

    const registration = await StudentRegistration.findById(
      studentRegistrationId,
    );

    if (!registration) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Student registration not found"));
    }

    if (registration.isEnroll) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Student already enrolled"));
    }

    // const studentId = await generateStudentId();

    let studentId = req.body.studentId;

    if (studentId) {
      //  frontend se aaya → unique check
      const exists = await StudentEnrolment.findOne({ studentId });

      if (exists) {
        return res
          .status(400)
          .json(new apiResponse(400, null, "Student ID already exists"));
      }
    } else {
      //  nahi aaya → auto generate
      // studentId = await generateStudentId();
      studentId = await generateStudentId(req.db);
    }

    const password = `${(firstName || "stu").toLowerCase()}@123`;

    const user = await User.create({
      phone,
      profilePic,
      userId: studentId,
      name: `${firstName || ""} ${lastName || ""}`.trim(),
      role: "Student",
      password,
    });

    // if (!user) {
    // }

    /* 🔥 GENERATE STUDENT ID HERE */

    /* CREATE ENROLMENT */
    const enrolment = await StudentEnrolment.create({
      userId: user._id,
      studentRegistrationId,
      studentId,
      phone,
      profilePic,
      fatherPic,
      motherPic,
      penNo,
      aparId,
      srRegisterNumber,
      session,
      firstName,
      income,
      handicapped,
      middleName,
      admissionClass,
      lastName,
      dob,
      gender,
      category,
      religion,
      caste,
      fatherName,
      motherName,
      fatherOccupation,
      motherOccupation,
      studentAdhaarNumber,
      fatherAdhaarNumber,
      motherAdhaarNumber,
      transportRequired,
      transportStoppage,
      guardianName,
      guardianRelation,
      guardianPhone,
      address,
      schoolName,
      medium,
      previousStream,
      previousMedium,
      currentClass,
      currentSection,
      stream,
      remark,
      sibling,
      documents,
      transportWay,
      busNo,
      stationName,
      busFee,
      routeId: routeId || null,
      stopId: stopId || null,
      transportType: transportType || "",
      transportAmount: transportAmount || 0,
      transportEnrollmentDate:
        transportRequired === "YES" && routeId ? new Date() : null,
      discount,
      discountType,
      formNo: req.body.formNo || registration.formNo || "",
    });

    registration.studentEnrolmentId = enrolment._id;
    registration.isEnroll = true;
    await registration.save();

    // ── Increment usedStudents AFTER successful enrollment save ──
    // Uses atomic $lt guard — safe against concurrent requests
    if (req.subscriptionLimitInfo?.subscriptionId) {
      await incrementStudentCount(
        req.subscriptionLimitInfo.subscriptionId,
        req.subscriptionLimitInfo.limit
      );
    }

    // Auto-generate monthly transport fees if transport assigned
    if (transportRequired === "YES" && routeId && stopId) {
      await generateTransportFees({
        db: req.db,
        studentId: enrolment._id,
        sessionId: session,
        routeId,
        stopId,
        transportType,
        amount: transportAmount || undefined,
        enrollmentDate:
          enrolment.transportEnrollmentDate || enrolment.createdAt,
      }).catch((err) => console.error("Transport fee generation failed:", err));
    }

    // ── Send credentials email ──
    const studentEmail =
      req.body.email ||
      address?.present?.Email ||
      address?.permanent?.Email ||
      null;

    console.log("📧 Student email:", studentEmail || "NOT FOUND — email skipped");
    console.log("📧 studentId:", studentId, "| password:", password);

    if (studentEmail) {
      sendCredentialsEmail({
        to:         studentEmail,
        name:       `${firstName || ""} ${lastName || ""}`.trim(),
        role:       "Student",
        userId:     studentId,
        password,
        schoolName: req.tenant?.schoolName || "School",
        subdomain:  req.tenant?.subdomain  || "",
        extra:      "",
      }).catch((err) => console.error("❌ Student email error:", err.message));
    }

    return res.status(201).json(
      new apiResponse(
        201,
        {
          enrolment,
          credentials: {
            phone: user.phone,
            password: user.password,
          },
        },
        "Student enrolment completed successfully",
      ),
    );
  } catch (error) {
    console.error("Create Enrolment Error:", error);
    return res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET ALL STUDENT ENROLMENTS ================= */

const getAllStudentEnrolments = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const StudentRegistration = getStudentRegistrationModel(req.db);
  try {
    const {
      isPagination = "true",
      page = 1,
      limit = 10,
      search,
      session,
      gender,
      dob,
      caste,
      religion,
      category,
      currentClass,
      currentSection,
      stream,
      status,
      resultStatus,
      sortBy = "recent",
    } = req.query;

    const match = {};

    // ================= FILTERS =================
    if (session && mongoose.Types.ObjectId.isValid(session))
      match.session = new mongoose.Types.ObjectId(session);
    if (currentClass && mongoose.Types.ObjectId.isValid(currentClass))
      match.currentClass = new mongoose.Types.ObjectId(currentClass);
    if (currentSection && mongoose.Types.ObjectId.isValid(currentSection))
      match.currentSection = new mongoose.Types.ObjectId(currentSection);
    if (stream && mongoose.Types.ObjectId.isValid(stream))
      match.stream = new mongoose.Types.ObjectId(stream);
    if (caste) match.caste = caste;
    if (religion) match.religion = religion;
    if (category) match.category = category;
    if (gender) match.gender = gender;
    if (status) match.status = status;
    if (resultStatus) match.resultStatus = resultStatus;

    const pipeline = [{ $match: match }];

    if (dob) {
      const input = new Date(dob); // yyyy-mm-dd

      const start = new Date(input);
      start.setUTCHours(0, 0, 0, 0);

      const end = new Date(input);
      end.setUTCHours(23, 59, 59, 999);

      pipeline.push({
        $match: {
          dob: { $gte: start, $lte: end },
        },
      });
    }

    // ================= SEARCH =================
    if (search) {
      const regex = new RegExp(search.trim(), "i");
      pipeline.push({
        $match: {
          $or: [
            { firstName: regex },
            { middleName: regex },
            { lastName: regex },
            { phone: regex },
            { studentId: regex },
            { srNumber: regex },
            { rollNumber: regex },
            { formNo: regex },
            { fatherName: regex },
            { motherName: regex },
          ],
        },
      });
    }

    // ================= SORT =================
    const sortMap = {
      recent:     { createdAt: -1 },
      oldest:     { createdAt: 1 },
      rollNumber: { rollNumber: 1 },
    };

    if (sortBy === 'rollNumber') {
      // rollNumber can be stored as string — convert to int for correct numeric sort
      pipeline.push({
        $addFields: {
          rollNumberInt: { $toInt: '$rollNumber' },
        },
      });
      pipeline.push({ $sort: { rollNumberInt: 1 } });
    } else {
      pipeline.push({ $sort: sortMap[sortBy] || { createdAt: -1 } });
    }

    // ================= TOTAL COUNT =================
    const totalArr = await StudentEnrolment.aggregate([
      ...pipeline,
      { $count: "count" },
    ]);
    const totalStudents = totalArr[0]?.count || 0;

    // ================= PAGINATION =================
    if (isPagination === "true") {
      pipeline.push(
        { $skip: (Number(page) - 1) * Number(limit) },
        { $limit: Number(limit) },
      );
    }

    // ================= POPULATES =================
    const lookups = [
      {
        from: "sessions",
        localField: "session",
        foreignField: "_id",
        as: "session",
      },
      {
        from: "classes",
        localField: "currentClass",
        foreignField: "_id",
        as: "currentClass",
      },
      {
        from: "sections",
        localField: "currentSection",
        foreignField: "_id",
        as: "currentSection",
      },
      {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "userId",
      },

      // 🔥 FIXED STREAM LOOKUP
      {
        from: "streams",
        localField: "stream",
        foreignField: "_id",
        as: "stream",
      },

      {
        from: "studentenrolments",
        localField: "sibling.siblingStudentId",
        foreignField: "_id",
        as: "siblingStudents",
      },
      {
        from: "classes",
        localField: "sibling.class",
        foreignField: "_id",
        as: "siblingClasses",
      },
      {
        from: "sections",
        localField: "sibling.section",
        foreignField: "_id",
        as: "siblingSections",
      },
      {
        from: "documents",
        localField: "documents.documentId",
        foreignField: "_id",
        as: "documentsData",
      },
      {
        from: StudentRegistration.collection.name,
        localField: "studentRegistrationId",
        foreignField: "_id",
        as: "studentRegistrationId",
      },
    ];

    lookups.forEach((lu) => {
      pipeline.push({ $lookup: lu });
    });

    // Unwind single object lookups
    [
      "session",
      "currentClass",
      "currentSection",
      "stream",
      "userId",
      "studentRegistrationId",
    ].forEach((field) => {
      pipeline.push({
        $unwind: { path: `$${field}`, preserveNullAndEmptyArrays: true },
      });
    });

    // Map siblings with full data
    pipeline.push({
      $addFields: {
        sibling: {
          $map: {
            input: "$sibling",
            as: "sib",
            in: {
              siblingStudentId: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$siblingStudents",
                      as: "stu",
                      cond: { $eq: ["$$stu._id", "$$sib.siblingStudentId"] },
                    },
                  },
                  0,
                ],
              },
              class: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$siblingClasses",
                      as: "cls",
                      cond: { $eq: ["$$cls._id", "$$sib.class"] },
                    },
                  },
                  0,
                ],
              },
              section: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$siblingSections",
                      as: "sec",
                      cond: { $eq: ["$$sec._id", "$$sib.section"] },
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      },
    });

    // Map documents with full data
    pipeline.push({
      $addFields: {
        documents: {
          $map: {
            input: "$documents",
            as: "doc",
            in: {
              documentId: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$documentsData",
                      as: "d",
                      cond: { $eq: ["$$d._id", "$$doc.documentId"] },
                    },
                  },
                  0,
                ],
              },
              documentNumber: "$$doc.documentNumber",
              document: "$$doc.document",
              verified: "$$doc.verified",
            },
          },
        },
      },
    });

    pipeline.push({
      $project: {
        siblingStudents: 0,
        siblingClasses: 0,
        siblingSections: 0,
        documentsData: 0,
      },
    });
    // .populate("studentRegistrationId")

    // ================= FINAL DATA =================
    const students = await StudentEnrolment.aggregate(pipeline);

    res.status(200).json(
      new apiResponse(
        200,
        {
          students,
          totalStudents,
          totalPages: Math.ceil(totalStudents / limit),
          currentPage: Number(page),
        },
        "Student enrolments fetched successfully",
      ),
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET SINGLE STUDENT ENROLMENT ================= */
const getStudentEnrolmentById = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid enrolment ID"));
    }

    const student = await StudentEnrolment.findById(req.params.id)
      .populate("userId", "name phone role userId gender password")
      .populate("studentRegistrationId")
      .populate("currentClass")
      .populate("stream")
      .populate("session")
      .populate("currentSection")
      .populate("sibling.siblingStudentId")
      .populate("sibling.class")
      .populate("sibling.section")
      .populate("documents.documentId")
      .populate("routeId", "routeName routeCode startLocation endLocation")
      .populate("stopId", "stopName stopOrder feeAmount pickupTime dropTime");

    if (!student) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Student not found"));
    }

    res
      .status(200)
      .json(
        new apiResponse(200, student, "Student enrolment fetched successfully"),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, `Error: ${error.message}`));
  }
});

/* ================= UPDATE STUDENT ENROLMENT ================= */
const updateStudentEnrolment = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid enrolment ID"));
    }
    // delete req.body.studentId

    const updatedStudent = await StudentEnrolment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    if (!updatedStudent) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Student not found"));
    }

    // If transport is being assigned for the first time, set transportEnrollmentDate
    const {
      transportRequired,
      routeId,
      stopId,
      transportType,
      transportAmount,
      session,
    } = req.body;

    // Determine sessionId — from body or from existing record
    const sessionId =
      session || updatedStudent.session?.toString() || updatedStudent.session;

    if (
      transportRequired === "YES" &&
      routeId &&
      !updatedStudent.transportEnrollmentDate
    ) {
      await StudentEnrolment.findByIdAndUpdate(req.params.id, {
        transportEnrollmentDate: new Date(),
      });
      updatedStudent.transportEnrollmentDate = new Date();
    }

    if (transportRequired === "YES" && routeId && stopId && sessionId) {
      const enrollmentDate =
        req.body.transportEnrollmentDate ||
        updatedStudent.transportEnrollmentDate ||
        updatedStudent.createdAt;

      await generateTransportFees({
        db: req.db,
        studentId: req.params.id,
        sessionId,
        routeId,
        stopId,
        transportType,
        amount: transportAmount ? Number(transportAmount) : undefined,
        enrollmentDate,
      }).catch((err) => console.error("Transport fee update failed:", err));
    } else if (transportRequired === "NO" && sessionId) {
      await removeTransportFees({ db: req.db, studentId: req.params.id, sessionId }).catch(
        (err) => console.error("Transport fee removal failed:", err),
      );
    }

    res
      .status(200)
      .json(
        new apiResponse(
          200,
          updatedStudent,
          "Student enrolment updated successfully",
        ),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, `Error: ${error.message}`));
  }
});

/* ================= DELETE STUDENT ENROLMENT ================= */
const deleteStudentEnrolment = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid enrolment ID"));
    }

    const deletedStudent = await StudentEnrolment.findByIdAndDelete(
      req.params.id,
    );

    if (!deletedStudent) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Student not found"));
    }

    // Cascade: delete unpaid transport fees for this student
    await deleteUnpaidTransportFees({ db: req.db, studentId: req.params.id }).catch((err) =>
      console.error("Transport fee cascade delete failed:", err),
    );

    // ── Decrement usedStudents atomically via helper ──
    if (req.tenant?._id) {
      await decrementStudentLimit(req.tenant._id);
    }

    res
      .status(200)
      .json(
        new apiResponse(
          200,
          deletedStudent,
          "Student enrolment deleted successfully",
        ),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, `Error: ${error.message}`));
  }
});

const assignRollNumbersByName = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { session, currentClass, currentSection, stream } = req.body;

  /* ---------- VALIDATION ---------- */
  if (
    !mongoose.Types.ObjectId.isValid(session) ||
    !mongoose.Types.ObjectId.isValid(currentClass) ||
    !mongoose.Types.ObjectId.isValid(currentSection)
  ) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid session / class / section"));
  }

  console.log(
    "session, currentClass, currentSection, stream",
    session,
    currentClass,
    currentSection,
    stream,
  );
  /* ---------- FETCH STUDENTS ---------- */
  const students = await StudentEnrolment.find({
    session,
    currentClass,
    currentSection,
    stream,
    status: "Studying",
  }).sort({ firstName: 1 }); // 🔥 ASCENDING ORDER
  // const students = {
  //   session,
  //   currentClass,
  //   currentSection,
  //   status: "Studying",
  // };

  // if (stream) {
  //   filter.stream = stream;
  // }

  // await StudentEnrolment.find(filter);

  if (!students.length) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "No students found"));
  }

  /* ---------- ASSIGN ROLL NUMBERS ---------- */
  const bulkOps = students.map((student, index) => ({
    updateOne: {
      filter: { _id: student._id },
      update: { $set: { rollNumber: index + 1 } },
    },
  }));

  await StudentEnrolment.bulkWrite(bulkOps);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        totalStudents: students.length,
        session,
        currentClass,
        currentSection,
        stream: stream || null,
      },
      "Roll numbers assigned successfully (firstName ascending)",
    ),
  );
});

const assignBulkManualRollNumbers12 = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { session, currentClass, currentSection, stream, students } = req.body;

  /* ---------- BASIC VALIDATION ---------- */
  if (
    !mongoose.Types.ObjectId.isValid(session) ||
    !mongoose.Types.ObjectId.isValid(currentClass) ||
    !mongoose.Types.ObjectId.isValid(currentSection) ||
    (stream && !mongoose.Types.ObjectId.isValid(stream))
  ) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid session/class/section"));
  }

  if (!Array.isArray(students) || students.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Students array is required"));
  }

  /* ---------- DUPLICATE ROLL CHECK (REQUEST LEVEL) ---------- */
  const rollSet = new Set();
  for (const s of students) {
    if (!s.rollNumber || Number(s.rollNumber) <= 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid roll number found"));
    }

    if (rollSet.has(s.rollNumber)) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            `Duplicate roll number ${s.rollNumber} in request`,
          ),
        );
    }
    rollSet.add(s.rollNumber);
  }

  /* ---------- FETCH STUDENTS FROM DB ---------- */
  const studentIds = students.map((s) => s.studentId);

  const dbStudents = await StudentEnrolment.find({
    _id: { $in: studentIds },
    session,
    currentClass,
    currentSection,
    stream,
  });

  if (dbStudents.length !== students.length) {
    return res
      .status(404)
      .json(
        new apiResponse(
          404,
          null,
          "Some students not found in given class/section/session",
        ),
      );
  }

  /* ---------- DB DUPLICATE CHECK ---------- */
  const rollNumbers = students.map((s) => s.rollNumber);

  const alreadyAssigned = await StudentEnrolment.find({
    session,
    currentClass,
    currentSection,
    stream,
    rollNumber: { $in: rollNumbers },
    _id: { $nin: studentIds },
  });

  if (alreadyAssigned.length > 0) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          `Roll number already exists: ${alreadyAssigned
            .map((s) => s.rollNumber)
            .join(", ")}`,
        ),
      );
  }

  /* ---------- BULK UPDATE ---------- */
  const bulkOps = students.map((s) => ({
    updateOne: {
      filter: {
        _id: s.studentId,
        session,
        currentClass,
        currentSection,
        stream,
      },
      update: {
        $set: { rollNumber: s.rollNumber },
      },
    },
  }));

  await StudentEnrolment.bulkWrite(bulkOps);

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        null,
        "Roll numbers assigned successfully to entire class",
      ),
    );
});
const assignBulkManualRollNumbers = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { session, currentClass, currentSection, stream, students } = req.body;

  /* ---------- BASIC VALIDATION ---------- */
  if (
    !mongoose.Types.ObjectId.isValid(session) ||
    !mongoose.Types.ObjectId.isValid(currentClass) ||
    !mongoose.Types.ObjectId.isValid(currentSection) ||
    (stream && !mongoose.Types.ObjectId.isValid(stream))
  ) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid session/class/section"));
  }

  if (!Array.isArray(students) || students.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Students array is required"));
  }

  /* ---------- REQUEST LEVEL DUPLICATE CHECK ---------- */
  const rollSet = new Set();

  for (const s of students) {
    if (!s.rollNumber || Number(s.rollNumber) <= 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid roll number found"));
    }

    if (rollSet.has(s.rollNumber)) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            `Duplicate roll number ${s.rollNumber} in request`,
          ),
        );
    }

    rollSet.add(s.rollNumber);
  }

  /* ---------- BASE QUERY (STREAM OPTIONAL) ---------- */
  const baseQuery = {
    session,
    currentClass,
    currentSection,
  };

  if (stream) {
    baseQuery.stream = stream;
  }

  /* ---------- FETCH STUDENTS FROM DB ---------- */
  const studentIds = students.map((s) => s.studentId);

  const dbStudents = await StudentEnrolment.find({
    _id: { $in: studentIds },
    ...baseQuery,
  });

  if (dbStudents.length !== students.length) {
    return res
      .status(404)
      .json(
        new apiResponse(
          404,
          null,
          "Some students not found in given class/section/session",
        ),
      );
  }

  /* ---------- DB LEVEL DUPLICATE CHECK ---------- */
  const rollNumbers = students.map((s) => s.rollNumber);

  const alreadyAssigned = await StudentEnrolment.find({
    ...baseQuery,
    rollNumber: { $in: rollNumbers },
    _id: { $nin: studentIds },
  });

  if (alreadyAssigned.length > 0) {
    return res
      .status(400)
      .json(
        new apiResponse(
          400,
          null,
          `Roll number already exists: ${alreadyAssigned
            .map((s) => s.rollNumber)
            .join(", ")}`,
        ),
      );
  }

  /* ---------- BULK UPDATE ---------- */
  const bulkOps = students.map((s) => ({
    updateOne: {
      filter: {
        _id: s.studentId,
        ...baseQuery,
      },
      update: {
        $set: { rollNumber: s.rollNumber },
      },
    },
  }));

  await StudentEnrolment.bulkWrite(bulkOps);

  /* ---------- SUCCESS RESPONSE ---------- */
  return res.status(200).json(
    new apiResponse(
      200,
      {
        session,
        currentClass,
        currentSection,
        stream: stream || null,
        totalUpdated: students.length,
      },
      "Roll numbers assigned successfully to entire class",
    ),
  );
});

// student transfer

const bulkStudentTransfer12 = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const { studentIds, targetSession, targetClass, targetSection, remark } =
    req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Student list required"));
  }

  if (!mongoose.Types.ObjectId.isValid(targetSession)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid session"));
  }

  const students = await StudentEnrolment.find({
    _id: { $in: studentIds },
    status: "Studying",
  });

  if (!students.length) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "No eligible students found"));
  }

  let transferred = 0;
  let skipped = [];

  const bulkOps = students
    .map((student) => {
      const update = {
        session: targetSession,
        remark: remark || "",
      };

      if (student.resultStatus === "Pass") {
        update.currentClass = targetClass;
        if (targetSection) update.currentSection = targetSection;
      }

      if (student.resultStatus === "Fail") {
        // class same rahegi
        update.currentClass = student.currentClass;
      }

      if (!["Pass", "Fail"].includes(student.resultStatus)) {
        skipped.push({
          studentId: student._id,
          reason: "Result not declared",
        });
        return null;
      }

      transferred++;

      return {
        updateOne: {
          filter: { _id: student._id },
          update: { $set: update },
        },
      };
    })
    .filter(Boolean);

  if (bulkOps.length) {
    await StudentEnrolment.bulkWrite(bulkOps);
  }

  res.status(200).json(
    new apiResponse(
      200,
      {
        transferred,
        skipped,
      },
      "Students transferred successfully",
    ),
  );
});

const bulkStudentTransfer = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);
  const {
    studentIds,
    targetSession,
    targetClass,
    targetSection,
    stream,
    remark,
  } = req.body;

  // ================= VALIDATIONS =================
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Student list required"));
  }

  if (!mongoose.Types.ObjectId.isValid(targetSession)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid target session"));
  }

  if (targetClass && !mongoose.Types.ObjectId.isValid(targetClass)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid target class"));
  }

  if (targetSection && !mongoose.Types.ObjectId.isValid(targetSection)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid target section"));
  }

  // ================= FETCH STUDENTS =================
  const students = await StudentEnrolment.find({
    _id: { $in: studentIds },
    status: "Studying",
  });

  if (!students.length) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "No eligible students found"));
  }

  let transferred = 0;
  const skipped = [];

  // ================= BULK OPERATIONS =================
  const bulkOps = students
    .map((student) => {
      // 🚫 SAME SESSION VALIDATION
      if (student.session?.toString() === targetSession.toString()) {
        skipped.push({
          studentId: student._id,
          reason: "Student already in target session",
        });
        return null;
      }

      // 🚫 RESULT NOT DECLARED
      if (!["Pass", "Fail"].includes(student.resultStatus)) {
        skipped.push({
          studentId: student._id,
          reason: "Result not declared",
        });
        return null;
      }

      const update = {
        session: new mongoose.Types.ObjectId(targetSession),
        remark: remark || "",
      };

      // ✅ PASSED STUDENTS → PROMOTE
      if (student.resultStatus === "Pass") {
        update.currentClass = new mongoose.Types.ObjectId(targetClass);
        if (targetSection) {
          update.currentSection = new mongoose.Types.ObjectId(targetSection);
        }
      }

      // ❌ FAILED STUDENTS → SAME CLASS
      if (student.resultStatus === "Fail") {
        update.currentClass = student.currentClass;
        update.currentSection = student.currentSection;
      }

      transferred++;

      return {
        updateOne: {
          filter: { _id: student._id },
          update: { $set: update },
        },
      };
    })
    .filter(Boolean);

  // ================= EXECUTE BULK =================
  if (bulkOps.length) {
    await StudentEnrolment.bulkWrite(bulkOps);
  }

  // ================= RESPONSE =================
  return res.status(200).json(
    new apiResponse(
      200,
      {
        transferred,
        skipped,
      },
      "Students transferred successfully",
    ),
  );
});

export {
  createStudentEnrolment,
  getAllStudentEnrolments,
  getStudentEnrolmentById,
  updateStudentEnrolment,
  deleteStudentEnrolment,
  bulkStudentTransfer,
  assignRollNumbersByName,
  assignBulkManualRollNumbers,
};
