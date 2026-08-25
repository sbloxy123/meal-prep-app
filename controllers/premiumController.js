const db = require("../db/queries");

// Log a "Go premium" tap so the conversion funnel has data from day one, before
// the purchase flow (Phase 2) exists. Best-effort: never fails the request.
async function logCta(req, res) {
    const source =
        typeof req.body?.source === "string" ? req.body.source.slice(0, 60) : "unknown";
    db.recordEvent("premium_cta", {
        userId: req.user?.id ?? null,
        householdId: req.householdId ?? null,
        meta: { source },
    });
    res.json({ ok: true });
}

module.exports = { logCta };
