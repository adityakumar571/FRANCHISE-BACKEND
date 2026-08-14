import { getServicesModel } from "../../../models/tenant/Services.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import mongoose from "mongoose";

const createService = asyncHandler(async (req, res) => {
    const Services = getServicesModel(req.db);
    const { name, isActive } = req.body;
    if (!name || name.trim() === "") return res.status(400).json(new apiResponse(400, null, "Service name is required"));
    const existingService = await Services.findOne({ name: name.trim() });
    if (existingService) return res.status(400).json(new apiResponse(400, null, "Service with this name already exists"));
    const service = await Services.create({ name: name.trim(), isActive: isActive !== undefined ? isActive : true });
    res.status(201).json(new apiResponse(201, service, "Service created successfully"));
});

const getAllServices = asyncHandler(async (req, res) => {
    const Services = getServicesModel(req.db);
    const { isPagination = "true", page = 1, limit = 10, search, isActive, sortBy = "recent" } = req.query;

    const match = {};
    if (isActive !== undefined) match.isActive = isActive === "true";

    let pipeline = [{ $match: match }];
    if (search) pipeline.push({ $match: { name: { $regex: new RegExp(search.trim(), "i") } } });
    pipeline.push({ $sort: sortBy === "recent" ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 } });

    const totalArr = await Services.aggregate([...pipeline, { $count: "count" }]);
    const total = totalArr[0]?.count || 0;

    if (isPagination === "true") pipeline.push({ $skip: (page - 1) * parseInt(limit) }, { $limit: parseInt(limit) });

    const services = await Services.aggregate(pipeline);
    res.status(200).json(new apiResponse(200, { services, totalServices: total, totalPages: Math.ceil(total / limit), currentPage: Number(page) }, "Services fetched successfully"));
});

const getServiceById = asyncHandler(async (req, res) => {
    const Services = getServicesModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json(new apiResponse(400, null, "Invalid service ID"));
    const service = await Services.findById(req.params.id);
    if (!service) return res.status(404).json(new apiResponse(404, null, "Service not found"));
    res.status(200).json(new apiResponse(200, service, "Service fetched successfully"));
});

const updateService = asyncHandler(async (req, res) => {
    const Services = getServicesModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json(new apiResponse(400, null, "Invalid service ID"));
    const updatedService = await Services.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updatedService) return res.status(404).json(new apiResponse(404, null, "Service not found"));
    res.status(200).json(new apiResponse(200, updatedService, "Service updated successfully"));
});

const deleteService = asyncHandler(async (req, res) => {
    const Services = getServicesModel(req.db);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json(new apiResponse(400, null, "Invalid service ID"));
    const deletedService = await Services.findByIdAndDelete(req.params.id);
    if (!deletedService) return res.status(404).json(new apiResponse(404, null, "Service not found"));
    res.status(200).json(new apiResponse(200, deletedService, "Service deleted successfully"));
});

export { createService, getAllServices, getServiceById, updateService, deleteService };
