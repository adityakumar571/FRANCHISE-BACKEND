import mongoose from "mongoose";

const ExamListSchema = new mongoose.Schema(
  {
    examMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamMaster",
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
    },

    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
    },

    fromDate: {
      type: Date,
      required: true,
    },

    toDate: {
      type: Date,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    order: {
      type: Number,
      default: 0,
      index: true
    },

    remarks: {
      type: String,
      trim: true,
    },

    // Subject-wise total marks & passing marks — set once at exam creation
    // so marks entry can auto-fill maxMarks per subject
    subjects: [
      {
        subjectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Subject",
          required: true,
        },
        maxMarks: {
          type: Number,
          required: true,
          min: 0,
        },
        passingMarks: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ✅ SAME multi-tenant pattern
export const getExamListModel = (connection) => {
  return (
    connection.models.ExamList ||
    connection.model("ExamList", ExamListSchema)
  );
};