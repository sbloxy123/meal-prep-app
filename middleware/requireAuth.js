const { auth } = require("../lib/auth");
const { fromNodeHeaders } = require("better-auth/node");
const { ensureHouseholdForUser } = require("../db/queries");

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
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = { requireAuth };
