import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema(
    {
        sessionName: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        isCurrent: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        order: {
            type: Number,
            default: 0,
        },

        // ─── Transport Vacation Rules (embedded — no separate collection needed) ───
        // School-level: applies to ALL transport students in this session
        // Class-level : applies only to listed classIds
        // Priority: student-level > class-level > school-level
        transportVacations: {
            type: [
                {
                    level: {
                        type: String,
                        enum: ["SCHOOL", "CLASS"],
                        required: true,
                    },
                    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
                    months: { type: [String], default: [] },   // e.g. ["JUNE","JULY"]
                    reason: { type: String, default: "" },
                    isActive: { type: Boolean, default: true },
                    createdAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);


export const getSessionModel = (connection) => {
    return (
        connection.models.Session ||
        connection.model("Session", SessionSchema)
    );
};