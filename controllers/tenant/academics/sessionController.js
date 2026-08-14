
import mongoose from "mongoose";
import { getSessionModel } from "../../../models/tenant/master/Session.model.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { apiResponse } from "../../../utils/apiResponse.js";





export const createSession = asyncHandler(async (req, res) => {
    const { sessionName, isCurrent, isActive } = req.body;

    const Session = getSessionModel(req.db);

    if (!sessionName) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Session name is required"));
    }

    const existingSession = await Session.findOne({
        sessionName: sessionName.trim(),
    });

    if (existingSession) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Session already exists"));
    }

    if (isCurrent === true) {
        await Session.updateMany({ isCurrent: true }, { isCurrent: false });
    }

    const newSession = await Session.create({
        sessionName: sessionName.trim(),
        isCurrent: isCurrent ?? false,
        isActive: isActive ?? true,
    });

    return res
        .status(201)
        .json(new apiResponse(201, newSession, "Session created successfully"));
});

export const getAllSessions = asyncHandler(async (req, res) => {
    const Session = getSessionModel(req.db);

    const {
        isPagination = "true",
        page = 1,
        limit = 10,
        search,
        sortBy,
        isActive,
        isCurrent,
    } = req.query;

    const match = {};

    if (isActive !== undefined) {
        match.isActive = isActive === "true";
    }

    if (isCurrent !== undefined && isCurrent !== "") {
        match.isCurrent = isCurrent === "true";
    }

    let pipeline = [{ $match: match }];

    if (search) {
        pipeline.push({
            $match: {
                sessionName: {
                    $regex: new RegExp(search.trim(), "i"),
                },
            },
        });
    }

    if (sortBy === "recent") {
        pipeline.push({ $sort: { order: 1, createdAt: -1 } });
    } else if (sortBy === "oldest") {
        pipeline.push({ $sort: { order: 1, createdAt: 1 } });
    } else {
        pipeline.push({ $sort: { order: 1, createdAt: 1 } });
    }

    const totalArr = await Session.aggregate([
        ...pipeline,
        { $count: "count" },
    ]);
    const totalSessions = totalArr[0]?.count || 0;

    if (isPagination === "true") {
        pipeline.push(
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) }
        );
    }

    const sessions = await Session.aggregate(pipeline);

    return res.status(200).json(
        new apiResponse(
            200,
            {
                sessions,
                totalSessions,
                totalPages: Math.ceil(totalSessions / limit),
                currentPage: Number(page),
            },
            "Sessions fetched successfully"
        )
    );
});

export const getSessionById = asyncHandler(async (req, res) => {
    const Session = getSessionModel(req.db);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid session ID"));
    }

    const session = await Session.findById(id);

    if (!session) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Session not found"));
    }

    return res
        .status(200)
        .json(new apiResponse(200, session, "Session fetched successfully"));
});

export const updateSession = asyncHandler(async (req, res) => {
    const Session = getSessionModel(req.db);

    const { id } = req.params;
    const { isCurrent } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid session ID"));
    }

    if (isCurrent === true) {
        await Session.updateMany({ _id: { $ne: id } }, { isCurrent: false });
    }

    const updatedSession = await Session.findByIdAndUpdate(id, req.body, {
        new: true,
        runValidators: true,
    });

    if (!updatedSession) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Session not found"));
    }

    return res
        .status(200)
        .json(new apiResponse(200, updatedSession, "Session updated successfully"));
});

export const deleteSession = asyncHandler(async (req, res) => {
    const Session = getSessionModel(req.db);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Invalid session ID"));
    }

    const session = await Session.findById(id);

    if (!session) {
        return res
            .status(404)
            .json(new apiResponse(404, null, "Session not found"));
    }

    if (session.isCurrent) {
        return res
            .status(400)
            .json(new apiResponse(400, null, "Current session cannot be deleted"));
    }

    await session.deleteOne();

    return res
        .status(200)
        .json(new apiResponse(200, session, "Session deleted successfully"));
});

export const migrateSessionOrder = asyncHandler(async (req, res) => {
    const Session = getSessionModel(req.db);

    const { sessions } = req.body;

    const bulkOps = sessions.map((item) => ({
        updateOne: {
            filter: { _id: item.id },
            update: {
                $set: { order: item.order },
            },
        },
    }));

    if (bulkOps.length > 0) {
        await Session.bulkWrite(bulkOps);
    }

    return res.status(200).json(
        new apiResponse(200, null, "Session order updated successfully")
    );
});