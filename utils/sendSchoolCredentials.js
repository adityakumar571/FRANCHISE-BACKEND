import nodemailer from "nodemailer";

export const sendSchoolCredentials = async ({
    to,
    schoolName,
    schoolSubdomain,
    superAdminUserId,
    superAdminPassword,
    adminUserId,
    adminPassword,
}) => {
    try {
        const secureSubdomain = schoolSubdomain?.trim()
            ? schoolSubdomain.trim().toLowerCase()
            : "main";

        const baseUrl  = (process.env.SCHOOL_APP_BASE_URL || "").trim();
        const loginUrl = baseUrl && baseUrl.includes("localhost")
            ? `${baseUrl}/${secureSubdomain}`
            : `https://${secureSubdomain}.schoolcloudx.com`;

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

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>School Portal Credentials</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; }
    .header { background: #0c3b73; padding: 28px 36px; }
    .logo { font-size: 20px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px; }
    .header-sub { font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 4px; }
    .content { padding: 36px; }
    .title { font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 10px; }
    .desc { font-size: 14px; line-height: 1.7; color: #555555; margin-bottom: 28px; }
    .hl { color: #0c3b73; font-weight: 600; }
    .section-label { font-size: 11px; font-weight: 700; color: #888888; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; }
    .cred-block { border: 1px solid #e0e0e0; border-radius: 4px; padding: 18px 20px; margin-bottom: 16px; background: #fafafa; }
    .cred-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #eeeeee; }
    .cred-row:last-child { border-bottom: none; padding-bottom: 0; }
    .cred-row:first-child { padding-top: 0; }
    .lbl { width: 100px; font-size: 13px; color: #888888; flex-shrink: 0; }
    .val { font-size: 14px; font-weight: 600; font-family: 'Courier New', Courier, monospace; color: #0c3b73; }
    .btn-wrap { margin: 28px 0 16px; }
    .btn { display: inline-block; background: #0c3b73; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-size: 14px; font-weight: 600; }
    .portal-url { font-size: 13px; color: #888888; margin-top: 10px; }
    .portal-url a { color: #0c3b73; text-decoration: none; }
    .security { margin-top: 28px; border-top: 1px solid #eeeeee; padding-top: 20px; font-size: 13px; color: #666666; line-height: 1.7; }
    .security strong { color: #1a1a1a; }
    .footer { border-top: 1px solid #e0e0e0; padding: 20px 36px; }
    .footer p { font-size: 12px; color: #aaaaaa; line-height: 1.7; }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <div class="logo">SchoolCloudX</div>
    <div class="header-sub">School Management Platform</div>
  </div>

  <div class="content">
    <div class="title">Your School Portal is Ready</div>
    <div class="desc">
      Hello,<br/><br/>
      Your workspace for <span class="hl">${schoolName}</span> has been successfully created.
      Below are the login credentials for your administrative accounts.
    </div>

    <div class="section-label">Super Admin Account</div>
    <div class="cred-block">
      <div class="cred-row">
        <span class="lbl">User ID</span>
        <span class="val">${superAdminUserId}</span>
      </div>
      <div class="cred-row">
        <span class="lbl">Password</span>
        <span class="val">${superAdminPassword}</span>
      </div>
    </div>

    <div class="section-label">School Admin Account</div>
    <div class="cred-block">
      <div class="cred-row">
        <span class="lbl">User ID</span>
        <span class="val">${adminUserId}</span>
      </div>
      <div class="cred-row">
        <span class="lbl">Password</span>
        <span class="val">${adminPassword}</span>
      </div>
    </div>

    <div class="btn-wrap">
      <a href="${loginUrl}" target="_blank" class="btn">Open School Dashboard</a>
    </div>
    <div class="portal-url">
      Portal URL: <a href="${loginUrl}" target="_blank">${loginUrl}</a>
    </div>

    <div class="security">
      <strong>Security note:</strong> Please change your passwords immediately after your first login.
      Do not share these credentials with anyone.
    </div>
  </div>

  <div class="footer">
    <p>This is an automated message from SchoolCloudX. Please do not reply to this email.<br/>
    &copy; 2026 SchoolCloudX. All rights reserved.</p>
  </div>

</div>
</body>
</html>`;

        await transporter.sendMail({
            from:    `"SchoolCloudX" <${process.env.EMAIL_USER}>`,
            to,
            subject: `Your School Portal Credentials — ${schoolName}`,
            html,
        });

        console.log(`Credentials email sent to ${to}`);

    } catch (error) {
        console.error("sendSchoolCredentials error:", error.message);
        throw new Error(`Failed to send credentials email: ${error.message}`);
    }
};
