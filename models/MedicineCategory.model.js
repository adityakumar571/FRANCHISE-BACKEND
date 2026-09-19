import mongoose from "mongoose";

const MedicineCategorySchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true, unique: true },
    type:     { type: String, trim: true, default: "Therapeutic",
                enum: ["Therapeutic", "OTC", "Controlled", "Surgical", "Ayurvedic", "Other"] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MedicineCategorySchema.index({ name: 1 });

export default mongoose.model("MedicineCategory", MedicineCategorySchema);
