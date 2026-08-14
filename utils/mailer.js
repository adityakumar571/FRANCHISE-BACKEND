import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST  || "smtp.gmail.com",
    port:   Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Send a single email
 * @param {object} options - { to, subject, html }
 */
export const sendMail = async ({ to, subject, html }) => {
    return transporter.sendMail({
        from: `"School CloudX" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
    });
};

/**
 * Send bulk emails to an array of addresses
 * Sends individually so each gets a personal email
 * @param {string[]} recipients
 * @param {string}   subject
 * @param {string}   html
 * @returns {{ sent: number, failed: number, errors: string[] }}
 */
export const sendBulkMail = async (recipients, subject, html) => {
    let sent = 0, failed = 0;
    const errors = [];

    for (const to of recipients) {
        try {
            await transporter.sendMail({
                from: `"School CloudX" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html,
            });
            sent++;
        } catch (err) {
            failed++;
            errors.push(`${to}: ${err.message}`);
        }
    }

    return { sent, failed, errors };
};
