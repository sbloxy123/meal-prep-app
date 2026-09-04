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
// plain transactional emails, so keep them simple and client-safe. `frame`
// is the shared card; each template fills it.
function frame(inner) {
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
${inner}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

const BUTTON_STYLE =
    "display:inline-block;font-size:16px;color:#7d5411;text-decoration:none;border:1px solid #b68235;border-radius:6px;padding:13px 22px;";

function fallbackLink(url) {
    return `<p style="font-size:13px;line-height:1.6;color:rgba(32,31,29,0.55);margin:26px 0 0;">If the button doesn&rsquo;t work, paste this link into your browser:<br><span style="word-break:break-all;color:#7d5411;">${url}</span></p>`;
}

function actionEmail({ heading, body, buttonLabel, url }) {
    return frame(`            <h1 class="fx-h1" style="font-size:26px;font-weight:600;line-height:1.2;margin:10px 0 16px;">${heading}</h1>
            <p style="font-size:17px;line-height:1.6;margin:0 0 26px;">${body}</p>
            <a href="${url}" style="${BUTTON_STYLE}">${buttonLabel}</a>
            ${fallbackLink(url)}`);
}

// "Put Fornetto on your home screen" — sent once after email verification and
// on demand from the Account page. iPhones have no install prompt at all, so
// the email is the thing that gets the link onto the phone; the guide page it
// points at does the platform-specific walkthrough. Keep the steps here short
// and correct for both platforms — the page has the detail.
function installEmail({ url }) {
    const step = (html) =>
        `<li style="margin:0 0 10px;font-size:16px;line-height:1.55;">${html}</li>`;
    return frame(`            <h1 class="fx-h1" style="font-size:26px;font-weight:600;line-height:1.2;margin:10px 0 16px;">Put Fornetto on your home screen</h1>
            <p style="font-size:17px;line-height:1.6;margin:0 0 18px;">On your phone, Fornetto works like an app: its own icon, full screen, and it opens in the shop even when the signal doesn&rsquo;t. Nothing to download from a store.</p>
            <ol style="margin:0 0 22px;padding-left:22px;">
${step("Open this email <strong>on your phone</strong> and tap the button below.")}
${step("<strong>iPhone:</strong> tap the Share button, then <strong>Add to Home Screen</strong>. Can&rsquo;t see it? Open the link in Safari first.")}
${step("<strong>Android:</strong> tap <strong>Install</strong> when it appears, or open the browser menu and choose &ldquo;Add to Home screen&rdquo;.")}
            </ol>
            <a href="${url}" style="${BUTTON_STYLE}">Open the install guide</a>
            ${fallbackLink(url)}`);
}

function installEmailText(url) {
    return [
        "Put Fornetto on your home screen",
        "",
        `Open this email on your phone, then follow the guide: ${url}`,
        "",
        'iPhone: open the link in Safari, tap Share, then "Add to Home Screen".',
        'Android: tap "Install" when it appears, or use the browser menu and choose "Add to Home screen".',
    ].join("\n");
}

// The two trial prompts (lib/trial.js): four days before the end, and the last
// day. Same card as the other emails, one button. What they keep is stated
// before what changes — nothing is taken away, only the rate of new AI work.
function trialEmail({ stage, daysLeft, endsOn, url, freeCredits, premiumCredits, name }) {
    const last = stage === "last_day";
    const heading = last
        ? "Your Premium trial ends tomorrow"
        : `${daysLeft} days left on your Premium trial`;
    const hi = name ? `Hi ${escapeHtml(name)}, ` : "";
    const body = `${hi}your Fornetto Premium trial ends on <strong>${escapeHtml(endsOn)}</strong>. Every recipe, menu and shopping list you&rsquo;ve made stays exactly where it is — that never changes. What changes is the AI: the free plan gives you <strong>${freeCredits ?? 50} credits a month</strong>; Premium keeps you on <strong>${premiumCredits ?? 300}</strong>, shared with your whole household, for £3.99 a month. Keep it now and you won&rsquo;t pay anything until the trial would have ended anyway.`;
    return actionEmail({ heading, body, buttonLabel: "Keep Premium", url });
}

function trialEmailText({ stage, daysLeft, endsOn, url, freeCredits, premiumCredits }) {
    return [
        stage === "last_day" ? "Your Premium trial ends tomorrow" : `${daysLeft} days left on your Premium trial`,
        "",
        `Your Fornetto Premium trial ends on ${endsOn}. Everything you've made stays where it is.`,
        `The free plan gives you ${freeCredits ?? 50} AI credits a month; Premium keeps you on ${premiumCredits ?? 300}, shared with your household, for £3.99 a month.`,
        "Keep it now and you won't pay anything until the trial would have ended anyway.",
        "",
        `Keep Premium: ${url}`,
    ].join("\n");
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

module.exports = { sendEmail, actionEmail, installEmail, installEmailText, trialEmail, trialEmailText };
