import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { getCertificateModel } from "../../../models/tenant/master/Certificate.model.js";
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";

/* ═══════════════════════════════════════════
   Helper — next serial number
═══════════════════════════════════════════ */
const nextSerial = async (Model) => {
  const last = await Model.findOne({}, { serialNo: 1 }, { sort: { serialNo: -1 } });
  return last?.serialNo ? last.serialNo + 1 : 1;
};

/* ═══════════════════════════════════════════
   0a. SEARCH STUDENTS  (for picker)
   GET /api/certificates/students?search=&currentClass=&currentSection=&stream=&page=&limit=
═══════════════════════════════════════════ */
export const searchStudentsForCert = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  const { search, currentClass, currentSection, stream, page = 1, limit = 20 } = req.query;

  const match = { status: "Studying" };
  if (currentClass && mongoose.Types.ObjectId.isValid(currentClass))
    match.currentClass = new mongoose.Types.ObjectId(currentClass);
  if (currentSection && mongoose.Types.ObjectId.isValid(currentSection))
    match.currentSection = new mongoose.Types.ObjectId(currentSection);
  if (stream && mongoose.Types.ObjectId.isValid(stream))
    match.stream = new mongoose.Types.ObjectId(stream);

  const pipeline = [{ $match: match }];

  if (search) {
    const regex = new RegExp(search.trim(), "i");
    pipeline.push({
      $match: {
        $or: [
          { firstName: regex }, { lastName: regex }, { middleName: regex },
          { studentId: regex }, { fatherName: regex }, { motherName: regex },
        ],
      },
    });
  }

  pipeline.push(
    { $lookup: { from: "classes",   localField: "currentClass",   foreignField: "_id", as: "currentClass"   } },
    { $lookup: { from: "sections",  localField: "currentSection", foreignField: "_id", as: "currentSection" } },
    { $lookup: { from: "streams",   localField: "stream",         foreignField: "_id", as: "stream"         } },
    { $unwind: { path: "$currentClass",   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$currentSection", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$stream",         preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, firstName: 1, middleName: 1, lastName: 1,
        studentId: 1, fatherName: 1, motherName: 1,
        dob: 1, gender: 1, profilePic: 1,
        rollNumber: 1, admissionClass: 1, admittedDate: 1,
        "currentClass._id": 1, "currentClass.name": 1,
        "currentSection._id": 1, "currentSection.name": 1,
        "stream._id": 1, "stream.name": 1,
      },
    }
  );

  const countArr = await StudentEnrolment.aggregate([...pipeline, { $count: "count" }]);
  const total = countArr[0]?.count || 0;

  pipeline.push(
    { $sort: { firstName: 1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) }
  );

  const students = await StudentEnrolment.aggregate(pipeline);

  return res.status(200).json(
    new apiResponse(200, { students, total }, "Students fetched")
  );
});

/* ═══════════════════════════════════════════
   0b. GET STUDENT DETAIL  (auto-fill)
   GET /api/certificates/students/:studentId
═══════════════════════════════════════════ */
export const getStudentDetailForCert = asyncHandler(async (req, res) => {
  const StudentEnrolment = getStudentEnrolmentModel(req.db);

  if (!mongoose.Types.ObjectId.isValid(req.params.studentId)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid student ID"));
  }

  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(req.params.studentId) } },
    { $lookup: { from: "classes",   localField: "currentClass",   foreignField: "_id", as: "classObj"   } },
    { $lookup: { from: "sections",  localField: "currentSection", foreignField: "_id", as: "sectionObj" } },
    { $lookup: { from: "sessions",  localField: "session",        foreignField: "_id", as: "sessionObj" } },
    { $lookup: { from: "streams",   localField: "stream",         foreignField: "_id", as: "streamObj"  } },
    { $unwind: { path: "$classObj",   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$sectionObj", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$sessionObj", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$streamObj",  preserveNullAndEmptyArrays: true } },
  ];

  const results = await StudentEnrolment.aggregate(pipeline);
  const student = results[0];

  if (!student) {
    return res.status(404).json(new apiResponse(404, null, "Student not found"));
  }

  // Pull tenant/school info from middleware
  const tenant = req.tenant || {};

  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean).join(" ");

  const prefill = {
    studentId:           student._id,
    studentName:         fullName,
    admissionNo:         student.studentId           || "",
    fatherName:          student.fatherName          || "",
    motherName:          student.motherName          || "",
    guardianName:        student.guardianName        || "",
    dateOfBirth:         student.dob
      ? new Date(student.dob).toISOString().split("T")[0]
      : "",
    dateOfBirthInWords:  student.dob
      ? new Date(student.dob).toLocaleDateString("en-IN", {
          day: "numeric", month: "long", year: "numeric"
        })
      : "",
    nationality:         student.nationality         || "Indian",
    category:            student.category            || "",
    religion:            student.religion            || "",
    scheduleCasteTribe:  student.caste               || student.category || "",
    penNo:               student.penNo               || "",
    apaarNo:             student.aparId              || "",
    medium:              student.medium              || tenant.schoolMedium || "English",
    className:           student.classObj?.name      || student.admissionClass || "",
    admittedClass:       student.classObj?.name      || student.admissionClass || "",
    section:             student.sectionObj?.name    || "",
    rollNo:              student.rollNumber?.toString() || student.srNumber?.toString() || "",
    dateOfAdmission:     student.admissionDate
      ? new Date(student.admissionDate).toISOString().split("T")[0]
      : student.admittedDate
        ? new Date(student.admittedDate).toISOString().split("T")[0]
        : student.createdAt
          ? new Date(student.createdAt).toISOString().split("T")[0]
          : "",
    session:             student.sessionObj?.sessionName || "",
    lastExamAppeared:    student.lastPassedExam      || "",
    gender:              student.gender              || "",
    stream:              student.streamObj?.name     || "",
    profilePic:          student.profilePic          || "",
    relation:            student.gender === "Female" ? "Daughter" : "Son",
    // School info from tenant
    affiliationNo:       tenant.affiliationNo        || "",
    schoolCode:          tenant.schoolCode           || "",
    statusOfSchool:      tenant.statusOfSchool       || "Secondary/Sr. Secondary",
    registrationNo:      tenant.registrationNo       || "",
  };

  return res.status(200).json(
    new apiResponse(200, { student, prefill }, "Student detail fetched")
  );
});

/* ═══════════════════════════════════════════
   1. CREATE
   POST /api/certificates
═══════════════════════════════════════════ */
export const createCertificate = asyncHandler(async (req, res) => {
  const Certificate = getCertificateModel(req.db);

  const { studentName, type } = req.body;

  if (!studentName?.trim()) {
    return res.status(400).json(new apiResponse(400, null, "studentName is required"));
  }
  if (!["transfer", "character"].includes(type)) {
    return res.status(400).json(new apiResponse(400, null, "type must be 'transfer' or 'character'"));
  }

  const serial = await nextSerial(Certificate);

  const cert = await Certificate.create({
    ...req.body,
    serialNo: serial,
    issuedBy: req.user?._id || null,
  });

  return res.status(201).json(new apiResponse(201, cert, "Certificate created successfully"));
});

/* ═══════════════════════════════════════════
   2. GET ALL  (with search + type filter + pagination)
   GET /api/certificates?type=transfer&search=&page=1&limit=10
═══════════════════════════════════════════ */
export const getAllCertificates = asyncHandler(async (req, res) => {
  const Certificate = getCertificateModel(req.db);

  const {
    type,
    search,
    status,
    page = 1,
    limit = 10,
    isPagination = "true",
  } = req.query;

  const match = {};
  if (type) match.type = type;
  if (status) match.status = status;

  const pipeline = [{ $match: match }];

  if (search) {
    const regex = new RegExp(search.trim(), "i");
    pipeline.push({
      $match: {
        $or: [
          { studentName: regex },
          { admissionNo: regex },
          { fatherName: regex },
          { certificateNo: regex },
          { className: regex },
        ],
      },
    });
  }

  // count before pagination
  const totalArr = await Certificate.aggregate([...pipeline, { $count: "count" }]);
  const total = totalArr[0]?.count || 0;

  pipeline.push({ $sort: { createdAt: -1 } });

  if (isPagination === "true") {
    pipeline.push(
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) }
    );
  }

  const certificates = await Certificate.aggregate(pipeline);

  return res.status(200).json(
    new apiResponse(200, {
      certificates,
      list: certificates,          // alias — frontend uses both keys
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
    }, "Certificates fetched successfully")
  );
});

/* ═══════════════════════════════════════════
   3. GET SINGLE
   GET /api/certificates/:id
═══════════════════════════════════════════ */
export const getCertificateById = asyncHandler(async (req, res) => {
  const Certificate = getCertificateModel(req.db);

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid certificate ID"));
  }

  const cert = await Certificate.findById(req.params.id);
  if (!cert) {
    return res.status(404).json(new apiResponse(404, null, "Certificate not found"));
  }

  return res.status(200).json(new apiResponse(200, cert, "Certificate fetched"));
});

/* ═══════════════════════════════════════════
   4. UPDATE
   PUT /api/certificates/:id
═══════════════════════════════════════════ */
export const updateCertificate = asyncHandler(async (req, res) => {
  const Certificate = getCertificateModel(req.db);

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid certificate ID"));
  }

  // protect immutable fields
  delete req.body.serialNo;
  delete req.body.issuedBy;

  const updated = await Certificate.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    return res.status(404).json(new apiResponse(404, null, "Certificate not found"));
  }

  return res.status(200).json(new apiResponse(200, updated, "Certificate updated successfully"));
});

/* ═══════════════════════════════════════════
   5. DELETE
   DELETE /api/certificates/:id
═══════════════════════════════════════════ */
export const deleteCertificate = asyncHandler(async (req, res) => {
  const Certificate = getCertificateModel(req.db);

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid certificate ID"));
  }

  const deleted = await Certificate.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json(new apiResponse(404, null, "Certificate not found"));
  }

  return res.status(200).json(new apiResponse(200, null, "Certificate deleted successfully"));
});
