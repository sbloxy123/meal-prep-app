const { Resend } = require("resend");

// Transactional email via Resend. Used by BetterAuth for password reset and
// email verification (see lib/auth.js).
//
// Env:
//   RESEND_API_KEY  — Resend API key
//   EMAIL_FROM      — verified sender, e.g. "Mise en Place <noreply@yourdomain.com>".
//                     Falls back to Resend's shared test sender, which only
//                     delivers to your own account email — set a real one before prod.

const FROM = process.env.EMAIL_FROM || "Mise en Place <onboarding@resend.dev>";

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
  <body style="margin:0;background:#f3f2f2;font-family:Georgia,'Times New Roman',serif;color:#201f1d;padding:32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#f3f2f2;border:1px solid rgba(32,31,29,0.16);border-radius:7px;padding:32px">
          <tr><td>
            <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#b68235">Mise en Place</div>
            <h1 style="font-size:26px;font-weight:600;margin:8px 0 16px">${heading}</h1>
            <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${body}</p>
            <a href="${url}" style="display:inline-block;font-size:14px;color:#7d5411;text-decoration:none;border:1px solid #b68235;border-radius:4px;padding:11px 20px">${buttonLabel}</a>
            <p style="font-size:12px;line-height:1.6;color:rgba(32,31,29,0.55);margin:24px 0 0">If the button doesn't work, paste this link into your browser:<br>${url}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

module.exports = { sendEmail, actionEmail };
