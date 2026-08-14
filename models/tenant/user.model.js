import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const UserSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
        },

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

        role: {
            type: String,
            enum: [
                "User",
                "Student",
                "Admin",
                "SuperAdmin",
                "Teacher",
                "Accountant",
                "HRManager",   // HR module — can edit staff, approve leave, generate payroll
                "HRStaff",     // HR module — can add staff, enter attendance, view reports
            ],
            default: "User",
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

        address: {
            type: String,
            trim: true,
        },

        password: {
            type: String,
        },

        fcmToken: {
            type: String,
        },

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
        {
            userId: this._id,
            role: this.role,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRE || "30d",
        }
    );
};


export const getUserModel = (connection) => {
    // Use existing model if already registered with the correct schema
    // (model name "User" must match the schema that includes HRManager/HRStaff roles)
    try {
        return connection.model("User");
    } catch {
        return connection.model("User", UserSchema);
    }
};