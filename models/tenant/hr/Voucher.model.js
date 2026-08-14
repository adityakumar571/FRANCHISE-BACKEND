import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    accountHead: { type: mongoose.Schema.Types.ObjectId, ref: "HRAccountHead", required: true },
    amount:      { type: Number, required: true, min: 0.01 },
    remarks:     { type: String, trim: true },
  },
  { _id: false }
);

const VoucherSchema = new mongoose.Schema(
  {
    voucherNumber:     { type: String, unique: true, trim: true },
    voucherDate:       { type: Date, required: true },
    voucherType:       { type: String, enum: ["Income", "Expense"], required: true },
    paymentMode:       { type: String, enum: ["Cash", "Bank Transfer", "UPI", "Cheque", "Other"], default: "Cash" },
    referenceNumber:   { type: String, trim: true },
    remarks:           { type: String, trim: true },
    totalAmount:       { type: Number, required: true, min: 0.01 },
    sourceModule:      { type: String, default: "Manual" },   // Manual / Payroll
    sourceReferenceId: { type: String, trim: true },          // payroll batch ref
    status:            { type: String, enum: ["Active", "Cancelled"], default: "Active" },
    transactions:      { type: [TransactionSchema], required: true, validate: [(v) => v.length >= 1, "Min 1 transaction required"] },
    createdBy:         { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const getVoucherModel = (connection) => {
  return connection.models.HRVoucher ||
    connection.model("HRVoucher", VoucherSchema);
};
