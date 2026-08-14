import ContactInquiry from "../models/ContactInquiry.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";

// =====================================================
// CREATE CONTACT INQUIRY  (Public — no auth required)
// =====================================================
const createContactInquiry = asyncHandler(async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json(
            new apiResponse(400, null, "Name, email, and message are required")
        );
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json(
            new apiResponse(400, null, "Invalid email address")
        );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Duplicate check — same email within last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recent = await ContactInquiry.findOne({
        email:     normalizedEmail,
        createdAt: { $gte: fiveMinutesAgo },
    });

    if (recent) {
        return res.status(429).json(
            new apiResponse(429, null, "You already sent a message recently. Please wait a few minutes before sending again.")
        );
    }

    const inquiry = await ContactInquiry.create({
        name:    name.trim(),
        email:   normalizedEmail,
        message: message.trim(),
    });

    return res.status(201).json(
        new apiResponse(201, inquiry, "Your message has been sent successfully")
    );
});

// =====================================================
// GET ALL CONTACT INQUIRIES  (Admin)
// =====================================================
const getAllContactInquiries = asyncHandler(async (req, res) => {
    const {
        page   = 1,
        limit  = 10,
        status,
        search = "",
    } = req.query;

    const filter = {};

    if (status) filter.status = status;

    if (search) {
        filter.$or = [
            { name:    { $regex: search.trim(), $options: "i" } },
            { email:   { $regex: search.trim(), $options: "i" } },
            { message: { $regex: search.trim(), $options: "i" } },
        ];
    }

    const total = await ContactInquiry.countDocuments(filter);

    const inquiries = await ContactInquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit));

    return res.status(200).json(
        new apiResponse(
            200,
            {
                inquiries,
                total,
                totalPages:  Math.ceil(total / Number(limit)),
                currentPage: Number(page),
            },
            "Contact inquiries fetched successfully"
        )
    );
});

// =====================================================
// UPDATE CONTACT INQUIRY STATUS  (Admin)
// =====================================================
const updateContactStatus = asyncHandler(async (req, res) => {
    const { id }     = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "REVIEWED", "RESOLVED"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json(
            new apiResponse(400, null, "Invalid status value")
        );
    }

    const inquiry = await ContactInquiry.findByIdAndUpdate(
        id,
        { status },
        { new: true }
    );

    if (!inquiry) {
        return res.status(404).json(
            new apiResponse(404, null, "Inquiry not found")
        );
    }

    return res.status(200).json(
        new apiResponse(200, inquiry, "Inquiry status updated successfully")
    );
});

// =====================================================
// DELETE CONTACT INQUIRY  (Admin)
// =====================================================
const deleteContactInquiry = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const inquiry = await ContactInquiry.findByIdAndDelete(id);

    if (!inquiry) {
        return res.status(404).json(
            new apiResponse(404, null, "Inquiry not found")
        );
    }

    return res.status(200).json(
        new apiResponse(200, inquiry, "Inquiry deleted successfully")
    );
});

export {
    createContactInquiry,
    getAllContactInquiries,
    updateContactStatus,
    deleteContactInquiry,
};
