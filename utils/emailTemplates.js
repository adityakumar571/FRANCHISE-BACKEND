/**
 * Welcome email sent when someone subscribes to newsletter
 */
export const welcomeNewsletterTemplate = (email) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to School CloudX</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0040a0,#0ea5e9);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                School CloudX
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
                Smart School Management Platform
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px;font-weight:700;">
                You're subscribed! 🎉
              </h2>
              <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.7;">
                Thank you for subscribing to School CloudX updates. You'll now receive:
              </p>

              <!-- Feature list -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
                ${[
                  ["📢", "Product updates & new features"],
                  ["💡", "School management tips & best practices"],
                  ["🎁", "Exclusive offers and early access"],
                  ["📊", "Industry insights for school administrators"],
                ].map(([icon, text]) => `
                <tr>
                  <td style="padding:8px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:36px;height:36px;background:#f0f7ff;border-radius:8px;text-align:center;vertical-align:middle;font-size:18px;">${icon}</td>
                        <td style="padding-left:12px;color:#334155;font-size:14px;vertical-align:middle;">${text}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join('')}
              </table>

              <p style="margin:0 0 28px;color:#475569;font-size:14px;line-height:1.7;">
                We respect your inbox — expect only valuable content, no spam.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#0040a0,#0ea5e9);border-radius:10px;">
                    <a href="${process.env.SCHOOL_APP_BASE_URL || 'https://schoolcloudx.com'}"
                       style="display:inline-block;padding:13px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
                      Visit School CloudX →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Unsubscribe footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                You're receiving this because <strong>${email}</strong> subscribed on our website.<br/>
                © ${new Date().getFullYear()} School CloudX. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * Bulk newsletter template — used when admin sends campaign
 * @param {string} subject
 * @param {string} bodyHtml  - admin ke type kiye hue content ka HTML
 */
export const bulkNewsletterTemplate = (subject, bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0040a0,#0ea5e9);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">School CloudX</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Newsletter</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 20px;color:#1e293b;font-size:20px;font-weight:700;">${subject}</h2>
              <div style="color:#475569;font-size:15px;line-height:1.8;">
                ${bodyHtml}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                © ${new Date().getFullYear()} School CloudX. All rights reserved.<br/>
                You are receiving this because you subscribed to our newsletter.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
