const { auth } = require("../lib/auth");
const { fromNodeHeaders } = require("better-auth/node");
const { ensureHouseholdForUser, recordUserActivity } = require("../db/queries");
const { clientHintFrom } = require("../lib/clientHint");

// Which (user, London day) pairs this process has already written to
// user_activity — so the retention log costs one INSERT per user per day, not
// one per request. Process-local: a restart or a second instance just repeats
// an idempotent insert. The value carries whether that day has already been
// marked as "used the installed app", so a browser visit followed by a
// home-screen launch on the same day still gets written once more.
const activitySeen = new Map();
const ACTIVITY_MEMO_MAX = 5000;

function londonDay(now = new Date()) {
    return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD
}

function touchActivity(userId, hint) {
    const day = londonDay();
    const standalone = Boolean(hint?.standalone);
    const seen = activitySeen.get(userId);
    if (seen && seen.day === day && (seen.standalone || !standalone)) return;
    if (activitySeen.size >= ACTIVITY_MEMO_MAX) activitySeen.clear();
    activitySeen.set(userId, { day, standalone });
    recordUserActivity(userId, hint); // fire-and-forget, swallows its own errors
}

async function requireAuth(req, res, next) {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });
        if (!session) return res.status(401).json({ error: "Unauthorised" });
        req.user = session.user;
        // Every data query is scoped by household, not user. Resolve (or lazily
        // create) the caller's household once here so controllers can pass it on.
        req.householdId = await ensureHouseholdForUser(
            session.user.id,
            session.user.name,
        );
        touchActivity(session.user.id, clientHintFrom(req));
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = { requireAuth };
