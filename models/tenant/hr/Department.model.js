import mongoose from "mongoose";

const DepartmentSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique department name per tenant DB
DepartmentSchema.index({ name: 1 }, { unique: true });

export const getDepartmentModel = (connection) => {
  return connection.models.HRDepartment ||
    connection.model("HRDepartment", DepartmentSchema);
};
