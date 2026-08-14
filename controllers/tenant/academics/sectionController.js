import { getSectionModel } from "../../../models/tenant/master/Section.modal.js";
import { getClassModel } from "../../../models/tenant/master/Class.modal.js";

import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";


/* ================= CREATE SECTION ================= */
const createSection = asyncHandler(async (req, res) => {

  const Section = getSectionModel(req.db); // ✅
  const Class = getClassModel(req.db);     // ✅

  const { name, classes, session } = req.body;

  if (!name || !name.trim()) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Section name is required"));
  }

  if (!classes || !mongoose.Types.ObjectId.isValid(classes)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid class ID is required"));
  }

  if (!session || !mongoose.Types.ObjectId.isValid(session)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Valid session ID is required"));
  }

  const classExists = await Class.findById(classes);

  if (!classExists) {
    return res.status(404).json(new apiResponse(404, null, "Class not found"));
  }

  const duplicate = await Section.findOne({
    name: name.trim(),
    classes,
    session,
  });

  if (duplicate) {
    return res
      .status(409)
      .json(
        new apiResponse(409, null, "Section already exists for this class"),
      );
  }

  const section = await Section.create({
    name: name.trim(),
    classes,
    session,
    isActive: true,
  });

  const populatedSection = await Section.findById(section._id)
    .populate("classes", "name")
    .populate("session", "sessionName");

  res
    .status(201)
    .json(
      new apiResponse(201, populatedSection, "Section created successfully"),
    );
});


/* ================= GET ALL ================= */
const getAllSections = asyncHandler(async (req, res) => {

  const Section = getSectionModel(req.db); // ✅

  try {
    const {
      classId,
      session,
      isActive,
      search,
      page = 1,
      limit = 10,
      isPagination = "true",
    } = req.query;

    const match = {};

    if (isActive !== undefined && isActive !== "") {
      match.isActive = isActive === "true";
    }

    if (classId && mongoose.Types.ObjectId.isValid(classId)) {
      match.classes = new mongoose.Types.ObjectId(classId);
    }

    if (session && mongoose.Types.ObjectId.isValid(session)) {
      match.session = new mongoose.Types.ObjectId(session);
    }

    const pipeline = [];

    pipeline.push({ $match: match });

    pipeline.push({
      $lookup: {
        from: "classes",
        localField: "classes",
        foreignField: "_id",
        as: "class",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$class",
        preserveNullAndEmptyArrays: false,
      },
    });

    pipeline.push({
      $lookup: {
        from: "sessions",
        localField: "session",
        foreignField: "_id",
        as: "sessionData",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$sessionData",
        preserveNullAndEmptyArrays: true,
      },
    });

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

    if (search) {
      pipeline.push({
        $match: {
          name: { $regex: new RegExp(search.trim(), "i") },
        },
      });
    }

    pipeline.push({
      $sort: {
        order: 1,
        createdAt: 1,
      },
    });

    pipeline.push({
      $project: {
        name: 1,
        session: {
          _id: "$sessionData._id",
          sessionName: "$sessionData.sessionName",
        },
        class: {
          _id: "$class._id",
          name: "$class.name",
          order: "$class.order",
          isActive: "$class.isActive",
        },
        order: 1,
        isActive: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    });

    const countResult = await Section.aggregate([
      ...pipeline,
      { $count: "count" },
    ]);

    const totalSections = countResult[0]?.count || 0;

    if (isPagination === "true") {
      pipeline.push(
        { $skip: (Number(page) - 1) * Number(limit) },
        { $limit: Number(limit) },
      );
    }

    const sections = await Section.aggregate(pipeline);

    res.status(200).json(
      new apiResponse(
        200,
        {
          sections,
          totalSections,
          totalPages: Math.ceil(totalSections / limit),
          currentPage: Number(page),
        },
        "Sections fetched successfully",
      ),
    );

  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});



/* ================= GET SECTION BY ID ================= */
const getSectionById = asyncHandler(async (req, res) => {
  const Section = getSectionModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid section ID"));
  }

  const section = await Section.findById(id).populate("classes", "name");

  if (!section) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Section not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, section, "Section fetched successfully"));
});

/* ================= UPDATE SECTION ================= */
const updateSection = asyncHandler(async (req, res) => {
  const Section = getSectionModel(req.db);

  const { id } = req.params;
  const { name, classes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid section ID"));
  }

  if (classes && !mongoose.Types.ObjectId.isValid(classes)) {
    return res.status(400).json(new apiResponse(400, null, "Invalid class ID"));
  }

  // Duplicate check
  if (name && classes) {
    const duplicate = await Section.findOne({
      _id: { $ne: id },
      name: name.trim(),
      classes,
    });

    if (duplicate) {
      return res
        .status(409)
        .json(
          new apiResponse(409, null, "Section already exists for this class"),
        );
    }
  }

  const section = await Section.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  }).populate("classes", "name"); // only populate class name

  if (!section) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Section not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, section, "Section updated successfully"));
});

/* ================= DELETE SECTION ================= */
const deleteSection = asyncHandler(async (req, res) => {
  const Section = getSectionModel(req.db);

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid section ID"));
  }

  const section = await Section.findByIdAndDelete(id);

  if (!section) {
    return res
      .status(404)
      .json(new apiResponse(404, null, "Section not found"));
  }

  res
    .status(200)
    .json(new apiResponse(200, section, "Section deleted successfully"));
});

const updateSectionOrder = async (req, res) => {
  try {
    const Section = getSectionModel(req.db);

    const { classId, sections } = req.body;

    // ================= VALIDATIONS =================
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid classId",
      });
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: "sections array is required",
      });
    }

    // ================= BULK OPERATIONS =================
    const bulkOps = sections.map((item, index) => ({
      updateOne: {
        filter: {
          _id: item._id,
          classes: classId, // ✅ class wise check
        },
        update: {
          $set: {
            order: item.order ?? index + 1, // fallback safe ordering
          },
        },
      },
    }));

    await Section.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      message: "Section order updated class-wise successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error while updating section order",
      error: error.message,
    });
  }
};

export {
  createSection,
  getAllSections,
  getSectionById,
  updateSection,
  deleteSection,
  updateSectionOrder,
};
