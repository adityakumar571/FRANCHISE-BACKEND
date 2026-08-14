import { getCategoryModel } from "../../../models/tenant/Category.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import mongoose from "mongoose";

const createCategory = asyncHandler(async (req, res) => {
    const Category = getCategoryModel(req.db);
    const { name, image, isActive } = req.body;

    if (!name || name.trim() === "")
        return res.status(400).json(new apiResponse(400, null, "Category name is required"));

    const existingCategory = await Category.findOne({ name: name.trim() });
    if (existingCategory)
        return res.status(400).json(new apiResponse(400, null, "Category with this name already exists"));

    const category = await Category.create({ name: name.trim(), image: image || null, isActive: isActive !== undefined ? isActive : true });
    res.status(201).json(new apiResponse(201, category, "Category created successfully"));
});

const getAllCategories = asyncHandler(async (req, res) => {
    const Category = getCategoryModel(req.db);
    const { isPagination = "true", page = 1, limit = 10, search, isActive, sortBy = "recent" } = req.query;

    const match = {};
    if (isActive !== undefined) match.isActive = isActive === "true";

    let pipeline = [{ $match: match }];
    if (search) pipeline.push({ $match: { name: { $regex: new RegExp(search.trim(), "i") } } });
    pipeline.push({ $sort: sortBy === "oldest" ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 } });

    const totalArr = await Category.aggregate([...pipeline, { $count: "count" }]);
    const total = totalArr[0]?.count || 0;

    if (isPagination === "true") pipeline.push({ $skip: (page - 1) * parseInt(limit) }, { $limit: parseInt(limit) });

    const categories = await Category.aggregate(pipeline);
    res.status(200).json(new apiResponse(200, { categories, totalCategories: total, totalPages: Math.ceil(total / limit), currentPage: Number(page) }, "Categories fetched successfully"));
});

const getCategoryById = asyncHandler(async (req, res) => {
    const Category = getCategoryModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid category ID"));

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json(new apiResponse(404, null, "Category not found"));

    res.status(200).json(new apiResponse(200, category, "Category fetched successfully"));
});

const updateCategory = asyncHandler(async (req, res) => {
    const Category = getCategoryModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid category ID"));

    const updatedCategory = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updatedCategory) return res.status(404).json(new apiResponse(404, null, "Category not found"));

    res.status(200).json(new apiResponse(200, updatedCategory, "Category updated successfully"));
});

const deleteCategory = asyncHandler(async (req, res) => {
    const Category = getCategoryModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid category ID"));

    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) return res.status(404).json(new apiResponse(404, null, "Category not found"));

    res.status(200).json(new apiResponse(200, deletedCategory, "Category deleted successfully"));
});

export { createCategory, getAllCategories, getCategoryById, updateCategory, deleteCategory };
