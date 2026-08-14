import mongoose from "mongoose";

const BusRouteSchema = new mongoose.Schema(
  {
    busId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
    },

    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
    },

    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
    },
  },
  { timestamps: true }
);

// ✅ SAME pattern (multi-tenant)
export const getBusRouteModel = (connection) => {
  return (
    connection.models.BusRoute ||
    connection.model("BusRoute", BusRouteSchema)
  );
};