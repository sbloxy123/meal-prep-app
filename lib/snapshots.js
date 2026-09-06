// Daily metric snapshots (migration 020). computeDay(day) builds one day's
// numbers; writeMissingSnapshots() is the hourly job — it writes every
// London day that is missing, from yesterday back to LOOKBACK_DAYS, claiming
// each with ON CONFLICT DO NOTHING so two instances can't both write.
//
// Flows are computed from timestamps and are exact for any day. Stocks that
// read current state (plan, MRR, member counts, cache size) are only exact for
// yesterday; for older days they are stored as they are now and listed in
// metrics.reconstructed so the history view can grey them.

const pool = require("../db/pool");
const { mrrFor } = require("./pricing");

const TZ = "Europe/London";
const LOOKBACK_DAYS = 90;

// YYYY-MM-DD of a Date in London.
function londonDay(date = new Date()) {
    return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

function addDays(dayStr, n) {
    const [y, m, d] = dayStr.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
}

const RECONSTRUCTED_STOCKS = [
    "verified_users", "multi_member_households", "premium_households", "paid_households",
    "comped_households", "subs_monthly", "subs_annual", "subs_founders", "mrr_pence",
    "trials_active", "aisle_rows",
];

async function computeDay(day, { exact = false } = {}) {
    // [start, end) of the London day as timestamptz.
    const win = [day];
    const S = `($1::date::timestamp AT TIME ZONE '${TZ}')`;
    const E = `(($1::date + 1)::timestamp AT TIME ZONE '${TZ}')`;
    const inWin = (col) => `${col} >= ${S} AND ${col} < ${E}`;

    const [stocks, flows, events, ctas, sources, cohorts, ai] = await Promise.all([
        pool.query(
            `SELECT
                (SELECT COUNT(*) FROM "user" WHERE "createdAt" < ${E})::int AS users,
                (SELECT COUNT(*) FROM "user" WHERE "emailVerified")::int AS verified_users,
                (SELECT COUNT(*) FROM household WHERE created_at < ${E})::int AS households,
                (SELECT COUNT(*) FROM (SELECT 1 FROM household_member GROUP BY household_id HAVING COUNT(*) > 1) x)::int AS multi_member_households,
                (SELECT COUNT(*) FROM household WHERE plan = 'premium')::int AS premium_households,
                (SELECT COUNT(*) FROM household WHERE plan = 'premium' AND stripe_subscription_id IS NOT NULL)::int AS paid_households,
                (SELECT COUNT(*) FROM household WHERE plan = 'premium' AND stripe_subscription_id IS NULL)::int AS comped_households,
                (SELECT COUNT(*) FROM household WHERE plan = 'premium' AND stripe_subscription_id IS NOT NULL AND billing_interval = 'month')::int AS subs_monthly,
                (SELECT COUNT(*) FROM household WHERE plan = 'premium' AND stripe_subscription_id IS NOT NULL AND billing_interval = 'year' AND NOT founder)::int AS subs_annual,
                (SELECT COUNT(*) FROM household WHERE plan = 'premium' AND stripe_subscription_id IS NOT NULL AND billing_interval = 'year' AND founder)::int AS subs_founders,
                (SELECT COUNT(*) FROM recipes WHERE created_at < ${E})::int AS recipes,
                (SELECT COUNT(*) FROM household WHERE plan <> 'premium' AND trial_ends_at > ${E})::int AS trials_active,
                (SELECT COUNT(*) FROM ingredient_aisles)::int AS aisle_rows,
                (SELECT COUNT(*) FROM "user" WHERE installed_at < ${E})::int AS installed_users`,
            win,
        ),
        pool.query(
            `SELECT
                (SELECT COUNT(*) FROM "user" WHERE ${inWin('"createdAt"')})::int AS signups,
                (SELECT COUNT(*) FROM user_activity WHERE day = $1::date)::int AS active_users,
                (SELECT COUNT(DISTINCT user_id) FROM user_activity WHERE day > $1::date - 7 AND day <= $1::date)::int AS active_7d,
                (SELECT COUNT(DISTINCT user_id) FROM user_activity WHERE day > $1::date - 30 AND day <= $1::date)::int AS active_30d,
                (SELECT COUNT(*) FROM user_activity WHERE standalone AND day = $1::date)::int AS standalone_active_users,
                (SELECT COUNT(DISTINCT user_id) FROM user_activity WHERE standalone AND day > $1::date - 7 AND day <= $1::date)::int AS standalone_active_7d,
                (SELECT COUNT(DISTINCT user_id) FROM user_activity WHERE standalone AND day > $1::date - 30 AND day <= $1::date)::int AS standalone_active_30d,
                (SELECT COUNT(*) FROM household WHERE plan <> 'premium' AND ${inWin("trial_ends_at")})::int AS trials_expired`,
            win,
        ),
        pool.query(
            `SELECT type, COUNT(*)::int AS n FROM app_events
             WHERE ${inWin("created_at")}
               AND type IN ('list_generated','week_add','shop_finished','trial_started','trial_converted',
                            'subscription_cancelled','subscription_ended','household_limit_hit','checkout_started',
                            'onboarding_shown','onboarding_completed','onboarding_skipped','recipe_created','premium_cta',
                            'invite_sent','invite_accepted','household_nudge_shown')
             GROUP BY type`,
            win,
        ),
        pool.query(
            `SELECT meta->>'source' AS source, COUNT(*)::int AS n FROM app_events
             WHERE type = 'premium_cta' AND ${inWin("created_at")} GROUP BY 1`,
            win,
        ),
        pool.query(
            `SELECT COALESCE(meta->>'source', 'unknown') AS source, COUNT(*)::int AS n FROM app_events
             WHERE type = 'recipe_created' AND ${inWin("created_at")} GROUP BY 1`,
            win,
        ),
        pool.query(
            `SELECT n,
                    COUNT(*)::int AS cohort,
                    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_activity a WHERE a.user_id = u.id AND a.day = $1::date))::int AS retained
             FROM (VALUES (1), (7), (30)) AS d(n)
             JOIN "user" u ON (u."createdAt" AT TIME ZONE '${TZ}')::date = $1::date - d.n
             GROUP BY n`,
            win,
        ),
        pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE status <> 'rejected')::int AS actions,
                COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                COALESCE(SUM(credits) FILTER (WHERE status = 'ok'), 0)::int AS credits,
                COALESCE(SUM(cost_pence), 0)::float AS cost_pence,
                COUNT(*) FILTER (WHERE action = 'aisle' AND status <> 'rejected')::int AS aisle_actions,
                COALESCE(SUM(calls) FILTER (WHERE action = 'aisle'), 0)::int AS aisle_model_calls
             FROM ai_usage WHERE ${inWin("created_at")}`,
            win,
        ),
    ]);

    const s = stocks.rows[0];
    const f = flows.rows[0];
    const ev = Object.fromEntries(events.rows.map((r) => [r.type, r.n]));
    const nudgeInvited = await pool.query(
        `SELECT COUNT(*)::int AS n FROM app_events
         WHERE ${inWin("created_at")} AND type = 'household_nudge_outcome' AND meta->>'outcome' = 'invited'`,
        win,
    );
    const mrr =
        s.subs_monthly * mrrFor({ interval: "month" }) +
        s.subs_annual * mrrFor({ interval: "year", founder: false }) +
        s.subs_founders * mrrFor({ interval: "year", founder: true });
    const retention = {};
    for (const r of cohorts.rows) retention[`d${r.n}`] = { cohort: r.cohort, retained: r.retained };

    const metrics = {
        // stocks
        users: s.users,
        verified_users: s.verified_users,
        households: s.households,
        multi_member_households: s.multi_member_households,
        premium_households: s.premium_households,
        paid_households: s.paid_households,
        comped_households: s.comped_households,
        subs_monthly: s.subs_monthly,
        subs_annual: s.subs_annual,
        subs_founders: s.subs_founders,
        mrr_pence: mrr,
        recipes: s.recipes,
        trials_active: s.trials_active,
        aisle_rows: s.aisle_rows,
        installed_users: s.installed_users, // exact for any day (installed_at is a timestamp)
        // flows
        signups: f.signups,
        active_users: f.active_users,
        active_7d: f.active_7d,
        active_30d: f.active_30d,
        standalone_active_users: f.standalone_active_users,
        standalone_active_7d: f.standalone_active_7d,
        standalone_active_30d: f.standalone_active_30d,
        ai_actions: ai.rows[0].actions,
        ai_rejected: ai.rows[0].rejected,
        ai_credits: ai.rows[0].credits,
        ai_cost_pence: Math.round(Number(ai.rows[0].cost_pence) * 100) / 100,
        aisle_actions: ai.rows[0].aisle_actions,
        aisle_model_calls: ai.rows[0].aisle_model_calls,
        lists_generated: ev.list_generated ?? 0,
        week_adds: ev.week_add ?? 0,
        shops_finished: ev.shop_finished ?? 0,
        recipes_created: ev.recipe_created ?? 0,
        recipes_by_source: Object.fromEntries(sources.rows.map((r) => [r.source, r.n])),
        trials_started: ev.trial_started ?? 0,
        trials_converted: ev.trial_converted ?? 0,
        trials_expired: f.trials_expired,
        cancellations: ev.subscription_cancelled ?? 0,
        subscriptions_ended: ev.subscription_ended ?? 0,
        seat_hits: ev.household_limit_hit ?? 0,
        cta_taps: ev.premium_cta ?? 0,
        cta_by_source: Object.fromEntries(ctas.rows.map((r) => [r.source ?? "unknown", r.n])),
        checkouts_started: ev.checkout_started ?? 0,
        onboarding_shown: ev.onboarding_shown ?? 0,
        onboarding_completed: ev.onboarding_completed ?? 0,
        onboarding_skipped: ev.onboarding_skipped ?? 0,
        invites_sent: ev.invite_sent ?? 0,
        invites_accepted: ev.invite_accepted ?? 0,
        nudges_shown: ev.household_nudge_shown ?? 0,
        nudges_invited: nudgeInvited.rows[0].n,
        retention,
        reconstructed: exact ? [] : RECONSTRUCTED_STOCKS,
    };
    return metrics;
}

async function writeSnapshot(day, metrics) {
    const { rowCount } = await pool.query(
        `INSERT INTO metric_snapshots (day, metrics) VALUES ($1, $2)
         ON CONFLICT (day) DO NOTHING`,
        [day, JSON.stringify(metrics)],
    );
    return rowCount === 1;
}

// The hourly job: every missing London day from yesterday back.
async function writeMissingSnapshots({ lookback = LOOKBACK_DAYS, now = new Date() } = {}) {
    const yesterday = addDays(londonDay(now), -1);
    const { rows } = await pool.query(
        "SELECT day::text AS day FROM metric_snapshots WHERE day > $1::date - $2::int",
        [yesterday, lookback],
    );
    const have = new Set(rows.map((r) => r.day));
    const out = { written: 0, skipped: 0 };
    for (let i = 0; i < lookback; i++) {
        const day = addDays(yesterday, -i);
        if (have.has(day)) continue;
        const metrics = await computeDay(day, { exact: i === 0 });
        if (await writeSnapshot(day, metrics)) out.written++;
        else out.skipped++;
    }
    return out;
}

module.exports = { computeDay, writeSnapshot, writeMissingSnapshots, londonDay, addDays, LOOKBACK_DAYS };
