const db = require("../db/queries");
const { openLedger } = require("./ledger");

// The gate every AI endpoint walks through, in order:
//
//   1. the household's allowance (free households share a weekly pool; premium
//      passes) — refused with 429 WEEKLY_LIMIT, and the refusal is written to
//      the ledger as a 'rejected' row so ceiling hits are measurable;
//   2. the per-action 6h burst ceiling — the anti-abuse guard that applies to
//      everyone, premium included;
//   3. open the ledger row (status 'pending', charging `credits`) that the
//      model calls will fill in and the controller settles.
//
// Returns the ledger, or null when a 429 has already been sent. `credits: 0`
// (the shopping-list paths, "My usuals") logs without charging; `weekly: false`
// skips the pool check for actions that are free by design.
//
//   const ledger = await startAiAction(req, res, { action: "import", credits: 1,
//       burstLimit: 20, burstMessage: "Import limit reached — 20 per 6 hours. Try again later." });
//   if (!ledger) return;

async function startAiAction(
    req,
    res,
    { action, credits = 1, weekly = true, burstLimit = null, burstMessage = null, meta = null },
) {
    const householdId = req.householdId;
    const userId = req.user?.id ?? null;

    let planAt = null;
    if (weekly) {
        const allowance = await db.checkWeeklyAllowance(householdId);
        planAt = allowance.plan;
        if (!allowance.ok) {
            db.recordAiRejected({ householdId, userId, action, credits, planAt });
            res.status(429).json({
                error: "WEEKLY_LIMIT",
                message:
                    "You've used all 15 free AI actions this week. Upgrade to Premium for unlimited — or add a recipe by hand any time, that's always free.",
                limit: allowance.limit,
                used: allowance.used,
                resetsAt: allowance.resetsAt,
            });
            return null;
        }
    }

    if (burstLimit != null) {
        const recent = await db.countRecentUsage(householdId, action);
        if (recent >= burstLimit) {
            res.status(429).json({
                error: burstMessage ?? "Limit reached — try again later.",
            });
            return null;
        }
    }

    return openLedger({ householdId, userId, action, credits, planAt, meta });
}

module.exports = { startAiAction };
