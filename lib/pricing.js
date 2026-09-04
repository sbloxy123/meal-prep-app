// List prices, in pence, for reporting (MRR in snapshots, the digest) and for
// the upgrade page (GET /premium/offers hands them to the frontend so the
// numbers live in one place). Stripe holds the real prices; change these
// when those change. USD/EUR subscribers are counted at the GBP list price —
// a trend line, not the books.
const PRICES = {
    monthly: { pence: 399, label: "£3.99" },
    annual: { pence: 2999, label: "£29.99" },
    founders: { pence: 1999, label: "£19.99" },
};

// Monthly recurring revenue contribution of one subscription, in pence.
function mrrFor({ interval, founder }) {
    if (interval === "year") return Math.round((founder ? PRICES.founders.pence : PRICES.annual.pence) / 12);
    return PRICES.monthly.pence;
}

module.exports = { PRICES, mrrFor };
