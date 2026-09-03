// The "put Fornetto on your home screen" email. iPhones have no install
// prompt, so getting the link onto the phone is how most people will install:
// once after verification (lib/auth.js afterEmailVerification), and on demand
// from the Account page (POST /install/email). Both paths log
// install_email_sent to app_events, which doubles as the send record — the
// verification path checks it so a re-verification can't send twice, and the
// on-demand path counts it for the daily cap.
const db = require("../db/queries");
const { sendEmail, actionEmail, installEmail, installEmailText } = require("./email");

const FRONTEND_URL = (
    process.env.ALLOWED_ORIGINS?.split(",")[0] || "http://localhost:3000"
).trim().replace(/\/$/, "");

const INSTALL_EVENT = "install_email_sent";
const DAILY_LIMIT = 3;

function installUrl() {
    return `${FRONTEND_URL}/install?from=email`;
}

async function sendInstallEmail(user, source) {
    const url = installUrl();
    await sendEmail({
        to: user.email,
        subject: "Put Fornetto on your home screen",
        text: installEmailText(url),
        html: installEmail({ url }),
    });
    db.recordEvent(INSTALL_EVENT, { userId: user.id, meta: { source } });
}

// Verification hook: at most once per account, ever. BetterAuth short-circuits
// an already-verified user before calling the hook, but a fresh token can
// still get here — the event row is the durable guard.
async function sendInstallEmailAfterVerification(user) {
    if (!user?.id || !user?.email) return false;
    if (await db.hasEvent(INSTALL_EVENT, user.id)) return false;
    await sendInstallEmail(user, "verify");
    return true;
}

// ── The stale-layout alarm ─────────────────────────────────────────────────
// The frontend's Add to Home Screen walkthrough points at where Safari/Chrome
// keep the button, per iOS version, and knows the newest version it has been
// checked on (MAX_VERIFIED_IOS in its src/lib/ios-layouts.ts). When a phone on
// a newer iOS shows up it logs install_layout_unverified; the first sighting
// of each major version emails the admins so the walkthrough gets re-checked
// before many users hit it. Recorded as install_layout_alerted so it fires
// once per major, ever.

const ALERTED_EVENT = "install_layout_alerted";

function iosMajor(ios) {
    const m = /^(\d{1,3})(?:\.|$)/.exec(String(ios ?? "").trim());
    return m ? Number(m[1]) : null;
}

function adminEmails() {
    return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

async function alertNewIosMajor(ios) {
    const major = iosMajor(ios);
    if (major === null) return false;
    if (await db.hasEventMeta(ALERTED_EVENT, "major", String(major))) return false;
    // Record first so a burst of new-iOS phones can't send a pile of emails.
    await db.recordEvent(ALERTED_EVENT, { meta: { major } });
    const to = adminEmails();
    if (to.length === 0) {
        console.warn(`[install] iOS ${major} seen but ADMIN_EMAILS is not set — nobody to alert`);
        return true;
    }
    const url = `${FRONTEND_URL}/back-of-house`;
    await sendEmail({
        to,
        subject: `iOS ${major} has arrived — check the Add to Home Screen walkthrough`,
        text: `Someone opened Fornetto on iOS ${major}, newer than the install walkthrough has been verified on. Open it on a phone running iOS ${major}, check where Safari and Chrome keep Share / Add to Home Screen, then update src/lib/ios-layouts.ts in the frontend. ${url}`,
        html: actionEmail({
            heading: `iOS ${major} has arrived`,
            body: `Someone just opened Fornetto on iOS ${major} — newer than the Add to Home Screen walkthrough has been verified on. Open the app on a phone running iOS ${major}, check where Safari and Chrome keep Share and Add to Home Screen, then update <code>src/lib/ios-layouts.ts</code> in the frontend. Until then, those users see the generic wording.`,
            buttonLabel: "Open back of house",
            url,
        }),
    });
    return true;
}

module.exports = {
    INSTALL_EVENT,
    DAILY_LIMIT,
    installUrl,
    iosMajor,
    sendInstallEmail,
    sendInstallEmailAfterVerification,
    alertNewIosMajor,
};
