import mongoose from "mongoose";

/**
 * FreeTrialPackage
 *
 * Admin yahan se dynamic free trial packages manage karta hai.
 * Jab bhi koi school create hoti hai, system "isDefault: true" wala
 * active package use karta hai (hardcoded 30-day trial ki jagah).
 *
 * Rules:
 *  - Sirf EK package isDefault: true ho sakta hai — pre-save hook enforce karega.
 *  - isActive: false packages assign nahi honge.
 *  - Admin "eligibleOnce: true" set kare toh ek user ko woh package sirf ek baar milega.
 */
const FreeTrialPackageSchema = new mongoose.Schema(
    {
        name: {
            type:     String,
            required: true,
            trim:     true,
            unique:   true,
        },

        description: {
            type: String,
            trim: true,
        },

        // Trial duration in days
        durationDays: {
            type:     Number,
            required: true,
            min:      1,
        },

        // Student enrollment cap during trial
        studentLimit: {
            type:    Number,
            default: 350,
            min:     1,
        },

        // Feature list (display only)
        features: [String],

        // Only one package should be default at a time
        isDefault: {
            type:    Boolean,
            default: false,
        },

        // If true: a user/school who already received this package won't get it again
        eligibleOnce: {
            type:    Boolean,
            default: true,
        },

        isActive: {
            type:    Boolean,
            default: true,
        },

        // Audit
        createdBy: {
            type: String,
            default: "admin",
        },

        updatedBy: {
            type: String,
            default: "admin",
        },
    },
    { timestamps: true }
);

/* ── Ensure only one default package at a time ────────────────── */
FreeTrialPackageSchema.pre("save", async function (next) {
    if (this.isModified("isDefault") && this.isDefault) {
        // Clear isDefault on all OTHER packages
        await this.constructor.updateMany(
            { _id: { $ne: this._id }, isDefault: true },
            { $set: { isDefault: false } }
        );
    }
    next();
});

export default mongoose.model("FreeTrialPackage", FreeTrialPackageSchema);
