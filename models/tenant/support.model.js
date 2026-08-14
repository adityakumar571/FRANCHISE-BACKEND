import mongoose from "mongoose";

const supportSchema = new mongoose.Schema(
    {
        // ✅ Unique Ticket Number
        ticketNo: {
            type: String,
            unique: true,
        },

        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "School",
            required: false,  // tenant middleware se pehle mount hai, req.tenant available nahi
        },

        route: {
            type: String,
            default: "",
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            required: true,
            trim: true,
        },

        attachment: {
            type: String, // cloudinary url
            default: "",
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        createdByRole: {
            type: String,
            enum: [
                "User",
                "Student",
                "Admin",
                "SuperAdmin",
                "Teacher",
                "Accountant",
            ],
        },

        status: {
            type: String,
            enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
            default: "OPEN",
        },

        adminReply: {
            type: String,
            default: "",
        },

        resolvedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// ✅ AUTO GENERATE TICKET NUMBER
supportSchema.pre("save", async function (next) {
    if (!this.ticketNo) {

    

        const random = Math.floor(1000 + Math.random() * 9000);

        this.ticketNo = `CDX-${random}`;
    }

    next();
});

export default mongoose.model("Support", supportSchema);