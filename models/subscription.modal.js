import mongoose from "mongoose";

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    planType: {
      type: String,
      default: "Plan",
    },
    description: {
      type: String,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    billingCycle: {
      type: String,
      enum: ["Monthly", "Yearly", "Quarterly", "Half-Yearly"],
      default: "Monthly",
    },
    trialDays: {
      type: Number,
      default: 0,
    },
    features: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    pricingModel: {
      type: String,
      enum: ["FIXED", "VARIABLE"],
      default: "FIXED",
    },
    pricePerStudent: {
      type: Number,
    },
    minStudents: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ||
  mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);

export default SubscriptionPlan;
