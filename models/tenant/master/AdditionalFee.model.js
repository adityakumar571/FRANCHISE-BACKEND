import mongoose from "mongoose";

const AdditionalFeeSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null,
    },

    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
      default: null,
    },

    feeName: {
      type: String,
      required: true,
      trim: true,
    },

    feeType: {
      type: String,
      enum: ["ONE_TIME", "MONTH", "QUARTER"],
      required: true,
    },

    period: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    remark: String,

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ SAME pattern as Exam model (no extra change)
export const getAdditionalFeeModel = (connection) => {
  return (
    connection.models.AdditionalFee ||
    connection.model("AdditionalFee", AdditionalFeeSchema)
  );
};