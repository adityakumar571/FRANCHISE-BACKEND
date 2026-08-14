import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getConductCertificateModel } from "../../../models/tenant/master/ConductCertificate.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";

/* ═══════════════════════════════════════════════════════════════
   HELPER — build full name from enrolment
═══════════════════════════════════════════════════════════════ */
const buildFullName = (s) =>
  [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ").toUpperCase();

const pronounMap = {
  Male: "He",
  Female: "She",
  Other: "They",
};

/* ═══════════════════════════════════════════════════════════════
   1. GET STUDENTS  — search students for the picker (Step 1 UI)
      GET /api/conduct-certificates/students
      Query: search, currentClass, currentSection, session, page, limit
═══════════════════════════════════════════════════════════════ */
export const getStudentsForCertificate = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const {
    search,
    currentClass,
    currentSection,
    session,
    page = 1,
    limit = 20,
  } = req.query;

  const match = { status: "Studying" };

  if (session && mongoose.Types.ObjectId.isValid(session))
    match.session = new mongoose.Types.ObjectId(session);
  if (currentClass && mongoose.Types.ObjectId.isValid(currentClass))
    match.currentClass = new mongoose.Types.ObjectId(currentClass);
  if (currentSection && mongoose.Types.ObjectId.isValid(currentSection))
    match.currentSection = new mongoose.Types.ObjectId(currentSection);

  const pipeline = [{ $match: match }];

  if (search) {
    const regex = new RegExp(search.trim(), "i");
    pipeline.push({
      $match: {
        $or: [
          { firstName: regex },
          { lastName: regex },
          { middleName: regex },
          { studentId: regex },
          { fatherName: regex },
          { admissionClass: regex },
        ],
      },
    });
  }

  // Lookups
  pipeline.push(
    { $lookup: { from: "classes", localField: "currentClass", foreignField: "_id", as: "currentClass" } },
    { $lookup: { from: "sections", localField: "currentSection", foreignField: "_id", as: "currentSection" } },
    { $lookup: { from: "sessions", localField: "session", foreignField: "_id", as: "session" } },
    { $lookup: { from: "streams", localField: "stream", foreignField: "_id", as: "stream" } },
    { $unwind: { path: "$currentClass", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$currentSection", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$session", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$stream", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        firstName: 1,
        middleName: 1,
        lastName: 1,
        studentId: 1,
        admissionClass: 1,
        admittedDate: 1,
        fatherName: 1,
        motherName: 1,
        gender: 1,
        dob: 1,
        profilePic: 1,
        createdAt: 1,
        "currentClass._id": 1,
        "currentClass.name": 1,       // ✅ model field is "name" not "className"
        "currentSection._id": 1,
        "currentSection.name": 1,     // ✅ model field is "name" not "sectionName"
        "session._id": 1,
        "session.sessionName": 1,     // Session model actually uses "sessionName"
        "stream._id": 1,
        "stream.name": 1,             // ✅ model field is "name" not "streamName"
      },
    }
  );

  const countPipeline = [...pipeline, { $count: "count" }];
  const totalArr = await StudentEnrolment.aggregate(countPipeline);
  const total = totalArr[0]?.count || 0;

  pipeline.push(
    { $sort: { firstName: 1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) }
  );

  const students = await StudentEnrolment.aggregate(pipeline);

  return res.status(200).json(
    new apiResponse(200, { students, total, page: Number(page), limit: Number(limit) },
      "Students fetched successfully")
  );
});

/* ═══════════════════════════════════════════════════════════════
   2. GET STUDENT DETAIL — pre-fill certificate form from DB
      GET /api/conduct-certificates/students/:studentId
═══════════════════════════════════════════════════════════════ */
export const getStudentCertificateData = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const { studentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid student ID"));
  }

  // Use $lookup aggregation — reliable on dynamic tenant connections
  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(studentId) } },
    { $lookup: { from: "classes",   localField: "currentClass",   foreignField: "_id", as: "classObj"   } },
    { $lookup: { from: "sections",  localField: "currentSection", foreignField: "_id", as: "sectionObj" } },
    { $lookup: { from: "sessions",  localField: "session",        foreignField: "_id", as: "sessionObj" } },
    { $unwind: { path: "$classObj",   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$sectionObj", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$sessionObj", preserveNullAndEmptyArrays: true } },
  ];

  const results = await StudentEnrolment.aggregate(pipeline);
  const student = results[0];

  if (!student) {
    return res.status(404).json(new apiResponse(404, null, "Student not found"));
  }

  // Class/Section/Stream models use "name" field (not className/sectionName)
  const className   = student.classObj?.name   || student.admissionClass || "";
  const sectionName = student.sectionObj?.name || "";
  const sessionName = student.sessionObj?.sessionName || "";

  // ── Pull school info from tenant (available via middleware) ──
  const tenant = req.tenant || {};

  const certDefaults = {
    // ── School info (pre-filled from tenant) ──
    schoolName:      tenant.schoolName      || "",
    schoolSubtitle:  tenant.schoolSubtitle  || "",
    schoolInfo:      tenant.schoolInfo      || "",
    schoolLogo:      tenant.logo            || "",
    schoolCode:      tenant.schoolCode      || "",
    affiliationNo:   tenant.affiliationNo   || "",
    schoolPhone:     tenant.schoolContact   || tenant.phone || "",
    schoolEmail:     tenant.schoolEmail     || tenant.email || "",
    statusOfSchool:  tenant.statusOfSchool  || "Secondary/Sr. Secondary",
    estd:            tenant.estd            || (tenant.createdAt ? new Date(tenant.createdAt).getFullYear().toString() : ""),
    schoolAddressLine1: tenant.address?.line1 || tenant.schoolAddressLine1 || tenant.schoolAddress || "",
    schoolAddressLine2: tenant.address?.line2 || tenant.schoolAddressLine2 || "",
    schoolAddressLine3: tenant.address?.city  || tenant.schoolAddressLine3 || "",

    // ── Student info ──
    studentName:     buildFullName(student),
    admissionNo:     student.studentId || "",
    relation:        student.gender === "Female" ? "Daughter" : "Son",
    fatherName:      student.fatherName ? `Shri ${student.fatherName}`.toUpperCase() : "",
    motherName:      student.motherName  || "",
    gender:          pronounMap[student.gender] || "He",
    nationality:     student.nationality || "Indian",
    category:        student.category   || "",
    admittedClass:   className ? `Class ${className}` : "",
    admittedDate:    student.admittedDate
      ? new Date(student.admittedDate).toLocaleDateString("en-IN")
      : student.createdAt
        ? new Date(student.createdAt).toLocaleDateString("en-IN")
        : "",
    fromDate:        student.admittedDate
      ? new Date(student.admittedDate).toLocaleDateString("en-IN")
      : "",
    toDate:          "",
    lastExam:        "",
    conductRating:   "good",
    characterRating: "good",
    conduct:         "Good",
    profilePic:      student.profilePic || "",
    className:       className,
    section:         sectionName,
    session:         sessionName,
  };

  return res.status(200).json(
    new apiResponse(200, { student, certDefaults }, "Student data fetched successfully")
  );
});

/* ═══════════════════════════════════════════════════════════════
   3. ISSUE CERTIFICATE — save + return full cert data
      POST /api/conduct-certificates
      Body: { studentId, schoolName, refNo, issueDate, conductRating, ... }
═══════════════════════════════════════════════════════════════ */
export const issueConductCertificate = asyncHandler(async (req, res) => {
  const ConductCertificate = getConductCertificateModel(req.db);
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const {
    studentId,
    type,
    // school info
    schoolName, schoolSubtitle, schoolInfo, estd,
    affiliationNo, schoolCode, schoolPhone, schoolEmail, bookNo, slNo,
    registrationNo, renewedUpto, statusOfSchool,
    // cert ref
    refNo, tcNo, issueDate,
    // student info
    studentName, admissionNo, category,
    relation, fatherName, motherName,
    dateOfBirth, dateOfBirthInWords,
    nationality, gender, scheduleCasteTribe,
    admittedClass, admittedDate,
    currentClass, className, section, rollNo,
    classInWords, leavingDate, dateStruck,
    subjectStudied, reasonForLeaving,
    feesPaidUpTo, feeConcession, anyDues,
    failedTimes, promotedClass, promotedClassInWords,
    totalWorkingDays, totalPresent,
    nccScoutGuide, whetherGovt, extraCurricular,
    boardExamResult,
    fromDate, toDate, lastExam,
    // conduct
    conductRating, characterRating,
    behaviour, academicPerformance, extracurricular,
    // signatory / school address
    principalName, principalDesignation,
    schoolAddressLine1, schoolAddressLine2, schoolAddressLine3,
    remarks,
    // form-level aliases (frontend may send these)
    conduct, lastExamAppeared, lastExamResult,
    feesStatus, dateOfAdmission, dateOfLeaving, reasonOfLeaving,
  } = req.body;

  // Validate required fields
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json(new apiResponse(400, null, "Valid studentId is required"));
  }
  if (!studentName) {
    return res.status(400).json(new apiResponse(400, null, "studentName is required"));
  }

  // Verify student exists in this tenant
  const studentExists = await StudentEnrolment.findById(studentId);
  if (!studentExists) {
    return res.status(404).json(new apiResponse(404, null, "Student not found"));
  }

  // ── Auto-increment serialNo (safe for multi-tenant dynamic connections) ──
  const lastCert = await ConductCertificate.findOne(
    {},
    { serialNo: 1 },
    { sort: { serialNo: -1 } }
  );
  const nextSerial = lastCert?.serialNo ? lastCert.serialNo + 1 : 1;

  const certificate = await ConductCertificate.create({
    serialNo: nextSerial,
    type: type || "character",
    studentId,
    // school snapshot
    schoolName, schoolSubtitle, schoolInfo, estd,
    affiliationNo, schoolCode, schoolPhone, schoolEmail, bookNo, slNo,
    registrationNo, renewedUpto,
    statusOfSchool: statusOfSchool || "Secondary/Sr. Secondary",
    refNo: type === "transfer" ? (tcNo || refNo) : refNo,
    issueDate: issueDate ? new Date(issueDate) : new Date(),
    // student snapshot
    studentName: studentName.toUpperCase(),
    admissionNo, category,
    relation: relation || (gender === "She" ? "Daughter" : "Son"),
    fatherName, motherName,
    dateOfBirth,
    dateOfBirthInWords,
    nationality: nationality || "Indian",
    gender,
    scheduleCasteTribe,
    admittedClass, admittedDate: admittedDate || dateOfAdmission,
    currentClass, className, section, rollNo,
    classInWords,
    leavingDate: leavingDate || dateOfLeaving,
    dateStruck,
    subjectStudied,
    reasonForLeaving: reasonForLeaving || reasonOfLeaving,
    feesPaidUpTo, feeConcession, anyDues,
    failedTimes,
    promotedClass, promotedClassInWords,
    totalWorkingDays, totalPresent,
    nccScoutGuide, whetherGovt,
    extraCurricular: extraCurricular || extracurricular,
    boardExamResult: boardExamResult || lastExamResult,
    fromDate, toDate,
    lastExam: lastExam || lastExamAppeared,
    conductRating: conductRating || conduct || "good",
    characterRating: characterRating || conduct || "good",
    behaviour, academicPerformance,
    principalName, principalDesignation,
    schoolAddressLine1, schoolAddressLine2, schoolAddressLine3,
    remarks,
    issuedBy: req.user?._id || null,
  });

  return res.status(201).json(
    new apiResponse(201, certificate, `Certificate issued successfully (Serial No: ${certificate.serialNo})`)
  );
});

/* ═══════════════════════════════════════════════════════════════
   4. GET ALL CERTIFICATES — with filters & pagination
      GET /api/conduct-certificates
      Query: search, studentId, status, fromDate, toDate, page, limit
═══════════════════════════════════════════════════════════════ */
export const getAllConductCertificates = asyncHandler(async (req, res) => {
  const ConductCertificate = getConductCertificateModel(req.db);

  const {
    search,
    studentId,
    status,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
    isPagination = "true",
  } = req.query;

  const match = {};

  if (status) match.status = status;
  if (studentId && mongoose.Types.ObjectId.isValid(studentId))
    match.studentId = new mongoose.Types.ObjectId(studentId);

  if (fromDate || toDate) {
    match.issueDate = {};
    if (fromDate) match.issueDate.$gte = new Date(fromDate);
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      match.issueDate.$lte = to;
    }
  }

  const pipeline = [{ $match: match }];

  if (search) {
    const regex = new RegExp(search.trim(), "i");
    pipeline.push({
      $match: {
        $or: [
          { studentName: regex },
          { admissionNo: regex },
          { fatherName: regex },
          { refNo: regex },
          { serialNo: isNaN(search) ? undefined : Number(search) },
        ].filter(Boolean),
      },
    });
  }

  // Lookup student snapshot
  pipeline.push(
    {
      $lookup: {
        from: "studentenrolments",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } }
  );

  // Count
  const totalArr = await ConductCertificate.aggregate([...pipeline, { $count: "count" }]);
  const total = totalArr[0]?.count || 0;

  pipeline.push({ $sort: { createdAt: -1 } });

  if (isPagination === "true") {
    pipeline.push(
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) }
    );
  }

  const certificates = await ConductCertificate.aggregate(pipeline);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        certificates,
        total,
        totalPages: isPagination === "true" ? Math.ceil(total / Number(limit)) : 1,
        currentPage: Number(page),
      },
      "Certificates fetched successfully"
    )
  );
});

/* ═══════════════════════════════════════════════════════════════
   5. GET SINGLE CERTIFICATE by ID
      GET /api/conduct-certificates/:id
═══════════════════════════════════════════════════════════════ */
export const getConductCertificateById = asyncHandler(async (req, res) => {
  const ConductCertificate = getConductCertificateModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid certificate ID"));
  }

  const cert = await ConductCertificate.findById(id).populate(
    "studentId",
    "firstName lastName studentId currentClass currentSection"
  );

  if (!cert) {
    return res.status(404).json(new apiResponse(404, null, "Certificate not found"));
  }

  return res.status(200).json(new apiResponse(200, cert, "Certificate fetched successfully"));
});

/* ═══════════════════════════════════════════════════════════════
   6. GET CERTIFICATES BY STUDENT
      GET /api/conduct-certificates/by-student/:studentId
═══════════════════════════════════════════════════════════════ */
export const getCertificatesByStudent = asyncHandler(async (req, res) => {
  const ConductCertificate = getConductCertificateModel(req.db);

  const { studentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid student ID"));
  }

  const certs = await ConductCertificate.find({ studentId })
    .sort({ createdAt: -1 });

  return res.status(200).json(
    new apiResponse(200, { certificates: certs, total: certs.length }, "Certificates fetched")
  );
});

/* ═══════════════════════════════════════════════════════════════
   7. UPDATE CERTIFICATE (edit before print / re-issue)
      PUT /api/conduct-certificates/:id
═══════════════════════════════════════════════════════════════ */
export const updateConductCertificate = asyncHandler(async (req, res) => {
  const ConductCertificate = getConductCertificateModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid certificate ID"));
  }

  // Prevent changing the core studentId reference
  delete req.body.studentId;
  delete req.body.serialNo;

  const updated = await ConductCertificate.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    return res.status(404).json(new apiResponse(404, null, "Certificate not found"));
  }

  return res.status(200).json(new apiResponse(200, updated, "Certificate updated successfully"));
});

/* ═══════════════════════════════════════════════════════════════
   8. CANCEL CERTIFICATE
      PATCH /api/conduct-certificates/:id/cancel
═══════════════════════════════════════════════════════════════ */
export const cancelConductCertificate = asyncHandler(async (req, res) => {
  const ConductCertificate = getConductCertificateModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid certificate ID"));
  }

  const cert = await ConductCertificate.findById(id);
  if (!cert) {
    return res.status(404).json(new apiResponse(404, null, "Certificate not found"));
  }

  if (cert.status === "cancelled") {
    return res.status(400).json(new apiResponse(400, null, "Certificate already cancelled"));
  }

  cert.status = "cancelled";
  await cert.save();

  return res.status(200).json(new apiResponse(200, cert, "Certificate cancelled successfully"));
});

/* ═══════════════════════════════════════════════════════════════
   9. DELETE CERTIFICATE (hard delete — admin only)
      DELETE /api/conduct-certificates/:id
═══════════════════════════════════════════════════════════════ */
export const deleteConductCertificate = asyncHandler(async (req, res) => {
  const ConductCertificate = getConductCertificateModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid certificate ID"));
  }

  const deleted = await ConductCertificate.findByIdAndDelete(id);

  if (!deleted) {
    return res.status(404).json(new apiResponse(404, null, "Certificate not found"));
  }

  return res.status(200).json(new apiResponse(200, null, "Certificate deleted successfully"));
});
