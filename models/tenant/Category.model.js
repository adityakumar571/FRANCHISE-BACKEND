import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: String,
    image: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const getCategoryModel = (connection) => {
  return connection.models.Category ||
    connection.model("Category", categorySchema);
};
