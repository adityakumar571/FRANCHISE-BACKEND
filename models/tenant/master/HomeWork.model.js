import mongoose from "mongoose";

const HomeworkSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      required: true,
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },

    title: {
      type: String,
      required: true,
    },

    description: String,

    homeworkType: {
      type: String,
      enum: ["HOMEWORK", "ASSIGNMENT", "PROJECT"],
      default: "HOMEWORK",
    },

    assignDate: Date,
    dueDate: Date,

    attachments: [String],
    readBy: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StudentEnrolment",
        },

        readAt: Date,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },

    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
      default: null,
    },
  },
  { timestamps: true },
);

// ✅ SAME multi-tenant pattern
export const getHomeworkModel = (connection) => {
  return (
    connection.models.Homework || connection.model("Homework", HomeworkSchema)
  );
};
