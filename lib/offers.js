// What can be bought right now: monthly, annual (when the yearly Price is
// configured) and the founders' offer — a Stripe coupon (duration forever,
// max_redemptions = the cap) applied to annual checkouts while it has
// redemptions left. Stripe enforces the cap; this only reports it so the UI
// can show "N left" and hide the card once it's gone. Cached briefly.

const { stripeClient } = require("./stripe");
const { getConfig } = require("./config");

const CACHE_TTL_MS = 60_000;
let cache = null;
let cacheAt = 0;

function annualAvailable() {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID);
}

async function foundersStatus(cfg) {
    const coupon = cfg.founders_coupon;
    const cap = cfg.founders_cap ?? null;
    const off = { available: false, coupon: null, cap, remaining: null };
    if (!coupon || !annualAvailable() || !stripeClient) return off;
    try {
        const c = await stripeClient.coupons.retrieve(coupon);
        const max = c.max_redemptions ?? cap;
        const used = c.times_redeemed ?? 0;
        const remaining = max == null ? null : Math.max(0, max - used);
        const available = Boolean(c.valid) && (remaining == null || remaining > 0);
        return { available, coupon: available ? coupon : null, cap: max, remaining };
    } catch (error) {
        console.error("[offers] founders coupon lookup failed:", error.message);
        return off;
    }
}

async function getOffers() {
    if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
    const cfg = await getConfig();
    const founders = await foundersStatus(cfg);
    cache = {
        monthly: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PREMIUM_PRICE_ID),
        annual: annualAvailable(),
        founders,
    };
    cacheAt = Date.now();
    return cache;
}

function invalidateOffers() {
    cache = null;
    cacheAt = 0;
}

module.exports = { getOffers, invalidateOffers, annualAvailable };
