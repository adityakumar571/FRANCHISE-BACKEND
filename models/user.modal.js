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
    name: String,
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
    role: {
      type: String,
      enum: ["Admin", "SuperAdmin"],
      default: "Admin",
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    profilePic: String,
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
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
  },
  { timestamps: true },
);

// 🔐 JWT TOKEN
UserSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      userId: this._id,
      role: this.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || "30d",
    },
  );
};

export default mongoose.model("User", UserSchema);
