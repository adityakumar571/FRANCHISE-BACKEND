import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userRole: String,
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false },
    readAt: Date,
    payload: Object,
  },
  { timestamps: true },
);

export const getNotificationModel = (connection) => {
  return (
    connection.models.Notification ||
    connection.model("Notification", NotificationSchema)
  );
};
