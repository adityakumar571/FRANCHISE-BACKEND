// controllers/supportController.js

import mongoose from "mongoose";
import Support from "../../../models/tenant/support.model.js";

import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";



// =====================================================
// CREATE SUPPORT
// =====================================================
const createSupport = asyncHandler(async (req, res) => {

    const {
        title,
        description,
        attachment,
        route,
        schoolId,
    } = req.body;

    if (!title || !description) {

        return res.status(400).json(
            new apiResponse(
                400,
                null,
                "Title and description are required"
            )
        );
    }

    // Tenant ID resolve karo — req.tenant, x-tenant-id header, ya body se
    let resolvedSchoolId = req.tenant?._id || null;
    if (!resolvedSchoolId) {
        const subdomainFromHeader = req.headers['x-tenant-id'];
        if (subdomainFromHeader) {
            const { default: Tenant } = await import('../../../models/tenant.model.js');
            const tenantDoc = await Tenant.findOne({ subdomain: subdomainFromHeader }).select('_id').lean();
            if (tenantDoc) resolvedSchoolId = tenantDoc._id;
        }
    }
    if (!resolvedSchoolId && schoolId) resolvedSchoolId = schoolId;

    const supportData = {
        schoolId: resolvedSchoolId,

        route,

        title: title.trim(),

        description: description.trim(),

        attachment,

        createdBy:
            req.user._id ||
            req.user.userId,

        createdByRole: req.user.role,
    };

    const support = await Support.create(
        supportData
    );

    return res.status(201).json(
        new apiResponse(
            201,
            support,
            "Support ticket created successfully"
        )
    );
});

// =====================================================
// GET ALL SUPPORTS
// Pagination + Search + Status + Date Filter
// =====================================================

const getAllSupports = asyncHandler(async (req, res) => {

    let {
        page = 1,
        limit = 10,
        search = "",
        status,
        fromDate,
        toDate,
        sortBy = "recent",
        isPagination = "true",
        schoolId,
        role,
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    // ===============================
    // Match Filters
    // ===============================

    const match = {};

    // School ka tenant — req.tenant (agar tenant middleware se) ya x-tenant-id header se
    let tenantId = req.tenant?._id || null;

    // agar tenant middleware nahi chala (public route) to x-tenant-id header se subdomain lo
    if (!tenantId) {
        const subdomainFromHeader = req.headers['x-tenant-id'];
        if (subdomainFromHeader) {
            // Main DB se tenant dhundo
            const { default: Tenant } = await import('../../../models/tenant.model.js');
            const tenantDoc = await Tenant.findOne({ subdomain: subdomainFromHeader }).select('_id').lean();
            if (tenantDoc) tenantId = tenantDoc._id;
        }
    }

    // schoolId query param fallback
    if (!tenantId && schoolId && mongoose.Types.ObjectId.isValid(schoolId)) {
        tenantId = new mongoose.Types.ObjectId(schoolId);
    }

    // MAIN SUPER ADMIN (no tenant)
    if (
        req.user.role === "SuperAdmin" &&
        !tenantId
    ) {
        // show all tickets
    }

    // SCHOOL SUPER ADMIN
    else if (
        req.user.role === "SuperAdmin" &&
        tenantId
    ) {
        match.schoolId = tenantId;
        match.createdByRole = {
            $in: ["Admin", "SuperAdmin"]
        };
    }

    // SCHOOL ADMIN
    else if (req.user.role === "Admin") {

        if (tenantId) {
            match.schoolId = tenantId;
        }

        // hide superadmin tickets
        match.createdByRole = {
            $ne: "SuperAdmin"
        };
    }

    // STUDENT / USER / TEACHER
    else {
        match.createdBy = new mongoose.Types.ObjectId(
            req.user._id
        );
    }
    // ===============================
    // Search Filter
    // ===============================

if (search) {
    match.$or = [
        {
            title: {
                $regex: search.trim(),
                $options: "i",
            },
        },
        {
            description: {
                $regex: search.trim(),
                $options: "i",
            },
        },


        {
            ticketNo: {
                $regex: search.trim(),
                $options: "i",
            },
        },
    ];
}

    // ===============================
    // Status Filter
    // ===============================

    if (status) {
        match.status = status;
    }


    // MAIN SUPER ADMIN
    if (
        req.user.role === "SuperAdmin" &&
        !req.tenant
    ) {

        // School Filter
        if (schoolId) {
            match.schoolId =
                new mongoose.Types.ObjectId(schoolId);
        }

        // Role Filter
        if (role) {
            match.createdByRole = role;
        }
    }
    // ===============================
    // Date Filter
    // ===============================

    if (fromDate || toDate) {

        match.createdAt = {};

        if (fromDate) {
            match.createdAt.$gte = new Date(fromDate);
        }

        if (toDate) {
            match.createdAt.$lte = new Date(toDate);
        }
    }

    // ===============================
    // Aggregation Pipeline
    // ===============================

    let pipeline = [
        {
            $match: match,
        },

        // School Populate
        // School Populate
        {
            $lookup: {
                from: "tenants",
                localField: "schoolId",
                foreignField: "_id",
                as: "schoolId",
            },
        },

        {
            $unwind: {
                path: "$schoolId",
                preserveNullAndEmptyArrays: true,
            },
        },

        // Admin Populate
        {
            $lookup: {
                from: "users",
                localField: "createdBy",
                foreignField: "_id",
                as: "createdBy",
            },
        },

        {
            $unwind: {
                path: "$createdBy",
                preserveNullAndEmptyArrays: true,
            },
        },
    ];

    // ===============================
    // Sorting
    // ===============================

    if (sortBy === "recent") {

        pipeline.push({
            $sort: {
                createdAt: -1,
                _id: -1,
            },
        });

    } else if (sortBy === "oldest") {

        pipeline.push({
            $sort: {
                createdAt: 1,
                _id: 1,
            },
        });

    } else {

        pipeline.push({
            $sort: {
                _id: -1,
            },
        });
    }

    // ===============================
    // Total Count
    // ===============================

    const totalArray = await Support.aggregate([
        ...pipeline,
        {
            $count: "count",
        },
    ]);

    const totalSupports = totalArray[0]?.count || 0;

    // ===============================
    // Pagination
    // ===============================

    if (isPagination === "true") {

        pipeline.push(
            {
                $skip: (page - 1) * limit,
            },
            {
                $limit: limit,
            }
        );
    }

    // ===============================
    // Final Data
    // ===============================

    const supports = await Support.aggregate(pipeline);

    // ===============================
    // Response
    // ===============================

    return res.status(200).json(
        new apiResponse(
            200,
            {
                supports,
                totalSupports,
                totalPages: Math.ceil(totalSupports / limit),
                currentPage: page,
            },
            "Support tickets fetched successfully"
        )
    );
});


// =====================================================
// GET SINGLE SUPPORT
// =====================================================

const getSingleSupport = asyncHandler(async (req, res) => {

    const { id } = req.params;

    // ===============================
    // Validate ObjectId
    // ===============================

    if (!mongoose.Types.ObjectId.isValid(id)) {

        return res
            .status(400)
            .json(
                new apiResponse(
                    400,
                    null,
                    "Invalid support ticket ID"
                )
            );
    }

    // ===============================
    // Find Support
    // ===============================

    const support = await Support.findById(id)
        .populate("schoolId")
        .populate("createdBy");

    if (!support) {

        return res
            .status(404)
            .json(
                new apiResponse(
                    404,
                    null,
                    "Support ticket not found"
                )
            );
    }

    return res
        .status(200)
        .json(
            new apiResponse(
                200,
                support,
                "Support ticket fetched successfully"
            )
        );
});


// =====================================================
// UPDATE SUPPORT STATUS
// =====================================================

const updateSupportStatus = asyncHandler(async (req, res) => {

    const { id } = req.params;

    const {
        status,
        adminReply,
    } = req.body;

    // ===============================
    // Validate ObjectId
    // ===============================

    if (!mongoose.Types.ObjectId.isValid(id)) {

        return res
            .status(400)
            .json(
                new apiResponse(
                    400,
                    null,
                    "Invalid support ticket ID"
                )
            );
    }

    // ===============================
    // Find Support
    // ===============================

    const support = await Support.findById(id);

    if (!support) {

        return res
            .status(404)
            .json(
                new apiResponse(
                    404,
                    null,
                    "Support ticket not found"
                )
            );
    }

    // ===============================
    // Update Fields
    // ===============================

    if (status) {
        support.status = status;
    }

    if (adminReply) {
        support.adminReply = adminReply;
    }

    if (status === "RESOLVED") {
        support.resolvedAt = new Date();
    }

    await support.save();

    return res
        .status(200)
        .json(
            new apiResponse(
                200,
                support,
                "Support ticket updated successfully"
            )
        );
});


// =====================================================
// DELETE SUPPORT
// =====================================================

const deleteSupport = asyncHandler(async (req, res) => {

    const { id } = req.params;

    // ===============================
    // Validate ObjectId
    // ===============================

    if (!mongoose.Types.ObjectId.isValid(id)) {

        return res
            .status(400)
            .json(
                new apiResponse(
                    400,
                    null,
                    "Invalid support ticket ID"
                )
            );
    }

    // ===============================
    // Delete Support
    // ===============================

    const deletedSupport = await Support.findByIdAndDelete(id);

    if (!deletedSupport) {

        return res
            .status(404)
            .json(
                new apiResponse(
                    404,
                    null,
                    "Support ticket not found"
                )
            );
    }

    return res
        .status(200)
        .json(
            new apiResponse(
                200,
                deletedSupport,
                "Support ticket deleted successfully"
            )
        );
});


export {
    createSupport,
    getAllSupports,
    getSingleSupport,
    updateSupportStatus,
    deleteSupport,
};