import { getNotificationModel } from "../../../models/tenant/Notification.model.js";
import { getUserModel } from "../../../models/tenant/user.model.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendFCMNotification } from "../../../utils/sendFCMNotification.js";
import mongoose from "mongoose";

const createNotification = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  const User = getUserModel(req.db);
  const { userId, userRole, title, message, payload } = req.body;

  if (!userId || !title || !message)
    return res
      .status(400)
      .json(
        new apiResponse(400, null, "userId, title and message are required"),
      );
  if (!mongoose.Types.ObjectId.isValid(userId))
    return res.status(400).json(new apiResponse(400, null, "Invalid userId"));

  // DB mein notification save karo
  const notification = await Notification.create({
    userId,
    userRole,
    title: title.trim(),
    message: message.trim(),
    payload,
  });

  // User ka fcmToken fetch karo aur push bhejo
  const user = await User.findById(userId).select("fcmToken");
  if (user?.fcmToken) {
    await sendFCMNotification(
      user.fcmToken,
      title.trim(),
      message.trim(),
      payload || {},
    );
  }

  res
    .status(201)
    .json(
      new apiResponse(201, notification, "Notification created successfully"),
    );
});

const getAllNotifications = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  const {
    userId,
    userRole,
    isRead,
    fromDate,
    toDate,
    isPagination = "true",
    page = 1,
    limit = 10,
  } = req.query;

  const match = {};
  if (userId && mongoose.Types.ObjectId.isValid(userId))
    match.userId = new mongoose.Types.ObjectId(userId);
  if (userRole) match.userRole = userRole;
  if (isRead !== undefined) match.isRead = isRead === "true";
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const nextDay = new Date(toDate);
      nextDay.setDate(nextDay.getDate() + 1);
      match.createdAt.$lt = nextDay;
    }
  }

  const readUnreadArr = await Notification.aggregate([
    { $match: match },
    { $group: { _id: "$isRead", count: { $sum: 1 } } },
  ]);
  let readCount = 0,
    unreadCount = 0;
  readUnreadArr.forEach((item) => {
    if (item._id === true) readCount = item.count;
    if (item._id === false) unreadCount = item.count;
  });

  const pipeline = [{ $match: match }, { $sort: { createdAt: -1, _id: -1 } }];

  const totalArr = await Notification.aggregate([
    ...pipeline,
    { $count: "count" },
  ]);
  const total = totalArr[0]?.count || 0;

  if (isPagination === "true")
    pipeline.push(
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
    );

  const notifications = await Notification.aggregate(pipeline);

  res.status(200).json(
    new apiResponse(
      200,
      {
        notifications,
        totalNotifications: total,
        readCount,
        unreadCount,
        totalPages: isPagination === "true" ? Math.ceil(total / limit) : 1,
        currentPage: isPagination === "true" ? Number(page) : null,
      },
      "Notifications fetched successfully",
    ),
  );
});

const getNotificationById = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid notification ID"));
  const notification = await Notification.findById(req.params.id).populate(
    "userId",
    "name email role",
  );
  if (!notification)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Notification not found"));
  res
    .status(200)
    .json(
      new apiResponse(200, notification, "Notification fetched successfully"),
    );
});

const markNotificationAsRead = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid notification ID"));
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { isRead: true, readAt: new Date() },
    { new: true },
  );
  if (!notification)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Notification not found"));
  res
    .status(200)
    .json(new apiResponse(200, notification, "Notification marked as read"));
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json(new apiResponse(400, null, "User ID required"));
  }

  const result = await Notification.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
  );

  console.log("MARK ALL RESULT =>", result);

  res
    .status(200)
    .json(new apiResponse(200, result, "All notifications marked as read"));
});

const deleteNotification = asyncHandler(async (req, res) => {
  const Notification = getNotificationModel(req.db);
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res
      .status(400)
      .json(new apiResponse(400, null, "Invalid notification ID"));
  const deleted = await Notification.findByIdAndDelete(req.params.id);
  if (!deleted)
    return res
      .status(404)
      .json(new apiResponse(404, null, "Notification not found"));
  res
    .status(200)
    .json(new apiResponse(200, deleted, "Notification deleted successfully"));
});

export {
  createNotification,
  getAllNotifications,
  getNotificationById,
  markNotificationAsRead,
  markAllAsRead,
  deleteNotification,
};
