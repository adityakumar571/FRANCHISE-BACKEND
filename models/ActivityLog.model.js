import mongoose from "mongoose";

const ActivityLogSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      default: "System",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    action: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      default: "System",
    },
    module: {
      type: String,
      enum: ["Auth", "Franchise", "Billing", "Users", "System", "Subscription", "Settings", "Distributor", "FAQ", "Contact", "Newsletter", "Other"],
      default: "Other",
    },
    type: {
      type: String,
      enum: ["Create", "Update", "Delete", "Login", "Logout", "System", "Other"],
      default: "Other",
    },
    ip: {
      type: String,
      default: "System",
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Index for fast queries
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ type: 1, createdAt: -1 });
ActivityLogSchema.index({ module: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", ActivityLogSchema);
