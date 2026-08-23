// Admin gate for the read-only /admin dashboard. Runs AFTER requireAuth (so
// req.user is set). The email allowlist is the real security boundary — the
// obscure frontend route (/back-of-house) adds nothing on its own. Set the
// allowlist (comma-separated) in the environment; anyone else gets 403. Accepts
// either ADMIN_EMAILS or ADMIN_EMAIL so a singular/plural slip doesn't lock you
// out.
function requireAdmin(req, res, next) {
    const allow = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    const email = (req.user?.email || "").toLowerCase();
    if (!email || !allow.includes(email)) {
        return res.status(403).json({ error: "Forbidden" });
    }
    next();
}

module.exports = { requireAdmin };
