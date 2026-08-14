import mongoose from "mongoose";

const NoticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    attachment: { type: String, },
    sender: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      role: { type: String, enum: ["SuperAdmin", "Admin", "Teacher", "Student"], required: true },
    },
    recipients: {
      roles: [{ type: String, enum: ["SuperAdmin", "Admin", "Teacher", "Student"] }],
      specificAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      specificTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }],
      specificStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrolment" }],
      classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
      sectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Section" }],
    },
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
    isActive: { type: Boolean, default: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export const getNoticeModel = (connection) => {
  return connection.models.Notice ||
    connection.model("Notice", NoticeSchema);
};
