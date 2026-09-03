// The "put Fornetto on your home screen" email. iPhones have no install
// prompt, so getting the link onto the phone is how most people will install:
// once after verification (lib/auth.js afterEmailVerification), and on demand
// from the Account page (POST /install/email). Both paths log
// install_email_sent to app_events, which doubles as the send record — the
// verification path checks it so a re-verification can't send twice, and the
// on-demand path counts it for the daily cap.
const db = require("../db/queries");
const { sendEmail, installEmail, installEmailText } = require("./email");

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

module.exports = {
    INSTALL_EVENT,
    DAILY_LIMIT,
    installUrl,
    sendInstallEmail,
    sendInstallEmailAfterVerification,
};
