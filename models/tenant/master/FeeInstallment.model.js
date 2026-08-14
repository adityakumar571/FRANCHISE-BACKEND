import mongoose from "mongoose";

const FeeInstallmentSchema = new mongoose.Schema(
  {
    feeStructureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure",
      required: true,
    },

    installmentNo: {
      type: Number,
      required: true,
    },

    period: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    remark: String,

    status: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getFeeInstallmentModel = (connection) => {
  return (
    connection.models.FeeInstallment ||
    connection.model("FeeInstallment", FeeInstallmentSchema)
  );
};