import mongoose from "mongoose";

const StudentPaymentAllocationSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentPayment",
      required: true,
    },

    // LATE_FEE added — referenceId points to LateFee._id
    feeType: {
      type: String,
      enum: ["TUITION", "ADDITIONAL", "TRANSPORT", "LATE_FEE"],
      required: true,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    allocatedAmount: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

export const getStudentPaymentAllocationModel = (connection) => {
  return (
    connection.models.StudentPaymentAllocation ||
    connection.model("StudentPaymentAllocation", StudentPaymentAllocationSchema)
  );
};
