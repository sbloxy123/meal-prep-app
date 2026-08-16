const { auth } = require("../lib/auth");
const { fromNodeHeaders } = require("better-auth/node");

async function requireAuth(req, res, next) {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });
    if (!session) return res.status(401).json({ error: "Unauthorised" });
    req.user = session.user;
    next();
}

module.exports = { requireAuth };
