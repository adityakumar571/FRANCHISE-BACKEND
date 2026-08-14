import mongoose from "mongoose";

const AdditionalFeeWaiverSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrolment",
      required: true,
    },

    additionalFeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdditionalFee",
      required: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null,
    },

    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      default: null,
    },

    // Denormalized fee info for fast reporting
    feeName: {
      type: String,
      default: null,
    },

    period: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      default: 0,
    },

    // Waiver info
    waivedAmount: {
      type: Number,
      default: 0,
    },

    isWaived: {
      type: Boolean,
      default: false, // true when waivedAmount >= amount
    },

    waivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    waiverReason: {
      type: String,
      default: null,
    },

    waivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Unique: one waiver record per student per additional fee
AdditionalFeeWaiverSchema.index(
  { studentId: 1, additionalFeeId: 1 },
  { unique: true }
);

export const getAdditionalFeeWaiverModel = (connection) => {
  return (
    connection.models.AdditionalFeeWaiver ||
    connection.model("AdditionalFeeWaiver", AdditionalFeeWaiverSchema)
  );
};
