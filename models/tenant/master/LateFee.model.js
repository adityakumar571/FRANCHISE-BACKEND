import mongoose from "mongoose";

const LateFeeSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrolment",
      required: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
    },

    // The tuition installment this late fee is for
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    referenceType: {
      type: String,
      default: "TUITION",
    },

    period: {
      type: String,
      required: true,
    },

    // Calculated fine amount
    amount: {
      type: Number,
      required: true,
    },

    // How much has been paid (tracked via StudentPaymentAllocation)
    paidAmount: {
      type: Number,
      default: 0,
    },

    isWaived: {
      type: Boolean,
      default: false,
    },

    // Partial waiver — how much amount is waived (0 = no waiver, equal to amount = full waiver)
    waivedAmount: {
      type: Number,
      default: 0,
    },

    waivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    waiverReason: {
      type: String,
      default: null,
    },

    waivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Unique: one late fee record per student per installment
LateFeeSchema.index({ studentId: 1, referenceId: 1 }, { unique: true });

export const getLateFeeModel = (connection) => {
  return (
    connection.models.LateFee ||
    connection.model("LateFee", LateFeeSchema)
  );
};
