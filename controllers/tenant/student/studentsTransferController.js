
import { getStudentEnrolmentModel } from "../../../models/tenant/student/StudentEnrolment.model.js";
import { getUserModel } from "../../../models/tenant/user.model.js";


import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

const createStudentsTransfer = asyncHandler(async (req, res) => {
  try {
    // ✅ DYNAMIC MODELS (MULTI-TENANT)
    const StudentEnrolment = getStudentEnrolmentModel(req.db);
    const User = getUserModel(req.db);

    const { students, toSession, toClass, toSection, toStream, transferDate } = req.body;

    if (!toSession || !toClass || !toSection) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Session, Class, and Section are required"));
    }

    if (!students || students.length === 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "No students selected for transfer"));
    }

    // ✅ Convert IDs to ObjectId (safe)
    const studentIds = students.map(id => new mongoose.Types.ObjectId(id));

    // Fetch students
    const studentsToTransfer = await StudentEnrolment.find({
      _id: { $in: studentIds },
    });

    if (studentsToTransfer.length === 0) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Students not found"));
    }

    // -----------------------------------------------------------
    // 🔍 PRE-CHECK: Check duplicates BEFORE transfer starts
    // -----------------------------------------------------------

    const errors = [];

    for (let student of studentsToTransfer) {
      const exist = await StudentEnrolment.findOne({
        studentId: student.studentId,
        session: toSession,
        currentClass: toClass
      });

      if (exist) {
        errors.push(
          `${student.firstName} ${student.lastName} already exists in this session/class/section`
        );
      }
    }

    // ❗ If any duplicate found → STOP transfer
    if (errors.length > 0) {
      return res
        .status(400)
        .json(new apiResponse(400, { duplicates: errors }, "Duplicate entries found"));
    }

    // -----------------------------------------------------------
    // No duplicates → Now perform transfer
    // -----------------------------------------------------------

    const newStudents = [];

    for (let student of studentsToTransfer) {
      let newStudentData = student.toObject();

      delete newStudentData._id;
      delete newStudentData.createdAt;
      delete newStudentData.updatedAt;

      if (toStream) {
        newStudentData.stream = toStream;
      }

      newStudentData.session = toSession;
      newStudentData.currentClass = toClass;
      newStudentData.currentSection = toSection;
      newStudentData.admissionDate = transferDate || new Date();
      newStudentData.status = "Studying";
      newStudentData.resultStatus = "";

      const newStudent = await StudentEnrolment.create(newStudentData);
      newStudents.push(newStudent);
    }

    return res.status(201).json(
      new apiResponse(
        201,
        newStudents,
        `${newStudents.length} student(s) transferred successfully`
      )
    );
  } catch (error) {
    return res
      .status(500)
      .json(new apiResponse(500, null, `Error: ${error.message}`));
  }
});

export { createStudentsTransfer };