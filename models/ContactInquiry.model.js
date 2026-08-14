import mongoose from "mongoose";

const contactInquirySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "REVIEWED", "RESOLVED"],
            default: "PENDING",
        },
    },
    { timestamps: true }
);

const ContactInquiry = mongoose.model("ContactInquiry", contactInquirySchema);
export default ContactInquiry;
