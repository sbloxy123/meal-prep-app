// Pure entitlement rules — what a household row + the config mean for a
// request. No I/O, unit-tested in test/credits.test.js. db.getEntitlement
// fetches the row and the current period; this file turns them into answers.
//
//   plan       'premium' | 'trial' | 'free'
//   allowance  credits per period, or null for unlimited
//   weight     credits an action costs this household

// premium wins while it lasts; a trial is "free plan, trial_ends_at still
// ahead"; everything else is free.
function effectivePlan(row, now = new Date()) {
    if (!row) return "free";
    const t = now.getTime();
    if (row.plan === "premium") {
        const until = row.premium_until ? new Date(row.premium_until).getTime() : null;
        if (until == null || until > t) return "premium";
    }
    if (row.trial_ends_at && new Date(row.trial_ends_at).getTime() > t) return "trial";
    return "free";
}

// Credits per period for the effective plan. The household's snapshot wins;
// config fills a missing snapshot (households created before the column
// existed are backfilled by the migration, so that is belt and braces).
// null = unlimited: comps have premium_credit_allowance NULL.
function allowanceFor(row, plan, config) {
    const has = (k) => row != null && Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined;
    if (plan === "premium" || plan === "trial") {
        if (has("premium_credit_allowance")) return row.premium_credit_allowance; // NULL = unlimited (comp)
        return config?.premium_credit_allowance ?? null;
    }
    if (has("credit_allowance")) return row.credit_allowance;
    return config?.free_credit_allowance ?? 0;
}

// Cost of an action: the household's weight snapshot, then config, then 1 —
// so an action added after a household was created never crashes it and is
// never free by accident.
function weightFor(row, config, action) {
    const snap = row?.credit_weights;
    if (snap && Number.isInteger(snap[action])) return snap[action];
    const cfg = config?.credit_weights;
    if (cfg && Number.isInteger(cfg[action])) return cfg[action];
    return 1;
}

function memberLimitFor(row, plan, config) {
    if (plan === "premium" || plan === "trial") return null; // unlimited
    return row?.member_limit ?? config?.member_limit_free ?? 2;
}

// The shape every entitlement consumer gets (API, controllers, admin).
function buildEntitlement(row, period, creditsUsed, config, now = new Date()) {
    const plan = effectivePlan(row, now);
    const allowance = allowanceFor(row, plan, config);
    const used = Number(creditsUsed) || 0;
    const remaining = allowance == null ? null : Math.max(0, allowance - used);
    const weights = { ...(config?.credit_weights || {}), ...(row?.credit_weights || {}) };
    return {
        plan,
        trialEndsAt: row?.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
        credits: {
            used,
            allowance,
            remaining,
            unlimited: allowance == null,
            exhausted: allowance != null && used >= allowance,
            resetsAt: period?.period_end ? new Date(period.period_end).toISOString() : null,
            periodStart: period?.period_start ? new Date(period.period_start).toISOString() : null,
        },
        weights,
        memberLimit: memberLimitFor(row, plan, config),
        founder: Boolean(row?.founder),
        billingInterval: row?.billing_interval ?? null,
    };
}

function canAfford(entitlement, credits) {
    if (credits <= 0) return true;
    const { allowance, used } = entitlement.credits;
    if (allowance == null) return true;
    return used + credits <= allowance;
}

module.exports = { effectivePlan, allowanceFor, weightFor, memberLimitFor, buildEntitlement, canAfford };
