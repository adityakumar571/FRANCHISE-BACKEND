import mongoose from "mongoose";

const servicesSchema = new mongoose.Schema(
  {
    name: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const getServicesModel = (connection) => {
  return connection.models.Services ||
    connection.model("Services", servicesSchema);
};
