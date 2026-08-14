import mongoose from "mongoose";

const BusSchema = new mongoose.Schema(
  {
    busNumber: { type: String, required: true },
    busName: String,

    driverName: String,
    driverPhone: String,

    conductorName: String,
    conductorPhone: String,

    capacity: {
      type: Number,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ SAME pattern (multi-tenant)
export const getBusModel = (connection) => {
  return (
    connection.models.Bus ||
    connection.model("Bus", BusSchema)
  );
};