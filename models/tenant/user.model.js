import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const UserSchema = new mongoose.Schema(
    {
        phone: { type: String },

        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        otp: String,
        otpExpiration: Date,

        isNew: {
            type: Boolean,
            default: true,
            required: true,
        },

        name: String,

        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
        },

        // ── Role is now a free-form string — managed via Role master ──
        role: {
            type: String,
            default: "Staff",
            required: true,
        },

        dob: Date,
        age: Number,

        email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
        },

        profilePic: String,
        address:    { type: String, trim: true },
        password:   { type: String },
        fcmToken:   { type: String },

        isActive: {
            type: Boolean,
            default: true,
        },

        lastLogin: Date,
    },
    { timestamps: true }
);

UserSchema.methods.generateAuthToken = function () {
    return jwt.sign(
        { userId: this._id, role: this.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || "30d" }
    );
};

export const getUserModel = (connection) => {
    try {
        return connection.model("User");
    } catch {
        return connection.model("User", UserSchema);
    }
};
