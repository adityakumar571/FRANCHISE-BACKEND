import nodemailer from "nodemailer";

/**
 * Send lead notification email to marketing team
 * Triggered when a new school registers as a lead from the website
 */
export const sendLeadNotification = async ({
    contactName,
    email,
    mobileNo,
    whatsappNo,
    subdomain,
    source = "website",
    registrationId,
}) => {
    try {
        const MARKETING_EMAIL = process.env.MARKETING_EMAIL || process.env.EMAIL_USER;

        if (!MARKETING_EMAIL) {
            console.warn("MARKETING_EMAIL not set — lead notification skipped");
            return;
        }

        const port = parseInt(process.env.EMAIL_PORT) || 587;
        const transporter = nodemailer.createTransport({
            host:       process.env.EMAIL_HOST || "smtp.gmail.com",
            port,
            secure:     port === 465,
            requireTLS: port === 587,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: { rejectUnauthorized: false },
        });

        const now = new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day:      "2-digit",
            month:    "short",
            year:     "numeric",
            hour:     "2-digit",
            minute:   "2-digit",
            hour12:   true,
        });

        const adminUrl     = `https://admin.schoolcloudx.com/leads`;
        const whatsappLink = `https://wa.me/91${(whatsappNo || mobileNo).replace(/\D/g, "")}`;

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Lead</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; }
    .header { background: #0c3b73; padding: 28px 36px; }
    .logo { font-size: 20px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px; }
    .header-sub { font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 4px; }
    .content { padding: 36px; }
    .title { font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 6px; }
    .timestamp { font-size: 13px; color: #888888; margin-bottom: 28px; }
    .section-label { font-size: 11px; font-weight: 700; color: #888888; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; margin-top: 24px; }
    .section-label:first-of-type { margin-top: 0; }
    .info-block { border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
    .info-row { display: flex; align-items: center; padding: 10px 16px; border-bottom: 1px solid #f0f0f0; }
    .info-row:last-child { border-bottom: none; }
    .lbl { width: 130px; font-size: 13px; color: #888888; flex-shrink: 0; }
    .val { font-size: 13px; color: #1a1a1a; font-weight: 500; }
    .val a { color: #0c3b73; text-decoration: none; font-weight: 600; }
    .val code { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #0c3b73; background: #f0f4ff; padding: 2px 6px; border-radius: 3px; }
    .actions { margin-top: 28px; display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { display: inline-block; padding: 10px 20px; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none; }
    .btn-primary { background: #0c3b73; color: #ffffff; }
    .btn-secondary { background: #ffffff; color: #0c3b73; border: 1px solid #0c3b73; }
    .note { margin-top: 24px; border-top: 1px solid #eeeeee; padding-top: 20px; font-size: 13px; color: #666666; line-height: 1.7; }
    .note strong { color: #1a1a1a; }
    .footer { border-top: 1px solid #e0e0e0; padding: 20px 36px; }
    .footer p { font-size: 12px; color: #aaaaaa; line-height: 1.7; }
    .footer a { color: #0c3b73; text-decoration: none; }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <div class="logo">SchoolCloudX</div>
    <div class="header-sub">Internal — Sales Notification</div>
  </div>

  <div class="content">
    <div class="title">New Lead Registered</div>
    <div class="timestamp">Received on ${now} (IST)</div>

    <div class="section-label">Contact Details</div>
    <div class="info-block">
      <div class="info-row">
        <span class="lbl">Name</span>
        <span class="val">${contactName}</span>
      </div>
      <div class="info-row">
        <span class="lbl">Email</span>
        <span class="val"><a href="mailto:${email}">${email}</a></span>
      </div>
      <div class="info-row">
        <span class="lbl">Mobile</span>
        <span class="val"><a href="tel:+91${mobileNo}">${mobileNo}</a></span>
      </div>
      <div class="info-row">
        <span class="lbl">WhatsApp</span>
        <span class="val"><a href="${whatsappLink}" target="_blank">${whatsappNo || mobileNo}</a></span>
      </div>
    </div>

    <div class="section-label">Registration Details</div>
    <div class="info-block">
      <div class="info-row">
        <span class="lbl">Subdomain</span>
        <span class="val"><code>${subdomain}.schoolcloudx.com</code></span>
      </div>
      <div class="info-row">
        <span class="lbl">Source</span>
        <span class="val">${source}</span>
      </div>
      <div class="info-row">
        <span class="lbl">Lead ID</span>
        <span class="val" style="font-family:'Courier New',monospace;font-size:12px;color:#888888">${registrationId}</span>
      </div>
    </div>

    <div class="actions">
      <a href="${adminUrl}" class="btn btn-primary" target="_blank">View in Admin Panel</a>
      <a href="${whatsappLink}" class="btn btn-secondary" target="_blank">Open WhatsApp</a>
    </div>

    <div class="note">
      <strong>Follow-up:</strong> Reach out within 30 minutes for best results.
      Introduce the platform and offer assistance with school setup.
    </div>
  </div>

  <div class="footer">
    <p>
      Automated alert from SchoolCloudX. Manage leads at
      <a href="${adminUrl}">Admin Panel</a>.<br/>
      &copy; 2026 SchoolCloudX. All rights reserved.
    </p>
  </div>

</div>
</body>
</html>`;

        const CC_EMAIL = process.env.LEAD_CC_EMAIL || "alinabeelauctech@gmail.com";

        await transporter.sendMail({
            from:    `"SchoolCloudX" <${process.env.EMAIL_USER}>`,
            to:      MARKETING_EMAIL,
            cc:      CC_EMAIL,
            subject: `New Lead: ${contactName} — ${subdomain}.schoolcloudx.com`,
            html,
        });

        console.log(`Lead notification sent to: ${MARKETING_EMAIL}`);

    } catch (err) {
        console.error("Lead notification email failed (non-fatal):", err.message);
    }
};
