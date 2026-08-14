import mongoose from "mongoose";

const ClassSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // ✅ Session Reference
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    // ✅ Junior / Senior Boolean
    isSenior: {
      type: Boolean,
      default: false,
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

// ✅ EXACT same pattern as Exam
export const getClassModel = (connection) => {
  return (
    connection.models.Class ||
    connection.model("Class", ClassSchema)
  );
};