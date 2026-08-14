import mongoose from "mongoose";
import { getStudentPaymentAllocationModel } from "../../../../models/tenant/master/StudentPaymentAllocation.model.js";
import { getFeeInstallmentModel }  from "../../../../models/tenant/master/FeeInstallment.model.js";
import { getAdditionalFeeModel }   from "../../../../models/tenant/master/AdditionalFee.model.js";
import { getTransportFeeModel }    from "../../../../models/tenant/master/TransportFee.model.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import { apiResponse }  from "../../../../utils/apiResponse.js";


const feeHeadReport = asyncHandler(async (req, res) => {

  const db = req.db;
  const StudentPaymentAllocation = getStudentPaymentAllocationModel(db);
  const FeeInstallment           = getFeeInstallmentModel(db);
  const AdditionalFee            = getAdditionalFeeModel(db);
  const TransportFee             = getTransportFeeModel(db);

  const {
    sessionId,
    classId,
    sectionId,
    fromDate,
    toDate,
    page  = 1,
    limit = 10,
  } = req.query;

  if (!sessionId) {
    return res.status(400).json(new apiResponse(400, null, "sessionId required"));
  }

  const currentPage = Number(page);
  const perPage     = Number(limit);
  const skip        = (currentPage - 1) * perPage;

  /* ── Match filter on payment ── */
  const match = {
    "payment.sessionId":     new mongoose.Types.ObjectId(sessionId),
    "payment.paymentStatus": "SUCCESS",
  };

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    match["payment.classId"] = new mongoose.Types.ObjectId(classId);
  }

  if (fromDate || toDate) {
    match["payment.createdAt"] = {};
    if (fromDate) match["payment.createdAt"].$gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      match["payment.createdAt"].$lte = end;
    }
  }

  /* ── Aggregation: get raw allocation rows with payment + student + class + section ── */
  const rawRows = await StudentPaymentAllocation.aggregate([
    // Join payment
    {
      $lookup: {
        from: "studentpayments",
        localField: "paymentId",
        foreignField: "_id",
        as: "payment",
      },
    },
    { $unwind: "$payment" },

    // Apply filters
    { $match: match },

    // Join student enrolment (for section)
    {
      $lookup: {
        from: "studentenrolments",
        localField: "payment.studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },

    // Filter by section if provided
    ...(sectionId && mongoose.Types.ObjectId.isValid(sectionId)
      ? [{ $match: { "student.currentSection": new mongoose.Types.ObjectId(sectionId) } }]
      : []),

    // Join class
    {
      $lookup: {
        from: "classes",
        localField: "payment.classId",
        foreignField: "_id",
        as: "class",
      },
    },
    { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },

    // Join section
    {
      $lookup: {
        from: "sections",
        localField: "student.currentSection",
        foreignField: "_id",
        as: "section",
      },
    },
    { $unwind: { path: "$section", preserveNullAndEmptyArrays: true } },

    // Project only what we need
    {
      $project: {
        paymentId:       1,
        feeType:         1,
        referenceId:     1,
        allocatedAmount: 1,
        className:       "$class.name",
        sectionName:     { $ifNull: ["$section.name", "-"] },
      },
    },
  ]);

  if (!rawRows.length) {
    return res.status(200).json(new apiResponse(200, {
      list: [],
      pagination: { totalRows: 0, totalPages: 0, currentPage, perPage },
    }, "Fee head report fetched successfully"));
  }

  /* ── Build referenceId → feeHead name maps ── */
  const tuitionRefIds    = rawRows.filter(r => r.feeType === "TUITION")    .map(r => r.referenceId);
  const additionalRefIds = rawRows.filter(r => r.feeType === "ADDITIONAL") .map(r => r.referenceId);
  const transportRefIds  = rawRows.filter(r => r.feeType === "TRANSPORT")  .map(r => r.referenceId);

  const [tuitionDocs, additionalDocs, transportDocs] = await Promise.all([
    tuitionRefIds.length
      ? FeeInstallment.find({ _id: { $in: tuitionRefIds } }, { feeHead: 1, period: 1 }).lean()
      : [],
    additionalRefIds.length
      ? AdditionalFee.find({ _id: { $in: additionalRefIds } }, { feeName: 1, period: 1 }).lean()
      : [],
    transportRefIds.length
      ? TransportFee.find({ _id: { $in: transportRefIds } }, { period: 1 }).lean()
      : [],
  ]);

  // Maps: referenceId (string) → display name
  const tuitionNameMap = Object.fromEntries(
    tuitionDocs.map(d => [d._id.toString(), d.feeHead || "Tuition Fee"])
  );
  const additionalNameMap = Object.fromEntries(
    additionalDocs.map(d => [d._id.toString(), d.feeName || "Additional Fee"])
  );
  const transportNameMap = Object.fromEntries(
    transportDocs.map(d => [d._id.toString(), "Transport Fee"])
  );

  const getFeeHeadName = (feeType, referenceId) => {
    const rid = referenceId?.toString();
    switch (feeType) {
      case "TUITION":    return tuitionNameMap[rid]    || "Tuition Fee";
      case "ADDITIONAL": return additionalNameMap[rid] || "Additional Fee";
      case "TRANSPORT":  return transportNameMap[rid]  || "Transport Fee";
      case "LATE_FEE":   return "Late Fee";
      default:           return feeType || "Other";
    }
  };

  /* ── Group by feeType + feeHeadName + className + sectionName ── */
  // Key: "feeType|feeHeadName|className|sectionName"
  const groupMap = {};

  for (const row of rawRows) {
    const feeHeadName = getFeeHeadName(row.feeType, row.referenceId);
    const key = `${row.feeType}|${feeHeadName}|${row.className || "-"}|${row.sectionName || "-"}`;

    if (!groupMap[key]) {
      groupMap[key] = {
        feeType:           row.feeType,
        feeHead:           feeHeadName,
        className:         row.className  || "-",
        sectionName:       row.sectionName || "-",
        totalCollection:   0,
        paymentIds:        new Set(),   // distinct payment count
      };
    }

    groupMap[key].totalCollection += Number(row.allocatedAmount || 0);
    groupMap[key].paymentIds.add(row.paymentId.toString());
  }

  /* ── Build final sorted list ── */
  const allRows = Object.values(groupMap)
    .map(g => ({
      feeType:           g.feeType,
      feeHead:           g.feeHead,
      className:         g.className,
      sectionName:       g.sectionName,
      totalCollection:   parseFloat(g.totalCollection.toFixed(2)),
      totalTransactions: g.paymentIds.size,   // distinct payments
    }))
    .sort((a, b) =>
      (a.className   || "").localeCompare(b.className   || "") ||
      (a.sectionName || "").localeCompare(b.sectionName || "") ||
      (a.feeHead     || "").localeCompare(b.feeHead     || "")
    );

  const totalRows  = allRows.length;
  const totalPages = Math.ceil(totalRows / perPage);
  const list       = allRows.slice(skip, skip + perPage);

  res.status(200).json(
    new apiResponse(200, {
      list,
      pagination: { totalRows, totalPages, currentPage, perPage },
    }, "Fee head report fetched successfully")
  );
});

export { feeHeadReport };
