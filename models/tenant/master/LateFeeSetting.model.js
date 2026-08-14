import mongoose from "mongoose";

const LateFeeSettingSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
    },

    graceDays: {
      type: Number,
      default: 0,
    },

    fineType: {
      type: String,
      enum: ["PER_DAY", "FIXED"],
      default: "PER_DAY",
    },

    fineAmount: Number,

    maxFine: Number,

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getLateFeeSettingModel = (connection) => {
  return (
    connection.models.LateFeeSetting ||
    connection.model("LateFeeSetting", LateFeeSettingSchema)
  );
};