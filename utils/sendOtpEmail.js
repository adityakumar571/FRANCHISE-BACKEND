import nodemailer from "nodemailer";

/**
 * Send OTP email to school during self-registration
 */
export const sendOtpEmail = async ({ to, schoolName, otp }) => {
    try {
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

        const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Email Verification</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 40px 16px; }
    .wrapper { max-width: 520px; margin: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; }
    .header { background: #0c3b73; padding: 28px 36px; }
    .logo { font-size: 20px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px; }
    .content { padding: 36px; }
    .title { font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
    .desc { font-size: 14px; line-height: 1.7; color: #555555; margin-bottom: 28px; }
    .hl { color: #0c3b73; font-weight: 600; }
    .otp-block { border: 1px solid #e0e0e0; border-radius: 4px; padding: 24px; text-align: center; margin-bottom: 24px; background: #fafafa; }
    .otp-label { font-size: 11px; font-weight: 700; color: #888888; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 14px; }
    .otp-code { font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #0c3b73; font-family: 'Courier New', Courier, monospace; }
    .otp-note { font-size: 13px; color: #888888; margin-top: 12px; }
    .notice { font-size: 13px; color: #666666; line-height: 1.7; border-top: 1px solid #eeeeee; padding-top: 20px; }
    .footer { border-top: 1px solid #e0e0e0; padding: 20px 36px; }
    .footer p { font-size: 12px; color: #aaaaaa; line-height: 1.7; }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <div class="logo">SchoolCloudX</div>
  </div>

  <div class="content">
    <div class="title">Verify Your Email Address</div>
    <div class="desc">
      Hello <span class="hl">${schoolName}</span>,<br/><br/>
      Thank you for registering with SchoolCloudX. Please use the verification
      code below to complete your registration.
    </div>

    <div class="otp-block">
      <div class="otp-label">Verification Code</div>
      <div class="otp-code">${otp}</div>
      <div class="otp-note">Valid for 10 minutes. Do not share this code.</div>
    </div>

    <div class="notice">
      If you did not initiate this registration, you can safely ignore this email.
      No account will be created without completing this step.
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
            subject: `${otp} is your SchoolCloudX verification code`,
            html:    htmlTemplate,
        });

        console.log(`OTP email sent to ${to}`);
    } catch (error) {
        console.error("OTP email error:", error.message);
        throw new Error(`Failed to send OTP email: ${error.message}`);
    }
};
