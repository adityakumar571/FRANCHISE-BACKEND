import mongoose from "mongoose";
import { getCategoryMasterModel } from "../../../models/tenant/master/categoryMaster.model.js";

export const createCategory = async (req, res) => {
  try {
    const CategoryMaster = getCategoryMasterModel(req.db); 

    const { name, description } = req.body;

    const exist = await CategoryMaster.findOne({ name });

    if (exist) {
      return res.status(400).json({
        success: false,
        message: "Category already exists"
      });
    }

    const category = await CategoryMaster.create({
      name,
      description,
      createdBy: req.user?._id
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getCategories = async (req, res) => {
  try {
    const CategoryMaster = getCategoryMasterModel(req.db); 

    const {
      page = 1,
      limit = 10,
      search = "",
      isPagination = true
    } = req.query;

    const filter = {};

    // status filter only when explicitly passed
    if (req.query.status !== undefined && req.query.status !== "") {
      filter.status = req.query.status === "true";
    }

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const skip = (page - 1) * limit;

    let categories;
    let total;

    if (isPagination === "true" || isPagination === true) {

      categories = await CategoryMaster.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      total = await CategoryMaster.countDocuments(filter);

    } else {

      categories = await CategoryMaster.find(filter)
        .sort({ createdAt: -1 });

      total = categories.length;

    }

    res.status(200).json({
      success: true,
      data: categories,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const CategoryMaster = getCategoryMasterModel(req.db); // ✅ change

    const { id } = req.params;
    const { name, description, status } = req.body;

    const category = await CategoryMaster.findByIdAndUpdate(
      id,
      { name, description, status },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const CategoryMaster = getCategoryMasterModel(req.db); // ✅ change

    const { id } = req.params;

    await CategoryMaster.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};