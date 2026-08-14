import mongoose from "mongoose";

const RouteSchema = new mongoose.Schema(
  {
    routeName: { type: String, required: true },
    routeCode: String,

    startLocation: String,
    endLocation: String,

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getRouteModel = (connection) => {
  return (
    connection.models.Route ||
    connection.model("Route", RouteSchema)
  );
};