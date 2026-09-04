const db = require("../db/queries");
const { getConfig } = require("./config");
const { weightFor } = require("./credits");
const { Ledger } = require("./ledger");

// The gate every AI endpoint walks through, in order:
//
//   1. price the action for this household — its weight snapshot (photo 3,
//      most things 1, the shopping list 0), unless the caller pins `credits`;
//   2. the per-action 6h burst ceiling — the anti-abuse guard that applies to
//      everyone, premium included;
//   3. reserve the credits against the household's allowance for the current
//      period, atomically (db.reserveCredits takes an advisory lock, writes the
//      ai_usage row 'pending' or records the refusal as 'rejected'). Refused →
//      429 CREDIT_LIMIT with the numbers the UI needs.
//
// Returns the ledger (lib/ledger.js) the model calls will fill in and the
// controller settles, or null when a 429 has already been sent.
//
//   const ledger = await startAiAction(req, res, { action: "import",
//       burstLimit: 20, burstMessage: "Import limit reached — 20 per 6 hours. Try again later." });
//   if (!ledger) return;
//
// `credits: 0` pins a free action (usuals, parse); `weekly` is accepted for
// backwards compatibility and means the same as `credits: 0` when false.

async function startAiAction(
    req,
    res,
    { action, credits = null, weekly = true, burstLimit = null, burstMessage = null, meta = null },
) {
    const householdId = req.householdId;
    const userId = req.user?.id ?? null;

    if (burstLimit != null) {
        const recent = await db.countRecentUsage(householdId, action);
        if (recent >= burstLimit) {
            res.status(429).json({
                error: burstMessage ?? "Limit reached — try again later.",
            });
            return null;
        }
    }

    let cost = credits;
    if (cost == null) {
        if (!weekly) cost = 0;
        else {
            // Priced from the household's own snapshot; getEntitlement inside
            // reserveCredits re-reads the row under the lock, this read only
            // resolves the weight.
            const [cfg, ent] = await Promise.all([getConfig(), db.getEntitlement(householdId)]);
            cost = weightFor({ credit_weights: ent.weights }, cfg, action);
        }
    }

    const reservation = await db.reserveCredits({ householdId, userId, action, credits: cost, meta });
    if (!reservation.ok) {
        const ent = reservation.entitlement;
        res.status(429).json({
            error: "CREDIT_LIMIT",
            message: creditLimitMessage(ent, cost),
            plan: ent.plan,
            allowance: ent.credits.allowance,
            used: ent.credits.used,
            remaining: ent.credits.remaining,
            cost,
            resetsAt: ent.credits.resetsAt,
        });
        return null;
    }

    return new Ledger({ id: reservation.id, action, credits: cost });
}

function creditLimitMessage(ent, cost) {
    const when = ent.credits.resetsAt ? ` They top up on ${resetDay(ent.credits.resetsAt)}.` : "";
    if (ent.plan === "premium" || ent.plan === "trial") {
        return `You've used this month's ${ent.credits.allowance} AI credits.${when}`;
    }
    if (ent.credits.remaining > 0) {
        return `This needs ${cost} credits and you have ${ent.credits.remaining} left this month.${when} Go Premium for more — or add it by hand, that's always free.`;
    }
    return `You've used all ${ent.credits.allowance} free AI credits this month.${when} Go Premium for more — or add it by hand, that's always free.`;
}

// "the 14th" — the London calendar day the period turns over.
function resetDay(iso) {
    const d = new Date(iso);
    const day = Number(d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric" }));
    const suffix =
        day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
    return `the ${day}${suffix}`;
}

module.exports = { startAiAction, creditLimitMessage, resetDay };
