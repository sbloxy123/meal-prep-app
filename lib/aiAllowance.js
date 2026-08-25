const db = require("../db/queries");

// Shared weekly-pool guard for every AI endpoint. Returns true (and sends a 429)
// when a free household has spent its weekly AI pool; returns false otherwise
// (premium households always pass). Each controller keeps its own per-action 6h
// burst check afterwards — that ceiling still applies to everyone as an
// abuse / fair-use guard, premium included.
async function weeklyLimitReached(householdId, res) {
    const allowance = await db.checkWeeklyAllowance(householdId);
    if (!allowance.ok) {
        res.status(429).json({
            error: "WEEKLY_LIMIT",
            message:
                "You've used all 15 free AI actions this week. Upgrade to Premium for unlimited — or add a recipe by hand any time, that's always free.",
            limit: allowance.limit,
            used: allowance.used,
            resetsAt: allowance.resetsAt,
        });
        return true;
    }
    return false;
}

module.exports = { weeklyLimitReached };
