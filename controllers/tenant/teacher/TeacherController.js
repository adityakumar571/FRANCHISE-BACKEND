import { getTeacherModel } from "../../../models/tenant/teacher/Teacher.model.js";
import { getUserModel } from "../../../models/tenant/user.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import mongoose from "mongoose";
import { sendCredentialsEmail } from "../../../utils/sendCredentialsEmail.js";

const generateEmployeeId = async (Teacher) => {
    let isUnique = false;
    let employeeId;
    while (!isUnique) {
        const random = Math.floor(1000 + Math.random() * 9000);
        employeeId = `EMP-${random}`;
        const exists = await Teacher.findOne({ employeeId });
        if (!exists) isUnique = true;
    }
    return employeeId;
};

const createTeacher = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);
    const User = getUserModel(req.db);

    const { phone, firstName, middleName, lastName, dob, gender, category, profilePic, religion, caste, aadhaarNo, email, emergencyContact, address, dateOfJoining, department, designation, employmentType, subjects, medium, classesAssigned, house, shift, experience, totalExperience, salary, bankAccount, specialAllowance, remarks, documents, status } = req.body;

    if (!phone) return res.status(400).json(new apiResponse(400, null, "Phone is required"));
    if (!/^[0-9]{10}$/.test(phone)) return res.status(400).json(new apiResponse(400, null, "Phone number must be 10 digits"));
    if (!firstName) return res.status(400).json(new apiResponse(400, null, "First name is required"));
    if (!gender) return res.status(400).json(new apiResponse(400, null, "Gender is required"));
    if (!medium || medium.trim() === "") return res.status(400).json(new apiResponse(400, null, "Medium is required"));

    let finalClassesAssigned = [];
    if (Array.isArray(classesAssigned) && classesAssigned.length > 0) {
        finalClassesAssigned = classesAssigned.map(cls => ({ session: cls.session || undefined, stream: cls.stream || undefined, classId: cls.classId || undefined, sectionId: cls.sectionId || undefined, subjectId: cls.subjectId || undefined, isClassTeacher: cls.isClassTeacher || false }));
    }

    let employeeId = req.body.employeeId;
    if (employeeId) {
        const exists = await Teacher.findOne({ employeeId });
        if (exists) return res.status(400).json(new apiResponse(400, null, "Employee ID already exists"));
    } else {
        employeeId = await generateEmployeeId(Teacher);
    }

    const password = `${firstName.toLowerCase()}@123`;
    const user = await User.create({ phone, profilePic, userId: employeeId, name: `${firstName} ${lastName || ""}`.trim(), role: "Teacher", password, email });

    const existingTeacher = await Teacher.findOne({ userId: user._id });
    if (existingTeacher) return res.status(400).json(new apiResponse(400, null, "Teacher already exists"));

    const teacher = await Teacher.create({ userId: user._id, phone, email, firstName, middleName, lastName, dob, gender, category, religion, profilePic, caste, aadhaarNo, emergencyContact, address, employeeId, dateOfJoining, department, designation, employmentType, subjects, medium, classesAssigned: finalClassesAssigned, house, shift, experience, totalExperience, salary, bankAccount, specialAllowance, remarks, documents, status });

    // Send credentials email if email provided
    console.log("📧 Teacher email:", email || "NOT PROVIDED");
    console.log("📧 employeeId:", employeeId, "| password:", password);
    if (email) {
      sendCredentialsEmail({
        to:         email,
        name:       `${firstName} ${lastName || ""}`.trim(),
        role:       "Teacher",
        userId:     employeeId,
        password,
        schoolName: req.tenant?.schoolName || "School",
        subdomain:  req.tenant?.subdomain  || "",
      }).catch((err) => console.error("❌ Teacher email error:", err.message));
    }

    return res.status(201).json(new apiResponse(201, { teacher, credentials: { phone: user.phone, password: user.password } }, "Teacher created successfully"));
});

const getAllTeachers = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);
    const { isPagination = "true", page = 1, limit = 10, search, classId, sectionId, session, stream, subjectId, isClassTeacher, dob, gender, status, sortBy = "recent" } = req.query;

    const matchStage = {};
    if (status) matchStage.status = status;
    if (gender) matchStage.gender = gender;

    const pipeline = [{ $match: matchStage }];

    if (dob) {
        const input = new Date(dob);
        const start = new Date(input); start.setUTCHours(0, 0, 0, 0);
        const end = new Date(input); end.setUTCHours(23, 59, 59, 999);
        pipeline.push({ $match: { dob: { $gte: start, $lte: end } } });
    }

    if (search) {
        const regex = new RegExp(search.trim(), "i");
        pipeline.push({ $match: { $or: [{ firstName: { $regex: regex } }, { lastName: { $regex: regex } }, { phone: { $regex: regex } }, { employeeId: { $regex: regex } }, { email: { $regex: regex } }, { designation: { $regex: regex } }] } });
    }

    pipeline.push({ $sort: sortBy === "recent" ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 } });

    pipeline.push(
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "sessions", localField: "classesAssigned.session", foreignField: "_id", as: "sessionsInfo" } },
        { $lookup: { from: "streams", localField: "classesAssigned.stream", foreignField: "_id", as: "streamsInfo" } },
        { $lookup: { from: "classes", localField: "classesAssigned.classId", foreignField: "_id", as: "classesInfo" } },
        { $lookup: { from: "sections", localField: "classesAssigned.sectionId", foreignField: "_id", as: "sectionsInfo" } },
        { $lookup: { from: "subjects", localField: "classesAssigned.subjectId", foreignField: "_id", as: "subjectsInfo" } },
        {
            $lookup: {
                from: "categorymasters",
                let: { categoryId: "$category" },
                pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$categoryId"] } } }, { $project: { name: 1, _id: 0 } }],
                as: "category",
            },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    );

    const hasClassFilters = session || classId || sectionId || stream || subjectId || isClassTeacher !== undefined;
    if (hasClassFilters) {
        pipeline.push({
            $addFields: {
                classesAssigned: {
                    $filter: {
                        input: "$classesAssigned", as: "cls",
                        cond: {
                            $and: [
                                session ? { $eq: ["$$cls.session", new mongoose.Types.ObjectId(session)] } : true,
                                classId ? { $eq: ["$$cls.classId", new mongoose.Types.ObjectId(classId)] } : true,
                                sectionId ? { $eq: ["$$cls.sectionId", new mongoose.Types.ObjectId(sectionId)] } : true,
                                stream ? { $eq: ["$$cls.stream", new mongoose.Types.ObjectId(stream)] } : true,
                                subjectId ? { $eq: ["$$cls.subjectId", new mongoose.Types.ObjectId(subjectId)] } : true,
                                isClassTeacher !== undefined ? { $eq: ["$$cls.isClassTeacher", isClassTeacher === "true"] } : true,
                            ],
                        },
                    },
                },
            },
        });
        pipeline.push({ $match: { classesAssigned: { $ne: [] } } });
    }

    pipeline.push({
        $addFields: {
            classesAssigned: {
                $map: {
                    input: "$classesAssigned",
                    as: "cls",
                    in: {
                        session: { $arrayElemAt: [{ $filter: { input: "$sessionsInfo", as: "sess", cond: { $eq: ["$$sess._id", "$$cls.session"] } } }, 0] },
                        stream: { $arrayElemAt: [{ $filter: { input: "$streamsInfo", as: "st", cond: { $eq: ["$$st._id", "$$cls.stream"] } } }, 0] },
                        class: { $arrayElemAt: [{ $filter: { input: "$classesInfo", as: "c", cond: { $eq: ["$$c._id", "$$cls.classId"] } } }, 0] },
                        section: { $arrayElemAt: [{ $filter: { input: "$sectionsInfo", as: "s", cond: { $eq: ["$$s._id", "$$cls.sectionId"] } } }, 0] },
                        subject: { $arrayElemAt: [{ $filter: { input: "$subjectsInfo", as: "sub", cond: { $eq: ["$$sub._id", "$$cls.subjectId"] } } }, 0] },
                        isClassTeacher: "$$cls.isClassTeacher",
                    },
                },
            },
        },
    });

    pipeline.push({ $project: { sessionsInfo: 0, streamsInfo: 0, classesInfo: 0, sectionsInfo: 0, subjectsInfo: 0, "user.password": 0 } });

    const totalArr = await Teacher.aggregate([...pipeline, { $count: "count" }]);
    const total = totalArr[0]?.count || 0;

    if (isPagination === "true") pipeline.push({ $skip: (Number(page) - 1) * Number(limit) }, { $limit: Number(limit) });

    const teachers = await Teacher.aggregate(pipeline);

    return res.status(200).json(new apiResponse(200, { teachers, totalTeachers: total, totalPages: Math.ceil(total / Number(limit)), currentPage: Number(page) }, "Teachers fetched successfully"));
});

const getTeacherById = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);

    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid teacher ID"));

    const teacher = await Teacher.findById(req.params.id)
        .populate("userId", "name phone role email userId password gender")
        .populate("classesAssigned.classId").populate("classesAssigned.sectionId")
        .populate("classesAssigned.subjectId", "name").populate("documents.documentId").populate("category", "name");

    if (!teacher) return res.status(404).json(new apiResponse(404, null, "Teacher not found"));

    return res.status(200).json(new apiResponse(200, teacher, "Teacher fetched successfully"));
});

const updateTeacher = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);

    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid teacher ID"));

    if (req.body.classesAssigned) {
        if (!Array.isArray(req.body.classesAssigned)) req.body.classesAssigned = [req.body.classesAssigned];
        req.body.classesAssigned.forEach(cls => {
            if (cls.stream === "") delete cls.stream;
            if (cls.sectionId === "") delete cls.sectionId;
            if (cls.subjectId === "") delete cls.subjectId;
            if (cls.classId === "") delete cls.classId;
        });
        const count = req.body.classesAssigned.filter(c => c.isClassTeacher === true).length;
        if (count > 1) return res.status(400).json(new apiResponse(400, null, "Teacher can be class teacher for only one class-section-subject"));
    }

    const updatedTeacher = await Teacher.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updatedTeacher) return res.status(404).json(new apiResponse(404, null, "Teacher not found"));

    res.status(200).json(new apiResponse(200, updatedTeacher, "Teacher updated successfully"));
});

const deleteTeacher = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);
    const User = getUserModel(req.db);

    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid teacher ID"));

    const teacher = await Teacher.findByIdAndDelete(req.params.id);
    if (!teacher) return res.status(404).json(new apiResponse(404, null, "Teacher not found"));

    await User.findByIdAndDelete(teacher.userId);

    res.status(200).json(new apiResponse(200, teacher, "Teacher deleted successfully"));
});

const assignClassToTeacher = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);
    const { teacherId } = req.params;
    const { session, stream, classId, sectionId, subjectId, isClassTeacher = false } = req.body;

    if (!session || !classId) return res.status(400).json(new apiResponse(400, null, "session and classId are required"));

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json(new apiResponse(404, null, "Teacher not found"));

    const cleanStream = stream && stream.trim() !== "" ? stream : null;
    const cleanSectionId = sectionId && sectionId.trim() !== "" ? sectionId : null;
    const cleanSubjectId = subjectId && subjectId.trim() !== "" ? subjectId : null;

    const alreadyAssigned = teacher.classesAssigned.some(cls =>
        cls.session?.toString() === session && cls.classId?.toString() === classId &&
        (cls.sectionId?.toString() || null) === cleanSectionId && (cls.subjectId?.toString() || null) === cleanSubjectId && (cls.stream?.toString() || null) === cleanStream
    );

    if (alreadyAssigned) return res.status(409).json(new apiResponse(409, null, "This subject/class/section/stream is already assigned for the same session"));

    teacher.classesAssigned.push({ session, stream: cleanStream, classId, sectionId: cleanSectionId, subjectId: cleanSubjectId, isClassTeacher });
    await teacher.save();

    return res.status(200).json(new apiResponse(200, teacher.classesAssigned, "Class assigned successfully"));
});

const deleteAssignedClass = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);
    const { assignId } = req.params;

    const teacher = await Teacher.findOne({ "classesAssigned._id": assignId });
    if (!teacher) return res.status(404).json(new apiResponse(404, null, "Assignment not found"));

    teacher.classesAssigned = teacher.classesAssigned.filter(c => c._id.toString() !== assignId);
    await teacher.save();

    res.status(200).json(new apiResponse(200, null, "Assigned class removed"));
});

const getAssignedClassesByTeacherSession = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);
    const { teacherId } = req.params;
    const { session } = req.query;

    if (!mongoose.Types.ObjectId.isValid(teacherId))
        return res.status(400).json(new apiResponse(400, null, "Invalid teacherId"));

    if (!session || !mongoose.Types.ObjectId.isValid(session))
        return res.status(400).json(new apiResponse(400, null, "Valid session is required"));

    const pipeline = [
        { $match: { _id: new mongoose.Types.ObjectId(teacherId) } },
        { $unwind: "$classesAssigned" },
        { $match: { "classesAssigned.session": new mongoose.Types.ObjectId(session) } },
        { $lookup: { from: "classes", localField: "classesAssigned.classId", foreignField: "_id", as: "class" } },
        { $lookup: { from: "sections", localField: "classesAssigned.sectionId", foreignField: "_id", as: "section" } },
        { $lookup: { from: "subjects", localField: "classesAssigned.subjectId", foreignField: "_id", as: "subject" } },
        { $lookup: { from: "streams", localField: "classesAssigned.stream", foreignField: "_id", as: "stream" } },
        {
            $addFields: {
                "classesAssigned.classId": { $cond: [{ $gt: [{ $size: "$class" }, 0] }, { $arrayElemAt: ["$class", 0] }, null] },
                "classesAssigned.sectionId": { $cond: [{ $gt: [{ $size: "$section" }, 0] }, { $arrayElemAt: ["$section", 0] }, null] },
                "classesAssigned.subjectId": { $cond: [{ $gt: [{ $size: "$subject" }, 0] }, { $arrayElemAt: ["$subject", 0] }, null] },
                "classesAssigned.stream": { $cond: [{ $gt: [{ $size: "$stream" }, 0] }, { $arrayElemAt: ["$stream", 0] }, null] },
            },
        },
        { $project: { class: 0, section: 0, subject: 0, stream: 0 } },
        { $group: { _id: "$_id", firstName: { $first: "$firstName" }, lastName: { $first: "$lastName" }, employeeId: { $first: "$employeeId" }, classesAssigned: { $push: "$classesAssigned" } } },
    ];

    const result = await Teacher.aggregate(pipeline);
    if (!result.length) return res.status(404).json(new apiResponse(404, null, "Teacher not found"));

    return res.status(200).json(new apiResponse(200, result[0], "Assigned classes fetched session wise"));
});

const updateAssignedClass = asyncHandler(async (req, res) => {
    const Teacher = getTeacherModel(req.db);
    const { assignId } = req.params;
    const updateData = req.body;

    const teacher = await Teacher.findOne({ "classesAssigned._id": assignId });
    if (!teacher) return res.status(404).json(new apiResponse(404, null, "Assignment not found"));

    const cls = teacher.classesAssigned.id(assignId);
    Object.assign(cls, updateData);
    await teacher.save();

    res.status(200).json(new apiResponse(200, cls, "Assigned class updated"));
});

export { createTeacher, getAllTeachers, getTeacherById, updateTeacher, deleteTeacher, assignClassToTeacher, getAssignedClassesByTeacherSession, updateAssignedClass, deleteAssignedClass };
