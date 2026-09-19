import mongoose from "mongoose";

const MedicineBrandSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true, unique: true },
    manufacturer: { type: String, trim: true, default: "" },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

MedicineBrandSchema.index({ name: 1 });

export default mongoose.model("MedicineBrand", MedicineBrandSchema);
