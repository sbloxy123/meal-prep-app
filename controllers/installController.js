const db = require("../db/queries");
const { sendInstallEmail, INSTALL_EVENT, DAILY_LIMIT } = require("../lib/install");

// "Email me the link" on the Account page — for someone who signed up on a
// laptop and wants the install guide on their phone. Capped per user per day;
// the send record is the install_email_sent event itself.
async function emailInstallLink(req, res, next) {
    try {
        const sent = await db.countRecentUserEvents(INSTALL_EVENT, req.user.id, "24 hours");
        if (sent >= DAILY_LIMIT) {
            return res.status(429).json({
                error: "INSTALL_EMAIL_LIMIT",
                message:
                    "We've already sent the link a few times today. Check your inbox and spam folder, or try again tomorrow.",
            });
        }
        await sendInstallEmail(req.user, "account");
        res.json({ ok: true, email: req.user.email });
    } catch (error) {
        next(error);
    }
}

module.exports = { emailInstallLink };
