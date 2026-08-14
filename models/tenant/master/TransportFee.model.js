import mongoose from "mongoose";

const TransportFeeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrolment",
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
    },
    stopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStop",
    },
    transportType: {
      type: String,
      enum: ["HOME_TO_SCHOOL", "SCHOOL_TO_HOME", "BOTH"],
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
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate per student per period per session
TransportFeeSchema.index(
  { studentId: 1, sessionId: 1, period: 1 },
  { unique: true }
);

// ✅ SAME multi-tenant pattern
export const getTransportFeeModel = (connection) => {
  return (
    connection.models.TransportFee ||
    connection.model("TransportFee", TransportFeeSchema)
  );
};