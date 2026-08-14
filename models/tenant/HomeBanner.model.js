import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    bannerImage: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const getBannerModel = (connection) => {
  return connection.models.Banner ||
    connection.model("Banner", bannerSchema);
};
