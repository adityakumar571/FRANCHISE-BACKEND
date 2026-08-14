import FAQ from "../models/FAQ.model.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";

/* ─── Create FAQ ─── */
export const createFAQ = asyncHandler(async (req, res) => {
  const { category, question, answer, isActive, order } = req.body;

  if (!category?.trim()) return res.status(400).json(new apiResponse(400, null, "Category is required"));
  if (!question?.trim()) return res.status(400).json(new apiResponse(400, null, "Question is required"));
  if (!answer?.trim())   return res.status(400).json(new apiResponse(400, null, "Answer is required"));

  const faq = await FAQ.create({
    category: category.trim(),
    question: question.trim(),
    answer:   answer.trim(),
    isActive: isActive !== undefined ? isActive : true,
    order:    order || 0,
  });

  return res.status(201).json(new apiResponse(201, faq, "FAQ created successfully"));
});

/* ─── Get All FAQs (paginated + search + category filter) ─── */
export const getAllFAQs = asyncHandler(async (req, res) => {
  const {
    page         = 1,
    limit        = 10,
    isPagination = "true",
    search,
    category,
    isActive,
  } = req.query;

  const match = {};

  if (isActive !== undefined) match.isActive = isActive === "true";
  if (category)               match.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };

  if (search) {
    const regex = new RegExp(search.trim(), "i");
    match.$or = [
      { question: { $regex: regex } },
      { answer:   { $regex: regex } },
      { category: { $regex: regex } },
    ];
  }

  const pipeline = [{ $match: match }, { $sort: { order: 1, createdAt: -1 } }];

  const totalArr = await FAQ.aggregate([...pipeline, { $count: "count" }]);
  const total    = totalArr[0]?.count || 0;

  if (isPagination === "true") {
    pipeline.push(
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) }
    );
  }

  const faqs = await FAQ.aggregate(pipeline);

  // Unique categories for filter dropdown
  const categories = await FAQ.distinct("category");

  return res.status(200).json(
    new apiResponse(200, {
      faqs,
      categories,
      total,
      totalFAQs:   total,
      totalPages:  Math.ceil(total / Number(limit)),
      currentPage: Number(page),
    }, "FAQs fetched successfully")
  );
});

/* ─── Get Single FAQ ─── */
export const getFAQById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json(new apiResponse(400, null, "Invalid FAQ ID"));

  const faq = await FAQ.findById(req.params.id);
  if (!faq) return res.status(404).json(new apiResponse(404, null, "FAQ not found"));

  return res.status(200).json(new apiResponse(200, faq, "FAQ fetched successfully"));
});

/* ─── Update FAQ ─── */
export const updateFAQ = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json(new apiResponse(400, null, "Invalid FAQ ID"));

  const { category, question, answer, isActive, order } = req.body;
  const updates = {};

  if (category !== undefined) updates.category = category.trim();
  if (question !== undefined) updates.question = question.trim();
  if (answer   !== undefined) updates.answer   = answer.trim();
  if (isActive !== undefined) updates.isActive = isActive;
  if (order    !== undefined) updates.order    = order;

  if (!updates.category && updates.category === "")
    return res.status(400).json(new apiResponse(400, null, "Category cannot be empty"));
  if (!updates.question && updates.question === "")
    return res.status(400).json(new apiResponse(400, null, "Question cannot be empty"));
  if (!updates.answer && updates.answer === "")
    return res.status(400).json(new apiResponse(400, null, "Answer cannot be empty"));

  const faq = await FAQ.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!faq) return res.status(404).json(new apiResponse(404, null, "FAQ not found"));

  return res.status(200).json(new apiResponse(200, faq, "FAQ updated successfully"));
});

/* ─── Delete FAQ ─── */
export const deleteFAQ = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json(new apiResponse(400, null, "Invalid FAQ ID"));

  const faq = await FAQ.findByIdAndDelete(req.params.id);
  if (!faq) return res.status(404).json(new apiResponse(404, null, "FAQ not found"));

  return res.status(200).json(new apiResponse(200, faq, "FAQ deleted successfully"));
});

/* ─── Toggle isActive ─── */
export const toggleFAQStatus = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json(new apiResponse(400, null, "Invalid FAQ ID"));

  const faq = await FAQ.findById(req.params.id);
  if (!faq) return res.status(404).json(new apiResponse(404, null, "FAQ not found"));

  faq.isActive = !faq.isActive;
  await faq.save();

  return res.status(200).json(new apiResponse(200, faq, `FAQ ${faq.isActive ? "activated" : "deactivated"} successfully`));
});

/* ─── Get all unique categories ─── */
export const getFAQCategories = asyncHandler(async (req, res) => {
  const categories = await FAQ.distinct("category");
  return res.status(200).json(new apiResponse(200, { categories }, "Categories fetched successfully"));
});
