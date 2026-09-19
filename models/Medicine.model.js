import mongoose from "mongoose";

const MedicineSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    generic:   { type: String, trim: true, default: "" },
    brand:     { type: String, trim: true, default: "" },
    strength:  { type: String, trim: true, default: "" },
    form:      { type: String, trim: true, default: "Tablet",
                 enum: ["Tablet","Capsule","Syrup","Injection","Cream","Ointment","Drops","Suspension","Gel","Powder","Other"] },
    pack:      { type: String, trim: true, default: "" },
    unit:      { type: String, trim: true, default: "" },
    hsn:       { type: String, trim: true, default: "3004" },
    gst:       { type: String, trim: true, default: "12" },
    barcode:   { type: String, trim: true, default: "" },
    category:  { type: String, trim: true, default: "" },
    controlled:{ type: Boolean, default: false },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

MedicineSchema.index({ name: "text", generic: "text", barcode: 1 });
MedicineSchema.index({ isActive: 1 });
MedicineSchema.index({ category: 1 });

export default mongoose.model("Medicine", MedicineSchema);
