import mongoose from "mongoose";
import { getDocumentModel } from "../../../models/tenant/master/documents.modal.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";




/* ================= CREATE DOCUMENT ================= */
const createDocument = asyncHandler(async (req, res) => {
  try {
    const Document = getDocumentModel(req.db); // ✅ change

    const { name, category, isActive, session } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Document name is required"));
    }
    if (!category || !category.trim()) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Document category is required"));
    }

    if (!session || !mongoose.Types.ObjectId.isValid(session)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Valid session is required"));
    }

    const existingDoc = await Document.findOne({
      name: name.trim(),
      category: category.trim(),
    });

    if (existingDoc) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Document already exists"));
    }

    const newDocument = await Document.create({
      name: name.trim(),
      category: category.trim(),
      isActive: isActive !== undefined ? isActive : true,
      session,
    });

    res
      .status(201)
      .json(new apiResponse(201, newDocument, "Document created successfully"));
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET ALL DOCUMENTS ================= */
const getAllDocuments = asyncHandler(async (req, res) => {
  try {
    const Document = getDocumentModel(req.db); // ✅ change

    const {
      isPagination = "true",
      page = 1,
      limit = 10,
      search,
      sortBy = "recent",
      isActive,
      category,
      session,
    } = req.query;

    const match = {};
    if (isActive !== undefined) match.isActive = isActive === "true";
    if (category) match.category = category.trim();
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

    const totalArr = await Document.aggregate([
      ...pipeline,
      { $count: "count" },
    ]);
    const total = totalArr[0]?.count || 0;

    if (isPagination === "true") {
      pipeline.push(
        { $skip: (page - 1) * parseInt(limit) },
        { $limit: parseInt(limit) },
      );
    }

    const documents = await Document.aggregate(pipeline);

    res.status(200).json(
      new apiResponse(
        200,
        {
          documents,
          totalDocuments: total,
          totalPages: Math.ceil(total / limit),
          currentPage: Number(page),
        },
        "Documents fetched successfully",
      ),
    );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= GET DOCUMENT BY ID ================= */
const getDocumentById = asyncHandler(async (req, res) => {
  try {
    const Document = getDocumentModel(req.db); // ✅ change

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid document ID"));
    }

    const documentData = await Document.findById(id);

    if (!documentData) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Document not found"));
    }

    res
      .status(200)
      .json(
        new apiResponse(200, documentData, "Document fetched successfully"),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= UPDATE DOCUMENT ================= */
const updateDocument = asyncHandler(async (req, res) => {
  try {
    const Document = getDocumentModel(req.db); // ✅ change

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid document ID"));
    }

    if (
      req.body.session &&
      !mongoose.Types.ObjectId.isValid(req.body.session)
    ) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid session ID"));
    }

    const updatedDocument = await Document.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedDocument) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Document not found"));
    }

    res
      .status(200)
      .json(
        new apiResponse(200, updatedDocument, "Document updated successfully"),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

/* ================= DELETE DOCUMENT ================= */
const deleteDocument = asyncHandler(async (req, res) => {
  try {
    const Document = getDocumentModel(req.db); // ✅ change

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new apiResponse(400, null, "Invalid document ID"));
    }

    const deletedDocument = await Document.findByIdAndDelete(id);

    if (!deletedDocument) {
      return res
        .status(404)
        .json(new apiResponse(404, null, "Document not found"));
    }

    res
      .status(200)
      .json(
        new apiResponse(200, deletedDocument, "Document deleted successfully"),
      );
  } catch (error) {
    res.status(500).json(new apiResponse(500, null, error.message));
  }
});

export {
  createDocument,
  getAllDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
};