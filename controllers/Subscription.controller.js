import mongoose from "mongoose";
import SubscriptionPlan from "../models/subscription.modal.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

export const createPlan = asyncHandler(async (req, res) => {
    const {
        name,
        planType,
        pricingModel,
        description,
        price,
        billingCycle,
        studentLimit,
        features,
        trialDays,
    } = req.body;

    // name hamesha required
    if (!name || !name.trim()) {
        return res.status(400).json(new apiResponse(400, null, "Name required"));
    }

    const model = "FIXED";

    if (price === undefined || price === null || price === "") {
        return res.status(400).json(new apiResponse(400, null, "Price required"));
    }
    if (!studentLimit || Number(studentLimit) < 1) {
        return res.status(400).json(new apiResponse(400, null, "Student limit required (minimum 1)"));
    }

    const existing = await SubscriptionPlan.findOne({
        name: name.trim(),
        planType,
    });

    if (existing) {
        return res.status(400).json(new apiResponse(400, null, "Plan already exists"));
    }

    const plan = await SubscriptionPlan.create({
        name:         name.trim(),
        planType:     planType     || "Plan",
        description,
        price:        Number(price)        || 0,
        billingCycle: billingCycle || "Monthly",
        studentLimit: Number(studentLimit) || 0,
        trialDays:    Number(trialDays)    || 0,
        features,
    });

    return res.status(201).json(new apiResponse(201, plan, "Plan created successfully 🚀"));
});

export const getAllPlans = asyncHandler(async (req, res) => {
    const {
        isPagination = "true",
        page = 1,
        limit = 10,
        search,
        planType,
        isActive,
    } = req.query;

    const match = {};

    if (planType) {
        match.planType = planType;
    }

    if (isActive !== undefined) {
        match.isActive = isActive === "true";
    }

    let pipeline = [{ $match: match }];

    /* 🔍 SEARCH */
    if (search) {
        pipeline.push({
            $match: {
                name: { $regex: new RegExp(search.trim(), "i") },
            },
        });
    }

    /* 🔽 SORT */
    pipeline.push({ $sort: { createdAt: -1 } });

    /* 📊 COUNT */
    const totalArr = await SubscriptionPlan.aggregate([
        ...pipeline,
        { $count: "count" },
    ]);
    const total = totalArr[0]?.count || 0;

    /* 📄 PAGINATION */
    if (isPagination === "true") {
        pipeline.push(
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) }
        );
    }

    const plans = await SubscriptionPlan.aggregate(pipeline);

    return res.status(200).json(
        new apiResponse(
            200,
            {
                plans,
                totalPlans: total,
                totalPages: Math.ceil(total / limit),
                currentPage: Number(page),
            },
            "Plans fetched successfully"
        )
    );
});

export const getPlanById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid plan ID"));
    }

    const plan = await SubscriptionPlan.findById(id);

    if (!plan) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Plan not found"));
    }

    return res
        .status(200)
        .json(new apiResponse(200, plan, "Plan fetched successfully"));
});

export const updatePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid plan ID"));
    }

    // planType aur pricingModel create ke baad change nahi hone chahiye
    const { planType, pricingModel, pricePerStudent, minStudents, ...safeBody } = req.body;

    const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(
        id,
        safeBody,
        {
            new: true,
            runValidators: true,
        }
    );

    if (!updatedPlan) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Plan not found"));
    }

    return res
        .status(200)
        .json(new apiResponse(200, updatedPlan, "Plan updated successfully"));
});

export const deletePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid plan ID"));
    }

    const plan = await SubscriptionPlan.findById(id);

    if (!plan) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Plan not found"));
    }

    await plan.deleteOne();

    return res
        .status(200)
        .json(new apiResponse(200, null, "Plan deleted successfully"));
});

export const togglePlanStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const plan = await SubscriptionPlan.findById(id);

    if (!plan) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Plan not found"));
    }

    plan.isActive = !plan.isActive;
    await plan.save();

    return res
        .status(200)
        .json(new apiResponse(200, plan, "Plan status updated"));
});