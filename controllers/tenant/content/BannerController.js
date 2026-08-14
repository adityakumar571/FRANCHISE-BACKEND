import { getBannerModel } from "../../../models/tenant/HomeBanner.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import mongoose from "mongoose";

const createBanner = asyncHandler(async (req, res) => {
    const Banner = getBannerModel(req.db);
    const { title, bannerImage, isActive } = req.body;

    if (!title || title.trim() === "")
        return res.status(400).json(new apiResponse(400, null, "Banner title is required"));

    if (!bannerImage || bannerImage.trim() === "")
        return res.status(400).json(new apiResponse(400, null, "Banner image is required"));

    const banner = await Banner.create({ title: title.trim(), bannerImage, isActive: isActive !== undefined ? isActive : true });
    res.status(201).json(new apiResponse(201, banner, "Banner created successfully"));
});

const getAllBanners = asyncHandler(async (req, res) => {
    const Banner = getBannerModel(req.db);
    const { isPagination = "true", page = 1, limit = 10, search, sortBy = "recent", isActive } = req.query;

    const match = {};
    if (isActive !== undefined) match.isActive = isActive === "true";

    let pipeline = [{ $match: match }];

    if (search) {
        const regex = new RegExp(search.trim(), "i");
        pipeline.push({ $match: { title: { $regex: regex } } });
    }

    pipeline.push({ $sort: sortBy === "oldest" ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 } });

    const totalArr = await Banner.aggregate([...pipeline, { $count: "count" }]);
    const total = totalArr[0]?.count || 0;

    if (isPagination === "true") pipeline.push({ $skip: (page - 1) * parseInt(limit) }, { $limit: parseInt(limit) });

    const banners = await Banner.aggregate(pipeline);
    res.status(200).json(new apiResponse(200, { banners, totalBanners: total, totalPages: Math.ceil(total / limit), currentPage: Number(page) }, "Banners fetched successfully"));
});

const getBannerById = asyncHandler(async (req, res) => {
    const Banner = getBannerModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid banner ID"));

    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json(new apiResponse(404, null, "Banner not found"));

    res.status(200).json(new apiResponse(200, banner, "Banner fetched successfully"));
});

const updateBanner = asyncHandler(async (req, res) => {
    const Banner = getBannerModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid banner ID"));

    const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!banner) return res.status(404).json(new apiResponse(404, null, "Banner not found"));

    res.status(200).json(new apiResponse(200, banner, "Banner updated successfully"));
});

const deleteBanner = asyncHandler(async (req, res) => {
    const Banner = getBannerModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
        return res.status(400).json(new apiResponse(400, null, "Invalid banner ID"));

    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json(new apiResponse(404, null, "Banner not found"));

    res.status(200).json(new apiResponse(200, banner, "Banner deleted successfully"));
});

export { createBanner, getAllBanners, getBannerById, updateBanner, deleteBanner };
