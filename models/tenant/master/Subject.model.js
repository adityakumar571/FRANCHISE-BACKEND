import mongoose from "mongoose";

const SubjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    classes: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },

    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
      default: null,
    },

    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getSubjectModel = (connection) => {
  return (
    connection.models.Subject ||
    connection.model("Subject", SubjectSchema)
  );
};