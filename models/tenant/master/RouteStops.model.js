import mongoose from "mongoose";

const RouteStopSchema = new mongoose.Schema(
  {
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
    },

    stopName: {
      type: String,
      required: true,
    },

    stopOrder: {
      type: Number,
      required: true,
    },

    pickupTime: String,
    dropTime: String,

    // Legacy single fee (kept for backward compat)
    feeAmount: {
      type: Number,
    },

    // Direction-wise fees
    feeHomeToSchool: {
      type: Number,
      default: 0,
    },
    feeSchoolToHome: {
      type: Number,
      default: 0,
    },
    feeBoth: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

/* 🔥 prevent duplicate order */
RouteStopSchema.index(
  { routeId: 1, stopOrder: 1 },
  { unique: true }
);

// ✅ SAME multi-tenant pattern
export const getRouteStopModel = (connection) => {
  return (
    connection.models.RouteStop ||
    connection.model("RouteStop", RouteStopSchema)
  );
};