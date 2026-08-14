import { getTestimonialsModel } from "../../../models/tenant/Testimonials.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import mongoose from "mongoose";

const createTestimonial = asyncHandler(async (req, res) => {
    const Testimonials = getTestimonialsModel(req.db);
    const { title, discription, rating, profileImage, isActive } = req.body;
    if (!profileImage || profileImage.trim() === "") return res.status(400).json(new apiResponse(400, null, "Profile image URL is required"));
    if (rating !== undefined && (rating < 0 || rating > 5)) return res.status(400).json(new apiResponse(400, null, "Rating must be between 0 and 5"));
    const testimonial = await Testimonials.create({ title: title?.trim() || "", discription: discription?.trim() || "", rating: rating !== undefined ? rating : 0, profileImage: profileImage.trim(), isActive: isActive !== undefined ? isActive : true });
    res.status(201).json(new apiResponse(201, testimonial, "Testimonial created successfully"));
});

const getAllTestimonials = asyncHandler(async (req, res) => {
    const Testimonials = getTestimonialsModel(req.db);
    const { isPagination = "true", page = 1, limit = 10, search, isActive, sortBy = "recent" } = req.query;

    const match = {};
    if (isActive !== undefined) match.isActive = isActive === "true";

    let pipeline = [{ $match: match }];
    if (search) { const regex = new RegExp(search.trim(), "i"); pipeline.push({ $match: { $or: [{ title: { $regex: regex } }, { discription: { $regex: regex } }] } }); }
    pipeline.push({ $sort: sortBy === "recent" ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 } });

    const totalArr = await Testimonials.aggregate([...pipeline, { $count: "count" }]);
    const total = totalArr[0]?.count || 0;

    if (isPagination === "true") pipeline.push({ $skip: (page - 1) * parseInt(limit) }, { $limit: parseInt(limit) });

    const testimonials = await Testimonials.aggregate(pipeline);
    res.status(200).json(new apiResponse(200, { testimonials, totalTestimonials: total, totalPages: Math.ceil(total / limit), currentPage: Number(page) }, "Testimonials fetched successfully"));
});

const getTestimonialById = asyncHandler(async (req, res) => {
    const Testimonials = getTestimonialsModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json(new apiResponse(400, null, "Invalid testimonial ID"));
    const testimonial = await Testimonials.findById(req.params.id);
    if (!testimonial) return res.status(404).json(new apiResponse(404, null, "Testimonial not found"));
    res.status(200).json(new apiResponse(200, testimonial, "Testimonial fetched successfully"));
});

const updateTestimonial = asyncHandler(async (req, res) => {
    const Testimonials = getTestimonialsModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json(new apiResponse(400, null, "Invalid testimonial ID"));
    if (req.body.rating !== undefined && (req.body.rating < 0 || req.body.rating > 5)) return res.status(400).json(new apiResponse(400, null, "Rating must be between 0 and 5"));
    const updatedTestimonial = await Testimonials.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updatedTestimonial) return res.status(404).json(new apiResponse(404, null, "Testimonial not found"));
    res.status(200).json(new apiResponse(200, updatedTestimonial, "Testimonial updated successfully"));
});

const deleteTestimonial = asyncHandler(async (req, res) => {
    const Testimonials = getTestimonialsModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json(new apiResponse(400, null, "Invalid testimonial ID"));
    const deletedTestimonial = await Testimonials.findByIdAndDelete(req.params.id);
    if (!deletedTestimonial) return res.status(404).json(new apiResponse(404, null, "Testimonial not found"));
    res.status(200).json(new apiResponse(200, deletedTestimonial, "Testimonial deleted successfully"));
});

export { createTestimonial, getAllTestimonials, getTestimonialById, updateTestimonial, deleteTestimonial };
