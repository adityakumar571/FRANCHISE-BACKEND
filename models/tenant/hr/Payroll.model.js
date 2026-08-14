import mongoose from "mongoose";

const PayrollSchema = new mongoose.Schema(
  {
    salaryMonth:    { type: String, required: true },          // "YYYY-MM"
    staff:          { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    monthlySalary:  { type: Number, required: true },
    presentDays:    { type: Number, default: 0 },
    absentDays:     { type: Number, default: 0 },
    paidLeave:      { type: Number, default: 0 },
    unpaidLeave:    { type: Number, default: 0 },
    extraEarning:   { type: Number, default: 0 },
    absentDeduction:{ type: Number, default: 0 },
    leaveDeduction: { type: Number, default: 0 },
    advanceDeduction:{ type: Number, default: 0 },
    otherDeduction: { type: Number, default: 0 },
    totalDeduction: { type: Number, default: 0 },
    netSalary:      { type: Number, required: true },
    paymentStatus:  { type: String, enum: ["Unpaid", "Paid", "Partially Paid", "On Hold"], default: "Unpaid" },
    remarks:        { type: String, trim: true },
    generatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// No duplicate salary per staff per month
PayrollSchema.index({ staff: 1, salaryMonth: 1 }, { unique: true });

export const getPayrollModel = (connection) => {
  return connection.models.HRPayroll ||
    connection.model("HRPayroll", PayrollSchema);
};
