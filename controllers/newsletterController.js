import Newsletter from "../models/Newsletter.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { sendMail, sendBulkMail } from "../utils/mailer.js";
import { welcomeNewsletterTemplate, bulkNewsletterTemplate } from "../utils/emailTemplates.js";

// =====================================================
// SUBSCRIBE  (Public — no auth required)
// Auto-sends welcome email on new subscription
// =====================================================
const subscribe = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json(
            new apiResponse(400, null, "Email is required")
        );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json(
            new apiResponse(400, null, "Invalid email address")
        );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Already subscribed?
    const existing = await Newsletter.findOne({ email: normalizedEmail });

    if (existing) {
        if (!existing.isActive) {
            existing.isActive = true;
            await existing.save();

            // Re-subscription welcome
            sendMail({
                to:      normalizedEmail,
                subject: "Welcome back to School CloudX Newsletter!",
                html:    welcomeNewsletterTemplate(normalizedEmail),
            }).catch(err => console.error("Welcome email failed:", err.message));

            return res.status(200).json(
                new apiResponse(200, existing, "Welcome back! You've been re-subscribed.")
            );
        }
        return res.status(200).json(
            new apiResponse(200, existing, "You are already subscribed!")
        );
    }

    const subscriber = await Newsletter.create({ email: normalizedEmail });

    // Send welcome email (non-blocking — don't fail the request if email fails)
    sendMail({
        to:      normalizedEmail,
        subject: "Welcome to School CloudX Newsletter!",
        html:    welcomeNewsletterTemplate(normalizedEmail),
    }).catch(err => console.error("Welcome email failed:", err.message));

    return res.status(201).json(
        new apiResponse(201, subscriber, "Successfully subscribed to newsletter")
    );
});

// =====================================================
// UNSUBSCRIBE  (Public)
// =====================================================
const unsubscribe = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json(
            new apiResponse(400, null, "Email is required")
        );
    }

    const subscriber = await Newsletter.findOneAndUpdate(
        { email: email.trim().toLowerCase() },
        { isActive: false },
        { new: true }
    );

    if (!subscriber) {
        return res.status(404).json(
            new apiResponse(404, null, "Email not found in our subscription list")
        );
    }

    return res.status(200).json(
        new apiResponse(200, null, "You have been unsubscribed successfully")
    );
});

// =====================================================
// SEND BULK NEWSLETTER  (Admin only)
// Body: { subject, message }
// message = plain text ya basic HTML
// =====================================================
const sendNewsletter = asyncHandler(async (req, res) => {
    const { subject, message } = req.body;

    if (!subject || !message) {
        return res.status(400).json(
            new apiResponse(400, null, "Subject and message are required")
        );
    }

    // Fetch all active subscribers
    const subscribers = await Newsletter.find({ isActive: true }).select("email").lean();

    if (subscribers.length === 0) {
        return res.status(400).json(
            new apiResponse(400, null, "No active subscribers found")
        );
    }

    const emails = subscribers.map(s => s.email);

    // Convert plain text newlines to <br> for HTML
    const bodyHtml = message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");

    const html = bulkNewsletterTemplate(subject, bodyHtml);

    const { sent, failed, errors } = await sendBulkMail(emails, subject, html);

    return res.status(200).json(
        new apiResponse(
            200,
            { total: emails.length, sent, failed, errors },
            `Newsletter sent to ${sent} subscriber(s)${failed > 0 ? `, ${failed} failed` : ""}`
        )
    );
});

// =====================================================
// GET ALL SUBSCRIBERS  (Admin)
// =====================================================
const getAllSubscribers = asyncHandler(async (req, res) => {
    const {
        page     = 1,
        limit    = 20,
        isActive,
        search   = "",
    } = req.query;

    const filter = {};

    if (isActive !== undefined) {
        filter.isActive = isActive === "true";
    }

    if (search) {
        filter.email = { $regex: search.trim(), $options: "i" };
    }

    const total = await Newsletter.countDocuments(filter);

    const subscribers = await Newsletter.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit));

    return res.status(200).json(
        new apiResponse(
            200,
            {
                subscribers,
                total,
                totalPages:  Math.ceil(total / Number(limit)),
                currentPage: Number(page),
            },
            "Subscribers fetched successfully"
        )
    );
});

// =====================================================
// DELETE SUBSCRIBER  (Admin)
// =====================================================
const deleteSubscriber = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subscriber = await Newsletter.findByIdAndDelete(id);

    if (!subscriber) {
        return res.status(404).json(
            new apiResponse(404, null, "Subscriber not found")
        );
    }

    return res.status(200).json(
        new apiResponse(200, subscriber, "Subscriber deleted successfully")
    );
});

export {
    subscribe,
    unsubscribe,
    sendNewsletter,
    getAllSubscribers,
    deleteSubscriber,
};
