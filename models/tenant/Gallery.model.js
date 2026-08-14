import mongoose from "mongoose";

const gallerySchema = new mongoose.Schema(
  {
    title: String,
    url: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const getGalleryModel = (connection) => {
  return connection.models.Gallery ||
    connection.model("Gallery", gallerySchema);
};
