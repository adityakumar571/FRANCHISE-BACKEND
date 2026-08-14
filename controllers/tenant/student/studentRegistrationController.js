import { getStudentRegistrationModel } from "../../../models/tenant/student/StudentRegistration.model.js";

import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";




/* ================= CREATE STUDENT REGISTRATION ================= */
const createStudentRegistration = asyncHandler(async (req, res) => {
    const StudentRegistration = getStudentRegistrationModel(req.db);
    try {

        /* ── SESSION BILLING RESTRICTION CHECK ─────────────────────────────
           If 2+ months overdue, new student registrations are blocked.
        ──────────────────────────────────────────────────────────────────── */
        if (req.sessionRestrictions?.studentRegistrationBlocked) {
            return res.status(402).json(
                new apiResponse(402, {
                    reason:            "REGISTRATION_RESTRICTED",
                    overdueMonthCount: req.sessionRestrictions.overdueMonthCount,
                    sessionYear:       req.sessionRestrictions.sessionYear,
                },
                `New student registration is disabled. ${req.sessionRestrictions.overdueMonthCount} subscription month(s) are overdue. Please clear pending payments to continue.`)
            );
        }

        const {
            session,
            phone,
            formNo,
            registrationDate,
            firstName,
            middleName,
            lastName,
            fatherName,
            studentAdhaarNumber,
            gender,
            handicapped,
            currentClass,
            studentType,
            registrationFee,
            paymentMode,
            address,
            city,
            remark,
        } = req.body;

        // ✅ Logged-in user ID (JWT se)
        const createdBy = req.user?._id;

        if (!phone) {
            return res
                .status(400)
                .json(new apiResponse(400, null, "Phone is required"));
        }

        if (!createdBy) {
            return res
                .status(401)
                .json(new apiResponse(401, null, "Unauthorized"));
        }

        const registration = await StudentRegistration.create({
            session,
            phone,
            formNo,
            registrationDate,
            createdBy, // 👈 yahan login user ki ID save hogi
            firstName,
            middleName,
            lastName,
            fatherName,
            studentAdhaarNumber,
            gender,
            handicapped,
            currentClass,
            studentType,
            registrationFee,
            paymentMode,
            address,
            city,
            remark,
        });

        res.status(201).json(
            new apiResponse(
                201,
                registration,
                "Student registration created successfully"
            )
        );
    } catch (error) {
        res
            .status(500)
            .json(new apiResponse(500, null, `Error: ${error.message}`));
    }
});

/* ================= GET ALL STUDENT REGISTRATIONS ================= */
const getAllStudentRegistrations = asyncHandler(async (req, res) => {
    const StudentRegistration = getStudentRegistrationModel(req.db);
    try {
        const {
            isPagination = "true",
            page = 1,
            limit = 10,
            search,
            session,
            gender,
            currentClass,
            isEnroll,
            sortBy = "recent",
        } = req.query;

        const match = {};

        /* ✅ SESSION FILTER (FIXED) */
        if (session && mongoose.Types.ObjectId.isValid(session)) {
            match.session = new mongoose.Types.ObjectId(session);
        }

        if (gender) match.gender = gender;

        if (currentClass && mongoose.Types.ObjectId.isValid(currentClass)) {
            match.currentClass = new mongoose.Types.ObjectId(currentClass);
        }

        if (isEnroll !== undefined) {
            match.isEnroll = isEnroll === "true";
        }

        let pipeline = [{ $match: match }];

        /* 🔍 SEARCH */
        if (search) {
            const regex = new RegExp(search.trim(), "i");
            pipeline.push({
                $match: {
                    $or: [
                        { firstName: { $regex: regex } },
                        { lastName: { $regex: regex } },
                        { phone: { $regex: regex } },
                        { formNo: { $regex: regex } },
                    ],
                },
            });
        }

        /* 🧭 SORT */
        if (sortBy === "recent") {
            pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
        } else if (sortBy === "oldest") {
            pipeline.push({ $sort: { createdAt: 1, _id: 1 } });
        }

        /* 🔢 TOTAL COUNT */
        const totalArr = await StudentRegistration.aggregate([
            ...pipeline,
            { $count: "count" },
        ]);
        const total = totalArr[0]?.count || 0;

        /* 📄 PAGINATION */
        if (isPagination === "true") {
            pipeline.push(
                { $skip: (page - 1) * parseInt(limit) },
                { $limit: parseInt(limit) }
            );
        }

        /* 🔗 POPULATE SESSION ✅ */
        pipeline.push({
            $lookup: {
                from: "sessions",
                localField: "session",
                foreignField: "_id",
                as: "session",
            },
        });

        pipeline.push({
            $unwind: {
                path: "$session",
                preserveNullAndEmptyArrays: true,
            },
        });

        /* 🔗 POPULATE STUDENT ENROLMENT */
        pipeline.push({
            $lookup: {
                from: "studentenrolments",
                localField: "studentEnrolmentId",
                foreignField: "_id",
                as: "studentEnrolmentId",
            },
        });

        pipeline.push({
            $unwind: {
                path: "$studentEnrolmentId",
                preserveNullAndEmptyArrays: true,
            },
        });

        /* 🔗 POPULATE EXPECTED CLASS */
        pipeline.push({
            $lookup: {
                from: "classes",
                localField: "currentClass",
                foreignField: "_id",
                as: "currentClass",
            },
        });

        pipeline.push({
            $unwind: {
                path: "$currentClass",
                preserveNullAndEmptyArrays: true,
            },
        });

        /* 🔗 POPULATE CREATED BY */
        pipeline.push({
            $lookup: {
                from: "users",
                localField: "createdBy",
                foreignField: "_id",
                as: "createdBy",
            },
        });

        pipeline.push({
            $unwind: {
                path: "$createdBy",
                preserveNullAndEmptyArrays: true,
            },
        });

        const students = await StudentRegistration.aggregate(pipeline);

        res.status(200).json(
            new apiResponse(
                200,
                {
                    students,
                    totalStudents: total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: Number(page),
                },
                "Student registrations fetched successfully"
            )
        );
    } catch (error) {
        res
            .status(500)
            .json(new apiResponse(500, null, `Error: ${error.message}`));
    }
});

/* ================= GET SINGLE STUDENT ================= */
const getStudentRegistrationById = asyncHandler(async (req, res) => {
    const StudentRegistration = getStudentRegistrationModel(req.db);
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res
                .status(400)
                .json(new apiResponse(400, null, "Invalid student ID"));
        }

        const student = await StudentRegistration.findById(req.params.id)
            .populate("studentEnrolmentId")
            .populate("currentClass")
            .populate("session")
            .populate("createdBy", "name phone role");

        if (!student) {
            return res
                .status(404)
                .json(new apiResponse(404, null, "Student not found"));
        }

        res
            .status(200)
            .json(new apiResponse(200, student, "Student fetched successfully"));
    } catch (error) {
        res
            .status(500)
            .json(new apiResponse(500, null, `Error: ${error.message}`));
    }
});

/* ================= UPDATE STUDENT ================= */
const updateStudentRegistration = asyncHandler(async (req, res) => {
    const StudentRegistration = getStudentRegistrationModel(req.db);
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res
                .status(400)
                .json(new apiResponse(400, null, "Invalid student ID"));
        }

        const updatedStudent = await StudentRegistration.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!updatedStudent) {
            return res
                .status(404)
                .json(new apiResponse(404, null, "Student not found"));
        }

        res
            .status(200)
            .json(
                new apiResponse(
                    200,
                    updatedStudent,
                    "Student updated successfully"
                )
            );
    } catch (error) {
        res
            .status(500)
            .json(new apiResponse(500, null, `Error: ${error.message}`));
    }
});




/* ================= DELETE STUDENT ================= */
const deleteStudentRegistration = asyncHandler(async (req, res) => {
    const StudentRegistration = getStudentRegistrationModel(req.db);
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res
                .status(400)
                .json(new apiResponse(400, null, "Invalid student ID"));
        }

        const deletedStudent = await StudentRegistration.findByIdAndDelete(
            req.params.id
        );

        if (!deletedStudent) {
            return res
                .status(404)
                .json(new apiResponse(404, null, "Student not found"));
        }

        res
            .status(200)
            .json(
                new apiResponse(
                    200,
                    deletedStudent,
                    "Student deleted successfully"
                )
            );
    } catch (error) {
        res
            .status(500)
            .json(new apiResponse(500, null, `Error: ${error.message}`));
    }
});

export {
    createStudentRegistration,
    getAllStudentRegistrations,
    getStudentRegistrationById,
    updateStudentRegistration,
    deleteStudentRegistration,
};
