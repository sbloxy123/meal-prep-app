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

// GET /premium/offers — what the upgrade page can sell right now.
async function offers(req, res, next) {
    try {
        const { getOffers } = require("../lib/offers");
        const o = await getOffers();
        const { PRICES } = require("../lib/pricing");
        res.json({
            monthly: o.monthly,
            annual: o.annual,
            founders: { available: o.founders.available, remaining: o.founders.remaining, cap: o.founders.cap },
            prices: { monthly: PRICES.monthly.label, annual: PRICES.annual.label, founders: PRICES.founders.label },
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { logCta, offers };
