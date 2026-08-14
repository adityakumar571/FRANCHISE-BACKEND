import mongoose from "mongoose";
import { getFeeStructureModel } from "../../../models/tenant/master/FeeStructure.model.js";
import { getFeeInstallmentModel } from "../../../models/tenant/master/FeeInstallment.model.js";
import { getSessionModel } from "../../../models/tenant/master/Session.model.js";
import { getInstallmentTypeModel } from "../../../models/tenant/master/InstallmentType.model.js";
import { INSTALLMENT_PERIODS } from "../../../utils/feeInstallmentPeriods.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";

/* ================= CREATE FEE STRUCTURE ================= */
const createFeeStructure = asyncHandler(async (req, res) => {
  try {
    const FeeStructure = getFeeStructureModel(req.db); // ✅
    const FeeInstallment = getFeeInstallmentModel(req.db); // ✅
    const Session = getSessionModel(req.db); // ✅
    const InstallmentType = getInstallmentTypeModel(req.db); // ✅
    const {
      sessionId,
      classId,
      streamId,
      feeHeadName,
      installmentType,
      totalAmount,
      installments, // array entered by admin
      remark,
    } = req.body;

    // basic validations
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid session ID"));
    }

    // ── classId validation (was missing in CREATE) ──
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid class ID"));
    }

    // ── streamId normalize ──
    const normalizedStreamId =
      !streamId || streamId === "NULL" || streamId === ""
        ? null
        : mongoose.Types.ObjectId.isValid(streamId)
        ? streamId
        : null;

    // ── totalAmount must be a positive number ──
    const parsedTotal = Number(totalAmount);
    if (!totalAmount || isNaN(parsedTotal) || parsedTotal <= 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Total amount must be greater than 0"));
    }

    if (!mongoose.Types.ObjectId.isValid(installmentType)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid installmentType ID"));
    }

    const installmentTypeDoc = await InstallmentType.findById(installmentType);

    if (!installmentTypeDoc) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Installment type not found"));
    }

    const installmentTypeName = installmentTypeDoc.name;

    //  check session exists & active
    const session = await Session.findById(sessionId);
    if (!session || !session.isActive) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Session not found or inactive"));
    }

    if (!Array.isArray(installments) || installments.length === 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Installments are required"));
    }

    //const expectedPeriods = INSTALLMENT_PERIODS[installmentType];
    const expectedPeriods = INSTALLMENT_PERIODS[installmentTypeName];
    if (!expectedPeriods) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid installment type"));
    }

    if (installments.length !== expectedPeriods.length) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Installment count mismatch"));
    }

    // ── Each installment: amount > 0 and dueDate present ──
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];
      const instAmount = Number(inst.amount);
      if (isNaN(instAmount) || instAmount <= 0) {
        return res
          .status(400)
          .json(new apiResponse(400, null, `Installment ${i + 1}: amount must be greater than 0`));
      }
      if (!inst.dueDate || isNaN(new Date(inst.dueDate).getTime())) {
        return res
          .status(400)
          .json(new apiResponse(400, null, `Installment ${i + 1}: valid due date is required`));
      }
      if (!expectedPeriods.includes(inst.period)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, `Installment ${i + 1}: invalid period '${inst.period}'`));
      }
    }

    // validate total
    const sum = installments.reduce(
      (total, inst) => total + Number(inst.amount),
      0,
    );

    const safeSum = Number(sum.toFixed(2));
    const safeTotal = Number(Number(totalAmount).toFixed(2));

    if (safeSum !== safeTotal) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            "Total amount does not match installment sum",
          ),
        );
    }

    //  prevent duplicate fee structure for same session + class + stream + fee
    const exists = await FeeStructure.findOne({
      sessionId,
      classId,
      streamId: normalizedStreamId,
      feeHeadName,
    });

    if (exists) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            "Fee structure already exists for this session",
          ),
        );
    }

    //  create fee structure
    const feeStructure = await FeeStructure.create({
      sessionId,
      classId,
      streamId: normalizedStreamId,
      feeHeadName,
      installmentType: installmentType,
      totalInstallments: installments.length,
      totalAmount,
      remark,
    });

    //  create installments
    const installmentDocs = installments.map((inst, index) => ({
      feeStructureId: feeStructure._id,
      installmentNo: index + 1,
      period: inst.period,
      amount: inst.amount,
      dueDate: inst.dueDate,
      remark: inst.remark,
    }));

    await FeeInstallment.insertMany(installmentDocs);

    res
      .status(201)
      .json(
        new apiResponse(
          201,
          feeStructure,
          "Fee structure created successfully",
        ),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET FEE STRUCTURES ================= */
const getFeeStructures = asyncHandler(async (req, res) => {
  try {
    const FeeStructure = getFeeStructureModel(req.db);
    const { sessionId, classId, streamId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid session ID"));
    }

    const filter = { sessionId };

    if (classId) {
      if (!mongoose.Types.ObjectId.isValid(classId)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, "Invalid class ID"));
      }
      filter.classId = classId;
    }

    if (streamId) {
      if (!mongoose.Types.ObjectId.isValid(streamId)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, "Invalid stream ID"));
      }
      filter.streamId = streamId;
    }

    const data = await FeeStructure.find(filter)
      .populate("sessionId")
      .populate("classId")
      .populate("streamId")
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json(new apiResponse(200, data, "Fee structures fetched successfully"));
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET FULL FEE STRUCTURES (WITH FILTERS) ================= 
const getFullFeeStructures = asyncHandler(async (req, res) => {
  try {
    const { sessionId, classId, streamId } = req.query;

    // ================= SESSION VALIDATION ================= 
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Valid sessionId is required"));
    }

    // ================= BUILD FILTER ================= 
    const filter = { sessionId };

    if (classId) {
      if (!mongoose.Types.ObjectId.isValid(classId)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, "Invalid class ID"));
      }
      filter.classId = classId;
    }

    if (streamId) {
      if (!mongoose.Types.ObjectId.isValid(streamId)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, "Invalid stream ID"));
      }
      filter.streamId = streamId;
    }

    // ================= FETCH FEE STRUCTURES ================= 
    const feeStructures = await FeeStructure.find(filter)
      .populate("sessionId")
      .populate("classId")
      .populate("streamId")
      .sort({ createdAt: -1 });

    if (!feeStructures.length) {
      return res
        .status(200)
        .json(new apiResponse(200, [], "No fee structures found"));
    }

    // ================= FETCH INSTALLMENTS ================= 
    const feeStructureIds = feeStructures.map(fs => fs._id);

    const installments = await FeeInstallment.find({
      feeStructureId: { $in: feeStructureIds },
    }).sort({ installmentNo: 1 });

    // ================= MAP INSTALLMENTS ================= 
    const installmentMap = {};
    installments.forEach(inst => {
      const key = inst.feeStructureId.toString();
      if (!installmentMap[key]) installmentMap[key] = [];
      installmentMap[key].push(inst);
    });

    // ================= MERGE RESULT ================= 
    const result = feeStructures.map(fs => ({
      feeStructure: fs,
      installments: installmentMap[fs._id.toString()] || [],
    }));

    res.status(200).json(
      new apiResponse(
        200,
        result,
        "Full fee structures fetched successfully"
      )
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
}); */

/* ================= GET FULL FEE STRUCTURES (WITH PAGINATION) ================= */
const getFullFeeStructures = asyncHandler(async (req, res) => {
  try {
    const FeeStructure = getFeeStructureModel(req.db);
    const FeeInstallment = getFeeInstallmentModel(req.db);
    const { sessionId, classId, streamId, page = 1, limit = 10 } = req.query;

    // ================= SESSION VALIDATION =================
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Valid sessionId is required"));
    }

    const currentPage = Number(page) || 1;
    const perPage = Number(limit) || 10;
    const skip = (currentPage - 1) * perPage;

    // ================= BUILD FILTER =================
    const filter = { sessionId };

    if (classId) {
      if (!mongoose.Types.ObjectId.isValid(classId)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, "Invalid class ID"));
      }
      filter.classId = classId;
    }

    if (streamId) {
      if (!mongoose.Types.ObjectId.isValid(streamId)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, "Invalid stream ID"));
      }
      filter.streamId = streamId;
    }

    // ================= TOTAL COUNT =================
    const totalRows = await FeeStructure.countDocuments(filter);
    const totalPages = Math.ceil(totalRows / perPage);

    // ================= FETCH PAGINATED FEE STRUCTURES =================
    const feeStructures = await FeeStructure.find(filter)
      .populate("sessionId")
      .populate("classId")
      .populate("streamId")
      .populate("installmentType", "name")
      // .sort({ createdAt: -1 })
      .sort({
        order: 1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(perPage);

    if (!feeStructures.length) {
      return res.status(200).json(
        new apiResponse(
          200,
          {
            list: [],
            pagination: {
              totalRows,
              totalPages,
              currentPage,
              perPage,
            },
          },
          "No fee structures found",
        ),
      );
    }

    // ================= FETCH INSTALLMENTS =================
    const feeStructureIds = feeStructures.map((fs) => fs._id);

    const installments = await FeeInstallment.find({
      feeStructureId: { $in: feeStructureIds },
    }).sort({ installmentNo: 1 });

    // ================= MAP INSTALLMENTS =================
    const installmentMap = {};
    installments.forEach((inst) => {
      const key = inst.feeStructureId.toString();
      if (!installmentMap[key]) installmentMap[key] = [];
      installmentMap[key].push(inst);
    });

    // ================= MERGE RESULT =================
    const result = feeStructures.map((fs) => ({
      feeStructure: fs,
      installments: installmentMap[fs._id.toString()] || [],
    }));

    // ================= RESPONSE =================
    res.status(200).json(
      new apiResponse(
        200,
        {
          list: result,
          pagination: {
            totalRows,
            totalPages,
            currentPage,
            perPage,
          },
        },
        "Full fee structures fetched successfully",
      ),
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET FULL FEE STRUCTURE ================= */
const getFullFeeStructureById = asyncHandler(async (req, res) => {
  try {
    const FeeStructure = getFeeStructureModel(req.db);
    const FeeInstallment = getFeeInstallmentModel(req.db);
    const { id } = req.params;

    // 🔹 Validate fee structure ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid fee structure ID"));
    }

    // 🔹 Get fee structure
    const feeStructure = await FeeStructure.findById(id)
      .populate("sessionId")
      .populate("classId")
      .populate("streamId")
      .populate("installmentType");

    if (!feeStructure) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Fee structure not found"));
    }

    // 🔹 Get related installments
    const installments = await FeeInstallment.find({
      feeStructureId: id,
    }).sort({ installmentNo: 1 });

    res.status(200).json(
      new apiResponse(
        200,
        {
          feeStructure,
          installments,
        },
        "Full fee structure fetched successfully",
      ),
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= UPDATE FEE STRUCTURE ONLY ================= 
const updateFeeStructure = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid fee structure ID"));
    }

    const updated = await FeeStructure.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Fee structure not found"));
    }

    res
      .status(200)
      .json(
        new apiResponse(200, updated, "Fee structure updated successfully")
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
}); */

/* ================= UPDATE FULL FEE STRUCTURE ================= */
const updateFeeStructure = asyncHandler(async (req, res) => {
  try {
    const FeeStructure = getFeeStructureModel(req.db);
    const FeeInstallment = getFeeInstallmentModel(req.db);
    const Session = getSessionModel(req.db);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid fee structure ID"));
    }

    let {
      sessionId,
      classId,
      streamId,
      feeHeadName,
      installmentType,
      totalAmount,
      installments,
      remark,
    } = req.body;

    // ================= BASIC VALIDATIONS =================

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid session ID"));
    }

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid class ID"));
    }

    // ── totalAmount must be a positive number ──
    const parsedTotal = Number(totalAmount);
    if (!totalAmount || isNaN(parsedTotal) || parsedTotal <= 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Total amount must be greater than 0"));
    }

    // normalize optional streamId
    if (!streamId || streamId === "NULL" || streamId === "") {
      streamId = null;
    } else if (!mongoose.Types.ObjectId.isValid(streamId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid stream ID"));
    }

    if (!Array.isArray(installments) || installments.length === 0) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Installments are required"));
    }

    // ================= INSTALLMENT VALIDATION =================

    const InstallmentType = getInstallmentTypeModel(req.db);

    if (!mongoose.Types.ObjectId.isValid(installmentType)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid installmentType ID"));
    }

    const installmentTypeDoc = await InstallmentType.findById(installmentType);
    if (!installmentTypeDoc) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Installment type not found"));
    }

    const installmentTypeName = installmentTypeDoc.name;
    const expectedPeriods = INSTALLMENT_PERIODS[installmentTypeName];

    if (!expectedPeriods) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid installment type"));
    }

    if (installments.length !== expectedPeriods.length) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Installment count mismatch"));
    }

    // ── Each installment: amount > 0, dueDate valid, period in expected list ──
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];
      const instAmount = Number(inst.amount);
      if (isNaN(instAmount) || instAmount <= 0) {
        return res
          .status(400)
          .json(new apiResponse(400, null, `Installment ${i + 1}: amount must be greater than 0`));
      }
      if (!inst.dueDate || isNaN(new Date(inst.dueDate).getTime())) {
        return res
          .status(400)
          .json(new apiResponse(400, null, `Installment ${i + 1}: valid due date is required`));
      }
      if (!expectedPeriods.includes(inst.period)) {
        return res
          .status(400)
          .json(new apiResponse(400, null, `Installment ${i + 1}: invalid period '${inst.period}'`));
      }
    }

    const sum = installments.reduce(
      (total, inst) => total + Number(inst.amount),
      0,
    );

    if (Number(sum.toFixed(2)) !== Number(Number(totalAmount).toFixed(2))) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            "Total amount does not match installment sum",
          ),
        );
    }

    // ================= CHECK SESSION =================

    const session = await Session.findById(sessionId);
    if (!session || !session.isActive) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Session not found or inactive"));
    }

    // ================= CHECK EXISTING FEE STRUCTURE =================

    const feeStructure = await FeeStructure.findById(id);
    if (!feeStructure) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Fee structure not found"));
    }

    // ================= DUPLICATE CHECK (EXCEPT SELF) =================

    const duplicate = await FeeStructure.findOne({
      _id: { $ne: id },
      sessionId,
      classId,
      streamId,
      feeHeadName,
    });

    if (duplicate) {
      return res
        .status(400)
        .json(
          new apiResponse(
            400,
            null,
            "Fee structure already exists for this session",
          ),
        );
    }

    // ================= UPDATE PARENT =================

    feeStructure.sessionId = sessionId;
    feeStructure.classId = classId;
    feeStructure.streamId = streamId;
    feeStructure.feeHeadName = feeHeadName;
    feeStructure.installmentType = installmentType;
    feeStructure.totalInstallments = installments.length;
    feeStructure.totalAmount = totalAmount;
    feeStructure.remark = remark;

    await feeStructure.save();

    // ================= REPLACE INSTALLMENTS =================

    await FeeInstallment.deleteMany({ feeStructureId: id });

    const installmentDocs = installments.map((inst, index) => ({
      feeStructureId: id,
      installmentNo: index + 1,
      period: inst.period,
      amount: inst.amount,
      dueDate: inst.dueDate,
      remark: inst.remark,
    }));

    await FeeInstallment.insertMany(installmentDocs);

    res
      .status(200)
      .json(
        new apiResponse(
          200,
          feeStructure,
          "Fee structure updated successfully",
        ),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= DELETE FEE STRUCTURE ================= */
const deleteFeeStructure = asyncHandler(async (req, res) => {
  try {
    const FeeStructure = getFeeStructureModel(req.db);
    const FeeInstallment = getFeeInstallmentModel(req.db);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid fee structure ID"));
    }

    const deleted = await FeeStructure.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Fee structure not found"));
    }

    // delete related installments
    await FeeInstallment.deleteMany({ feeStructureId: id });

    res
      .status(200)
      .json(
        new apiResponse(200, deleted, "Fee structure deleted successfully"),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

export {
  createFeeStructure,
  getFeeStructures,
  updateFeeStructure,
  deleteFeeStructure,
  getFullFeeStructureById,
  getFullFeeStructures,
};
