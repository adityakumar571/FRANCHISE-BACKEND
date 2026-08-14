import mongoose from "mongoose";

const newsletterSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            unique: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

const Newsletter = mongoose.model("Newsletter", newsletterSchema);
export default Newsletter;
