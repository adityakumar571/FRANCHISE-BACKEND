import mongoose from "mongoose";

const StudentPaymentSchema = new mongoose.Schema(
  {
    /* ================= WHO COLLECTED ================= */
    clerkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /* ================= CONTEXT ================= */
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
      required: true,
    },

    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
      default: null,
    },

    /* ================= AMOUNT ================= */
    amountPaid: {
      type: Number,
      required: true,
    },

    /* ================= PAYMENT INFO ================= */
    paymentMode: {
      type: String,
      enum: ["CASH", "ONLINE", "CHEQUE", "UPI"],
      required: true,
    },

    paymentType: {
      type: String,
      enum: ["OFFLINE", "ONLINE"],
      default: "OFFLINE",
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "CANCELLED"],
      default: "SUCCESS",
    },

    /* ================= GATEWAY (RAZORPAY) ================= */
    gateway: {
      type: String,
    },

    gatewayOrderId: String,
    gatewayPaymentId: String,
    gatewaySignature: String,

    /* ================= META ================= */
    referenceNo: String,

    receiptNo: {
      type: String,
      unique: true,
    },

    remarks: String,

    paymentDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ✅ SAME multi-tenant pattern
export const getStudentPaymentModel = (connection) => {
  return (
    connection.models.StudentPayment ||
    connection.model("StudentPayment", StudentPaymentSchema)
  );
};