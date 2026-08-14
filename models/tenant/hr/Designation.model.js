import mongoose from "mongoose";

const DesignationSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "HRDepartment" },
    staffType:  { type: String, enum: ["Teaching", "Non-Teaching"], default: "Non-Teaching" },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const getDesignationModel = (connection) => {
  return connection.models.HRDesignation ||
    connection.model("HRDesignation", DesignationSchema);
};
