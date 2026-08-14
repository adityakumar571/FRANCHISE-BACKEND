import mongoose from "mongoose";

const SalaryStructureSchema = new mongoose.Schema(
  {
    staff:           { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    effectiveFrom:   { type: Date, required: true },
    basicSalary:     { type: Number, required: true, min: 1 },
    allowance:       { type: Number, default: 0 },
    fixedDeduction:  { type: Number, default: 0 },
    grossSalary:     { type: Number, required: true }, // basicSalary + allowance - fixedDeduction
    status:          { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

// Only one Active structure per staff at a time
SalaryStructureSchema.index({ staff: 1, effectiveFrom: -1 });

export const getSalaryStructureModel = (connection) => {
  return connection.models.HRSalaryStructure ||
    connection.model("HRSalaryStructure", SalaryStructureSchema);
};
