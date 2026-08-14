import mongoose from "mongoose";

const installmentTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "CUSTOM_10"],
      required: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,

    },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getInstallmentTypeModel = (connection) => {
  return (
    connection.models.InstallmentType ||
    connection.model("InstallmentType", installmentTypeSchema)
  );
};