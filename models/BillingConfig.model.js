import mongoose from "mongoose";

/**
 * BillingConfig — Admin yahan se pricing rules set karta hai
 * Ye rules change ho sakti hain. Monthly bill generate hote waqt
 * current config ka SNAPSHOT liya jaata hai, taki purane bills affect na hon.
 */
const BillingConfigSchema = new mongoose.Schema(
    {
        // Base charge: 0 to baseStudentLimit students tak flat price
        baseStudentLimit: {
            type: Number,
            default: 350,   // 0–350 students
        },

        basePrice: {
            type: Number,
            default: 1200,  // ₹1200 flat
        },

        // Addon: baseStudentLimit se zyada students ke liye
        addonSlotSize: {
            type: Number,
            default: 50,    // har 50 students pe
        },

        addonSlotPrice: {
            type: Number,
            default: 100,   // ₹100 per 50 students
        },

        // Sirf ek active config hogi — isActive: true wali use hogi
        isActive: {
            type: Boolean,
            default: true,
        },

        // Jo admin ne last update kiya
        updatedBy: {
            type: String,
            default: "system",
        },
    },
    { timestamps: true }
);

export default mongoose.model("BillingConfig", BillingConfigSchema);
