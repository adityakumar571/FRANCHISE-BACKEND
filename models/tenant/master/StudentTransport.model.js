import mongoose from "mongoose";

const StudentTransportSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrolment",
    },

    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
    },

    stopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStop",
    },

    pickupType: {
      type: String,
      enum: ["ONE_WAY", "TWO_WAY"],
      default: "TWO_WAY",
    },

    feeAmount: Number,

    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getStudentTransportModel = (connection) => {
  return (
    connection.models.StudentTransport ||
    connection.model("StudentTransport", StudentTransportSchema)
  );
};