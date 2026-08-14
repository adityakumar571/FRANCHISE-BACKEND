import mongoose from "mongoose";

const categoryMasterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    description: {
      type: String,
      trim: true
    },
    status: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

// ✅ SAME multi-tenant pattern
export const getCategoryMasterModel = (connection) => {
  return (
    connection.models.CategoryMaster ||
    connection.model("CategoryMaster", categoryMasterSchema)
  );
};