import { getStreamModel } from "../../../models/tenant/master/Stream.model.js";
import { getClassModel } from "../../../models/tenant/master/Class.modal.js";

import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";



/* ================= CREATE STREAM ================= */
const createStream = asyncHandler(async (req, res) => {
  try {

    const Stream = getStreamModel(req.db); // ✅
    const Class = getClassModel(req.db);   // ✅

    const { name, classId, isActive, session } = req.body;
    console.log(name, classId, isActive);

    if (!name || name.trim() === "") {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Stream name is required"));
    }

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid class ID"));
    }

    if (!session || !mongoose.Types.ObjectId.isValid(session)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Valid session ID is required"));
    }

    const classExists = await Class.findById(classId);
    if (!classExists) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Class not found"));
    }

    const existingStream = await Stream.findOne({
      name: name.trim(),
      classId,
      session,
    });

    if (existingStream) {
      return res
        .status(400)
        .json(
          new apiResponse(400, null, "Stream already exists for this class"),
        );
    }

    const newStream = await Stream.create({
      name: name.trim(),
      classId,
      session,
      isActive: isActive !== undefined ? isActive : true,
    });

    res
      .status(201)
      .json(new apiResponse(201, newStream, "Stream created successfully"));

  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});


/* ================= GET ALL STREAMS ================= */
const getAllStreams = asyncHandler(async (req, res) => {
  try {

    const Stream = getStreamModel(req.db); // ✅

    const {
      isPagination = "true",
      page = 1,
      limit = 10,
      search,
      sortBy = "recent",
      isActive,
      classId,
      session,
    } = req.query;

    const match = {};
    if (isActive !== undefined) match.isActive = isActive === "true";

    if (classId && mongoose.Types.ObjectId.isValid(classId)) {
      match.classId = new mongoose.Types.ObjectId(classId);
    }

    if (session && mongoose.Types.ObjectId.isValid(session)) {
      match.session = new mongoose.Types.ObjectId(session);
    }

    let pipeline = [{ $match: match }];

    if (search) {
      pipeline.push({
        $match: { name: { $regex: new RegExp(search.trim(), "i") } },
      });
    }

    if (sortBy === "recent") {
      pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
    } else if (sortBy === "oldest") {
      pipeline.push({ $sort: { createdAt: 1, _id: 1 } });
    }

    const totalArr = await Stream.aggregate([...pipeline, { $count: "count" }]);
    const total = totalArr[0]?.count || 0;

    if (isPagination === "true") {
      pipeline.push(
        { $skip: (page - 1) * parseInt(limit) },
        { $limit: parseInt(limit) },
      );
    }

    pipeline.push({
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "_id",
        as: "class",
      },
    });

    pipeline.push({ $unwind: "$class" });

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

    const streams = await Stream.aggregate(pipeline);

    res.status(200).json(
      new apiResponse(
        200,
        {
          streams,
          totalStreams: total,
          totalPages: Math.ceil(total / limit),
          currentPage: Number(page),
        },
        "Streams fetched successfully",
      ),
    );

  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});


/* ================= GET STREAM BY ID ================= */
const getStreamById = asyncHandler(async (req, res) => {
  try {

    const Stream = getStreamModel(req.db); // ✅

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid stream ID"));
    }

    const stream = await Stream.findById(id).populate("classId");

    if (!stream) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Stream not found"));
    }

    res
      .status(200)
      .json(new apiResponse(200, stream, "Stream fetched successfully"));

  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});


/* ================= UPDATE STREAM ================= */
const updateStream = asyncHandler(async (req, res) => {
  try {

    const Stream = getStreamModel(req.db); // ✅

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid stream ID"));
    }

    const updatedStream = await Stream.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedStream) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Stream not found"));
    }

    res
      .status(200)
      .json(new apiResponse(200, updatedStream, "Stream updated successfully"));

  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});


/* ================= DELETE STREAM ================= */
const deleteStream = asyncHandler(async (req, res) => {
  try {

    const Stream = getStreamModel(req.db); // ✅

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid stream ID"));
    }

    const deletedStream = await Stream.findByIdAndDelete(id);

    if (!deletedStream) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Stream not found"));
    }

    res
      .status(200)
      .json(new apiResponse(200, deletedStream, "Stream deleted successfully"));

  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

export {
  createStream,
  getAllStreams,
  getStreamById,
  updateStream,
  deleteStream,
};