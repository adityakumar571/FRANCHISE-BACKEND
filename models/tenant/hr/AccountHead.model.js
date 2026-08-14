import mongoose from "mongoose";

const AccountHeadSchema = new mongoose.Schema(
  {
    accountName: { type: String, required: true, trim: true },
    accountType: { type: String, enum: ["Income", "Expense"], required: true },
    description: { type: String, trim: true },
    status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

AccountHeadSchema.index({ accountName: 1, accountType: 1 }, { unique: true });

export const getAccountHeadModel = (connection) => {
  return connection.models.HRAccountHead ||
    connection.model("HRAccountHead", AccountHeadSchema);
};
