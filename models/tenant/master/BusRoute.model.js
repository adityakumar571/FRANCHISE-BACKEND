import mongoose from "mongoose";

const BusRouteSchema = new mongoose.Schema(
  {
    busId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
    },

    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
    },

    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getBusRouteModel = (connection) => {
  return (
    connection.models.BusRoute ||
    connection.model("BusRoute", BusRouteSchema)
  );
};