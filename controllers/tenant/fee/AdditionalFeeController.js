import mongoose from "mongoose";
import { getAdditionalFeeModel } from "../../../models/tenant/master/AdditionalFee.model.js";
import { getSessionModel } from "../../../models/tenant/master/Session.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";


/* ================= CREATE ADDITIONAL FEE ================= */
const createAdditionalFee = asyncHandler(async (req, res) => {
  try {
    const AdditionalFee = getAdditionalFeeModel(req.db); // ✅ change
    const Session = getSessionModel(req.db); // ✅ change

    let {
      sessionId,
      classId,
      streamId,
      feeName,
      feeType,
      period,
      amount,
      dueDate,
      remark,
    } = req.body;

    if (!sessionId || !feeName || !feeType || !period || !amount ) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Required fields missing"));
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid session ID"));
    }

    const session = await Session.findById(sessionId);
    if (!session || !session.isActive) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Session not found or inactive"));
    }

    if (!classId || classId === "NULL" || classId === "") classId = null;
    if (!streamId || streamId === "NULL" || streamId === "") streamId = null;

    if (classId && !mongoose.Types.ObjectId.isValid(classId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid class ID"));
    }

    if (streamId && !mongoose.Types.ObjectId.isValid(streamId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid stream ID"));
    }

    const additionalFee = await AdditionalFee.create({
      sessionId,
      classId,
      streamId,
      feeName,
      feeType,
      period,
      amount,
      dueDate,
      remark,
    });

    res.status(201).json(
      new apiResponse(
        201,
        additionalFee,
        "Additional fee added successfully"
      )
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET ADDITIONAL FEES ================= */
const getAdditionalFees = asyncHandler(async (req, res) => {
  try {
    const AdditionalFee = getAdditionalFeeModel(req.db); // ✅ change

    let { sessionId, classId, streamId, page = 1, limit = 10 } = req.query;

    if (!sessionId) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "sessionId is required"));
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid session ID"));
    }

    const currentPage = Number(page) || 1;
    const perPage = Number(limit) || 10;
    const skip = (currentPage - 1) * perPage;

    if (!classId || classId === "" || classId === "NULL") classId = null;
    if (!streamId || streamId === "" || streamId === "NULL") streamId = null;

    if (classId && !mongoose.Types.ObjectId.isValid(classId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid class ID"));
    }

    if (streamId && !mongoose.Types.ObjectId.isValid(streamId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid stream ID"));
    }

    const filter = { sessionId };

    if (classId) {
      filter.classId = classId;
    }

    if (streamId) {
      filter.streamId = streamId;
    }

    const totalRows = await AdditionalFee.countDocuments(filter);
    const totalPages = Math.ceil(totalRows / perPage);

    const fees = await AdditionalFee.find(filter)
      .populate("sessionId")
      .populate("classId")
      .populate("streamId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage);

    res.status(200).json(
      new apiResponse(
        200,
        {
          list: fees,
          pagination: {
            totalRows,
            totalPages,
            currentPage,
            perPage,
          },
        },
        "Additional fees fetched successfully"
      )
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= UPDATE ================= */
const updateAdditionalFee = asyncHandler(async (req, res) => {
  try {
    const AdditionalFee = getAdditionalFeeModel(req.db); // ✅ change

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid additional fee ID"));
    }

    delete req.body.sessionId;

    const updated = await AdditionalFee.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Additional fee not found"));
    }

    res.status(200).json(
      new apiResponse(200, updated, "Additional fee updated successfully")
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= DELETE ================= */
const deleteAdditionalFee = asyncHandler(async (req, res) => {
  try {
    const AdditionalFee = getAdditionalFeeModel(req.db); // ✅ change

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid additional fee ID"));
    }

    const deleted = await AdditionalFee.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Additional fee not found"));
    }

    res
      .status(200)
      .json(
        new apiResponse(200, deleted, "Additional fee deleted successfully")
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

export {
  createAdditionalFee,
  getAdditionalFees,
  updateAdditionalFee,
  deleteAdditionalFee
};