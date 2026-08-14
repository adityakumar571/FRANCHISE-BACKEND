import mongoose from "mongoose";

const TransportFeeWaiverSchema = new mongoose.Schema(
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

    // The specific TransportFee record being waived (per student per period)
    transportFeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportFee",
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

    // Denormalized for fast reporting
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

    // true when waivedAmount >= amount (fully waived)
    isWaived: {
      type: Boolean,
      default: false,
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

// One waiver record per student per transport fee record
TransportFeeWaiverSchema.index(
  { studentId: 1, transportFeeId: 1 },
  { unique: true }
);

export const getTransportFeeWaiverModel = (connection) => {
  return (
    connection.models.TransportFeeWaiver ||
    connection.model("TransportFeeWaiver", TransportFeeWaiverSchema)
  );
};
