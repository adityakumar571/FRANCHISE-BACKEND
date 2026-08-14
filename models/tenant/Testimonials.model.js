import mongoose from "mongoose";

const testimonialsSchema = new mongoose.Schema(
  {
    title: String,
    discription: String,
    rating: Number,
    profileImage: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const getTestimonialsModel = (connection) => {
  return connection.models.Testimonials ||
    connection.model("Testimonials", testimonialsSchema);
};
