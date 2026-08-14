import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
    {
        examName: {
            type: String,
            required: true,
            trim: true,
            unique: true, // unchanged
        },
        session: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Session",
            required: true,
        },
        category: {
            type: String,
            enum: ["EXAM", "TEST"],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        order: { type: Number, default: 0 },
    },
    {
        timestamps: true,
    }
);

// ✅ just like Session model
export const getExamModel = (connection) => {
    return (
        connection.models.ExamMaster ||
        connection.model("ExamMaster", ExamSchema)
    );
};