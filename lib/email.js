const { Resend } = require("resend");

// Transactional email via Resend. Used by BetterAuth for password reset and
// email verification (see lib/auth.js).
//
// Env:
//   RESEND_API_KEY  — Resend API key
//   EMAIL_FROM      — verified sender, e.g. "Fornetto <noreply@yourdomain.com>".
//                     Falls back to Resend's shared test sender, which only
//                     delivers to your own account email — set a real one before prod.

const FROM = process.env.EMAIL_FROM || "Fornetto <onboarding@resend.dev>";

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

async function sendEmail({ to, subject, html, text }) {
    if (!resend) {
        // Don't crash local dev that hasn't configured email; make it visible.
        console.warn(`[email] RESEND_API_KEY not set — skipping "${subject}" to ${to}`);
        return;
    }
    const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });
    if (error) {
        console.error("[email] Resend send failed:", error);
        throw new Error(`Failed to send email: ${error.message ?? error}`);
    }
}

// Minimal, on-brand HTML. The design system lives in the frontend; these are
// plain transactional emails, so keep them simple and client-safe.
function actionEmail({ heading, body, buttonLabel, url }) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <style>
      @media (max-width:480px) {
        .fx-wrap { padding:16px !important; }
        .fx-card { padding:24px 20px !important; }
        .fx-h1 { font-size:23px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f3f2f2;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f2;">
      <tr><td align="center" class="fx-wrap" style="padding:28px 16px;font-family:Georgia,'Times New Roman',serif;color:#201f1d;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#f3f2f2;border:1px solid rgba(32,31,29,0.16);border-radius:8px;">
          <tr><td class="fx-card" style="padding:32px;">
            <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#b68235;">Fornetto</div>
            <h1 class="fx-h1" style="font-size:26px;font-weight:600;line-height:1.2;margin:10px 0 16px;">${heading}</h1>
            <p style="font-size:17px;line-height:1.6;margin:0 0 26px;">${body}</p>
            <a href="${url}" style="display:inline-block;font-size:16px;color:#7d5411;text-decoration:none;border:1px solid #b68235;border-radius:6px;padding:13px 22px;">${buttonLabel}</a>
            <p style="font-size:13px;line-height:1.6;color:rgba(32,31,29,0.55);margin:26px 0 0;">If the button doesn&rsquo;t work, paste this link into your browser:<br><span style="word-break:break-all;color:#7d5411;">${url}</span></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

module.exports = { sendEmail, actionEmail };
