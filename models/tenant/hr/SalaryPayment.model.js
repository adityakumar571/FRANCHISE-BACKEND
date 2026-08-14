import mongoose from "mongoose";

const SalaryPaymentSchema = new mongoose.Schema(
  {
    payroll:              { type: mongoose.Schema.Types.ObjectId, ref: "HRPayroll", required: true },
    staff:                { type: mongoose.Schema.Types.ObjectId, ref: "HRStaff", required: true },
    salaryMonth:          { type: String, required: true },
    paymentDate:          { type: Date, required: true },
    paymentMode:          { type: String, enum: ["Cash", "Bank Transfer", "UPI", "Cheque", "Other"], required: true },
    paidAmount:           { type: Number, required: true, min: 1 },
    transactionReference: { type: String, trim: true },
    remarks:              { type: String, trim: true },
  },
  { timestamps: true }
);

export const getSalaryPaymentModel = (connection) => {
  return connection.models.HRSalaryPayment ||
    connection.model("HRSalaryPayment", SalaryPaymentSchema);
};
