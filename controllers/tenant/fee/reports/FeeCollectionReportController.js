import mongoose from "mongoose";
import { getStudentPaymentModel } from "../../../../models/tenant/master/StudentPayment.model.js";
import { getStudentEnrolmentModel } from "../../../../models/tenant/student/StudentEnrolment.model.js";
import { getClassModel } from "../../../../models/tenant/master/Class.modal.js";
import { getUserModel } from "../../../../models/tenant/user.model.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import { apiResponse } from "../../../../utils/apiResponse.js";




/* ================= FEE COLLECTION REPORT ================= */
const feeCollectionReport = asyncHandler(async (req, res) => {

  // âœ… MULTI-TENANT MODELS
  const StudentPayment = getStudentPaymentModel(req.db);
  const StudentEnrollment = getStudentEnrolmentModel(req.db);
  const Class = getClassModel(req.db);
  const User = getUserModel(req.db);

  const {
    sessionId,
    fromDate,
    toDate,
    classId,
    sectionId,
    studentId,
    clerkId,
    receiptNo,
    page = 1,
    limit = 10,
  } = req.query;

  console.log("📋 fee-collection query params:", { sessionId, receiptNo, classId, page });

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid sessionId is required"));
  }

  if (classId && !mongoose.Types.ObjectId.isValid(classId)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid classId"));
  }

  if (sectionId && !mongoose.Types.ObjectId.isValid(sectionId)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid sectionId"));
  }

  if (clerkId && !mongoose.Types.ObjectId.isValid(clerkId)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid clerkId"));
  }

  if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid studentId"));
  }

  const match = {
    sessionId: new mongoose.Types.ObjectId(sessionId),
  };

  if (classId) match.classId = new mongoose.Types.ObjectId(classId);
  if (clerkId) match.clerkId = new mongoose.Types.ObjectId(clerkId);
  if (studentId) match.studentId = new mongoose.Types.ObjectId(studentId);

  // receiptNo: partial case-insensitive search (e.g. "000010" or "RCPT-2026-000010")
  if (receiptNo?.trim()) {
    match.receiptNo = { $regex: receiptNo.trim(), $options: "i" };
  }

  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  // ✅ List pipeline shows all payments (no status filter) for display
  // Summary pipeline separately counts only SUCCESS payments
  const pipeline = [
    { $match: match },

    {
      $lookup: {
        from: "studentenrolments",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },

    {
      $unwind: {
        path: "$student",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "_id",
        as: "class",
      },
    },
    {
      $unwind: {
        path: "$class",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "sections",
        localField: "student.currentSection",
        foreignField: "_id",
        as: "section",
      },
    },
    {
      $unwind: {
        path: "$section",
        preserveNullAndEmptyArrays: true,
      },
    },

    // Filter by sectionId if provided
    ...(sectionId ? [{ $match: { "student.currentSection": new mongoose.Types.ObjectId(sectionId) } }] : []),

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
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "clerkId",
        foreignField: "_id",
        as: "clerk",
      },
    },
    {
      $unwind: {
        path: "$clerk",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $project: {
        receiptNo: 1,
        amountPaid: 1,
        paymentMode: 1,
        paymentStatus: 1,
        paymentType: 1,
        gatewayOrderId: 1,
        gatewayPaymentId: 1,
        remarks: 1,
        createdAt: 1,
        studentName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$student.firstName", ""] },
                " ",
                { $ifNull: ["$student.lastName", ""] }
              ]
            }
          }
        },
        // Parent phone — phone is required on enrollment, use it directly
        studentPhone: { $ifNull: ["$student.phone", ""] },
        fatherName:   { $ifNull: ["$student.fatherName", ""] },
        studentId:    { $ifNull: ["$student.studentId",  ""] },
        formNo:       { $ifNull: ["$student.formNo", { $ifNull: ["$student.registrationNo", ""] }] },
        className: "$class.name",
        sectionName: "$section.name",
        streamName: "$stream.name",
        clerkName: "$clerk.name",
      },
    },

    { $sort: { createdAt: -1 } },
  ];

  // ✅ Summary: only SUCCESS payments for financial totals
  const summaryAgg = await StudentPayment.aggregate([
    {
      $match: {
        ...match,
        paymentStatus: "SUCCESS",
      },
    },
    {
      $group: {
        _id: null,
        totalCollection: { $sum: "$amountPaid" },
        totalReceipts: { $sum: 1 },
      },
    },
  ]);

  const summary = summaryAgg[0] || {
    totalCollection: 0,
    totalReceipts: 0,
  };

  const skip = (Number(page) - 1) * Number(limit);

  const list = await StudentPayment.aggregate([
    ...pipeline,
    { $skip: skip },
    { $limit: Number(limit) },
  ]);

  // ✅ FIX: totalRows = actual list count (all statuses), not just SUCCESS count
  const totalRowsAgg = await StudentPayment.aggregate([
    { $match: match },
    { $count: "count" },
  ]);
  const totalRows = totalRowsAgg[0]?.count || 0;
  const totalPages = Math.ceil(totalRows / limit);

  res.status(200).json(
    new apiResponse(
      200,
      {
        summary,
        pagination: {
          totalRows,
          totalPages,
          currentPage: Number(page),
          perPage: Number(limit),
        },
        list,
      },
      "Fee collection report fetched successfully"
    )
  );
});

export { feeCollectionReport };