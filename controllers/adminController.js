// Read-only admin analytics. Self-contained: queries run against the pool
// directly (rather than growing db/queries.js) since nothing here is reused.
// All aggregates are over existing tables + app_events + ai_usage. No writes.
const pool = require("../db/pool");
const db = require("../db/queries");

const ALLOWED_DAYS = [7, 30, 90, 365];

// Every action the AI ledger records (migration 015). The dashboard shows them
// all — the old recipe_imports rollup silently dropped social + aisle, so the
// "AI calls" number under-counted real spend.
const AI_ACTIONS = ["import", "estimate", "generate", "photo", "improve", "suggest", "social", "aisle", "parse", "usuals"];

// One COUNT(*) FILTER column per action, e.g. for a daily stacked series.
function aiActionFilters(alias) {
    return AI_ACTIONS.map(
        (a) => `COUNT(*) FILTER (WHERE ${alias}.action = '${a}' AND ${alias}.status <> 'rejected')::int AS "${a}"`,
    ).join(",\n                        ");
}

function actionCounts(row) {
    const out = {};
    let total = 0;
    for (const a of AI_ACTIONS) {
        out[a] = Number(row?.[a] ?? 0);
        total += out[a];
    }
    out.total = total;
    return out;
}

// Daily date axis so empty days show as zero (nicer charts). $1 = days.
const DAYS_CTE = `
    WITH days AS (
        SELECT generate_series(
            date_trunc('day', now()) - (($1::int - 1) || ' days')::interval,
            date_trunc('day', now()),
            interval '1 day'
        )::date AS d
    )
`;

async function daySeries(days, innerSql) {
    const { rows } = await pool.query(`${DAYS_CTE}${innerSql}`, [days]);
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}

// GET /admin/overview?days=30 — totals + daily time-series.
async function overview(req, res, next) {
    try {
        let days = parseInt(req.query.days, 10);
        if (!ALLOWED_DAYS.includes(days)) days = 30;

        const [totalsRes, aiRes, invitesRes, macrosRes, tagsRes, deviceRes, onboardingRes, installRes, unverifiedRes, retentionRes, sizesRes] =
            await Promise.all([
                pool.query(`
                    SELECT
                        (SELECT COUNT(*) FROM "user")::int AS users,
                        (SELECT COUNT(*) FILTER (WHERE "emailVerified") FROM "user")::int AS verified_users,
                        (SELECT COUNT(DISTINCT "userId") FROM "session" WHERE "updatedAt" >= now() - interval '7 days')::int AS active7,
                        (SELECT COUNT(DISTINCT "userId") FROM "session" WHERE "updatedAt" >= now() - interval '30 days')::int AS active30,
                        (SELECT COUNT(*) FROM recipes)::int AS recipes,
                        (SELECT COUNT(*) FROM recipe_shares)::int AS shares,
                        (SELECT COUNT(*) FROM household)::int AS households,
                        (SELECT COUNT(*) FROM (
                            SELECT 1 FROM household_member GROUP BY household_id HAVING COUNT(*) > 1
                        ) x)::int AS multi_member,
                        (SELECT COUNT(*) FROM household WHERE plan = 'premium')::int AS premium_households,
                        (SELECT COUNT(*) FROM household WHERE plan = 'premium' AND stripe_subscription_id IS NOT NULL)::int AS paid_households,
                        (SELECT COUNT(*) FROM household WHERE plan = 'premium' AND stripe_subscription_id IS NULL)::int AS comped_households
                `),
                pool.query(
                    `SELECT action,
                            COUNT(*) FILTER (WHERE status <> 'rejected')::int AS n,
                            COALESCE(SUM(cost_pence), 0)::float AS cost_pence,
                            COALESCE(SUM(cost_usd), 0)::float   AS cost_usd
                     FROM ai_usage
                     WHERE created_at >= now() - ($1::int || ' days')::interval
                     GROUP BY action`,
                    [days],
                ),
                pool.query(`
                    SELECT
                        COUNT(*)::int AS sent,
                        COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)::int AS accepted,
                        COUNT(*) FILTER (WHERE accepted_at IS NULL AND expires_at > now())::int AS pending
                    FROM household_invite
                `),
                pool.query(
                    `SELECT macros_source, COUNT(*)::int AS n FROM recipes
                     WHERE macros_source IS NOT NULL GROUP BY macros_source`,
                ),
                pool.query(
                    `SELECT t.name, COUNT(*)::int AS n FROM recipe_tags rt
                     JOIN tags t ON t.id = rt.tag_id
                     GROUP BY t.name ORDER BY n DESC LIMIT 8`,
                ),
                pool.query(`
                    SELECT
                        CASE WHEN "userAgent" ~* 'Mobi|Android|iPhone|iPad' THEN 'mobile' ELSE 'desktop' END AS device,
                        COUNT(DISTINCT "userId")::int AS n
                    FROM "session" WHERE "userAgent" IS NOT NULL GROUP BY device
                `),
                pool.query(
                    `SELECT
                        COUNT(*) FILTER (WHERE type = 'onboarding_shown')::int      AS shown,
                        COUNT(*) FILTER (WHERE type = 'onboarding_started')::int    AS started,
                        COUNT(*) FILTER (WHERE type = 'onboarding_completed')::int  AS completed,
                        COUNT(*) FILTER (WHERE type = 'onboarding_skipped')::int    AS skipped,
                        COUNT(*) FILTER (WHERE type = 'onboarding_ai_handoff')::int AS ai_handoff,
                        COALESCE(SUM((meta->>'added')::int)
                            FILTER (WHERE type = 'onboarding_completed'), 0)::int   AS recipes_seeded,
                        COUNT(*) FILTER (WHERE type = 'onboarding_usuals_typed')::int AS usuals_typed,
                        COUNT(*) FILTER (WHERE type = 'onboarding_usuals')::int       AS usuals_runs,
                        COALESCE(SUM((meta->>'requested')::int)
                            FILTER (WHERE type = 'onboarding_usuals'), 0)::int       AS usuals_dishes,
                        COALESCE(SUM((meta->>'written')::int)
                            FILTER (WHERE type = 'onboarding_usuals'), 0)::int       AS usuals_written,
                        COALESCE(SUM((meta->>'title_only')::int)
                            FILTER (WHERE type = 'onboarding_usuals'), 0)::int       AS usuals_title_only
                     FROM app_events
                     WHERE created_at >= now() - ($1::int || ' days')::interval
                       AND type LIKE 'onboarding_%'`,
                    [days],
                ),
                pool.query(
                    `SELECT
                        COUNT(*) FILTER (WHERE type = 'install_prompt_shown')::int AS shown,
                        COUNT(*) FILTER (WHERE type = 'install_prompt_outcome'
                            AND meta->>'outcome' = 'native_accepted')::int          AS native_accepted,
                        COUNT(*) FILTER (WHERE type = 'install_prompt_outcome'
                            AND meta->>'outcome' = 'guide')::int                    AS guide,
                        COUNT(*) FILTER (WHERE type = 'install_prompt_outcome'
                            AND meta->>'outcome' = 'later')::int                    AS later,
                        COUNT(*) FILTER (WHERE type = 'install_prompt_outcome'
                            AND meta->>'outcome' = 'never')::int                    AS never,
                        COUNT(*) FILTER (WHERE type = 'install_prompt_outcome'
                            AND meta->>'outcome' = 'coach')::int                    AS coach,
                        COUNT(*) FILTER (WHERE type = 'install_page_view')::int    AS page_views,
                        COUNT(*) FILTER (WHERE type = 'install_email_sent')::int   AS emails_sent,
                        COUNT(DISTINCT user_id)
                            FILTER (WHERE type = 'install_standalone_open')::int    AS standalone_users
                     FROM app_events
                     WHERE created_at >= now() - ($1::int || ' days')::interval
                       AND type LIKE 'install_%'`,
                    [days],
                ),
                // All-time, not windowed: the notice must persist until the
                // walkthrough is re-verified. max_verified is the newest
                // MAX_VERIFIED_IOS any client has reported, so once the
                // frontend ships a bump the notice clears by itself.
                pool.query(
                    `SELECT
                        split_part(meta->>'ios', '.', 1)::int AS major,
                        COUNT(DISTINCT COALESCE(user_id, id::text))::int AS devices,
                        MIN(created_at) AS first_seen,
                        MAX((meta->>'verified')::int) AS max_verified
                     FROM app_events
                     WHERE type = 'install_layout_unverified'
                       AND meta->>'ios' ~ '^[0-9]+'
                     GROUP BY major
                     ORDER BY major DESC`,
                ),
                // Classic day-N retention: of users who signed up in the window
                // (and after user_activity started recording), how many made an
                // authenticated request on exactly day 1 / 7 / 30. A user only
                // counts as eligible once that day has passed.
                pool.query(
                    `WITH first_day AS (SELECT MIN(day) AS d FROM user_activity),
                          today AS (SELECT (now() AT TIME ZONE 'Europe/London')::date AS d),
                          cohort AS (
                              SELECT u.id, (u."createdAt" AT TIME ZONE 'Europe/London')::date AS d0
                              FROM "user" u, first_day f
                              WHERE u."createdAt" >= now() - ($1::int || ' days')::interval
                                AND f.d IS NOT NULL
                                AND (u."createdAt" AT TIME ZONE 'Europe/London')::date >= f.d
                          )
                     SELECT
                        COUNT(*)::int AS cohort,
                        COUNT(*) FILTER (WHERE c.d0 + 1  <= t.d)::int AS eligible_d1,
                        COUNT(*) FILTER (WHERE c.d0 + 7  <= t.d)::int AS eligible_d7,
                        COUNT(*) FILTER (WHERE c.d0 + 30 <= t.d)::int AS eligible_d30,
                        COUNT(*) FILTER (WHERE c.d0 + 1  <= t.d AND EXISTS
                            (SELECT 1 FROM user_activity a WHERE a.user_id = c.id AND a.day = c.d0 + 1))::int  AS retained_d1,
                        COUNT(*) FILTER (WHERE c.d0 + 7  <= t.d AND EXISTS
                            (SELECT 1 FROM user_activity a WHERE a.user_id = c.id AND a.day = c.d0 + 7))::int  AS retained_d7,
                        COUNT(*) FILTER (WHERE c.d0 + 30 <= t.d AND EXISTS
                            (SELECT 1 FROM user_activity a WHERE a.user_id = c.id AND a.day = c.d0 + 30))::int AS retained_d30,
                        -- "Still around": active at any point in days 1..N. Softer than
                        -- the classic number, closer to what a user feels like.
                        COUNT(*) FILTER (WHERE c.d0 + 7  <= t.d AND EXISTS
                            (SELECT 1 FROM user_activity a WHERE a.user_id = c.id AND a.day BETWEEN c.d0 + 1 AND c.d0 + 7))::int  AS rolling_d7,
                        COUNT(*) FILTER (WHERE c.d0 + 30 <= t.d AND EXISTS
                            (SELECT 1 FROM user_activity a WHERE a.user_id = c.id AND a.day BETWEEN c.d0 + 1 AND c.d0 + 30))::int AS rolling_d30
                     FROM cohort c, today t`,
                    [days],
                ),
                pool.query(
                    `SELECT member_count::int AS size, COUNT(*)::int AS households
                     FROM (SELECT household_id, COUNT(*) AS member_count
                           FROM household_member GROUP BY household_id) x
                     GROUP BY member_count ORDER BY member_count`,
                ),
            ]);

        const t = totalsRes.rows[0];

        const ai = actionCounts({});
        const aiCost = { pence: 0, usd: 0, byAction: {} };
        for (const r of aiRes.rows) {
            if (r.action in ai) {
                ai[r.action] = Number(r.n);
                ai.total += Number(r.n);
            }
            aiCost.byAction[r.action] = Number(r.cost_pence);
            aiCost.pence += Number(r.cost_pence);
            aiCost.usd += Number(r.cost_usd);
        }
        aiCost.pence = Math.round(aiCost.pence * 100) / 100;
        aiCost.usd = Math.round(aiCost.usd * 1e4) / 1e4;

        const rt = retentionRes.rows[0];
        const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
        const retention = {
            cohort: Number(rt.cohort),
            d1: { eligible: Number(rt.eligible_d1), retained: Number(rt.retained_d1), rate: rate(rt.retained_d1, rt.eligible_d1) },
            d7: { eligible: Number(rt.eligible_d7), retained: Number(rt.retained_d7), rate: rate(rt.retained_d7, rt.eligible_d7), rolling: rate(rt.rolling_d7, rt.eligible_d7) },
            d30: { eligible: Number(rt.eligible_d30), retained: Number(rt.retained_d30), rate: rate(rt.retained_d30, rt.eligible_d30), rolling: rate(rt.rolling_d30, rt.eligible_d30) },
        };

        const householdSizes = sizesRes.rows.map((r) => ({ size: Number(r.size), households: Number(r.households) }));

        const macrosSource = {};
        for (const r of macrosRes.rows) macrosSource[r.macros_source] = Number(r.n);

        const deviceSplit = {};
        for (const r of deviceRes.rows) deviceSplit[r.device] = Number(r.n);

        const inv = invitesRes.rows[0];

        const ob = onboardingRes.rows[0];
        const onboarding = {
            shown: Number(ob.shown),
            started: Number(ob.started),
            completed: Number(ob.completed),
            skipped: Number(ob.skipped),
            aiHandoff: Number(ob.ai_handoff),
            recipesSeeded: Number(ob.recipes_seeded),
            usualsTyped: Number(ob.usuals_typed),
            usualsRuns: Number(ob.usuals_runs),
            usualsDishes: Number(ob.usuals_dishes),
            usualsWritten: Number(ob.usuals_written),
            usualsTitleOnly: Number(ob.usuals_title_only),
        };

        const ins = installRes.rows[0];
        const install = {
            shown: Number(ins.shown),
            nativeAccepted: Number(ins.native_accepted),
            guide: Number(ins.guide),
            later: Number(ins.later),
            never: Number(ins.never),
            coach: Number(ins.coach),
            pageViews: Number(ins.page_views),
            emailsSent: Number(ins.emails_sent),
            // Distinct users seen running the installed app — the only real
            // install signal on iOS.
            standaloneUsers: Number(ins.standalone_users),
            // Newer-than-verified iOS majors seen in the wild (stale-layout
            // alarm); the dashboard shows the ones above maxVerifiedIos.
            unverifiedIos: unverifiedRes.rows.map((r) => ({
                major: Number(r.major),
                devices: Number(r.devices),
                firstSeen: r.first_seen,
            })),
            maxVerifiedIos: unverifiedRes.rows.reduce(
                (m, r) => (r.max_verified != null ? Math.max(m ?? 0, Number(r.max_verified)) : m),
                null,
            ),
        };

        const [signups, activeUsers, aiCallsRows, recipesCreated, listsGenerated, weekAdds, onboardingCompleted] =
            await Promise.all([
                daySeries(
                    days,
                    `SELECT d.d::text AS date, COUNT(u.id)::int AS count
                     FROM days d LEFT JOIN "user" u ON u."createdAt"::date = d.d
                     GROUP BY d.d ORDER BY d.d`,
                ),
                daySeries(
                    days,
                    `SELECT d.d::text AS date, COUNT(DISTINCT se."userId")::int AS count
                     FROM days d LEFT JOIN "session" se ON se."updatedAt"::date = d.d
                     GROUP BY d.d ORDER BY d.d`,
                ),
                pool.query(
                    `${DAYS_CTE}
                     SELECT d.d::text AS date,
                        ${aiActionFilters("ai")},
                        COALESCE(SUM(ai.cost_pence), 0)::float AS cost_pence
                     FROM days d LEFT JOIN ai_usage ai ON ai.created_at::date = d.d
                     GROUP BY d.d ORDER BY d.d`,
                    [days],
                ),
                daySeries(
                    days,
                    `SELECT d.d::text AS date, COUNT(r.id)::int AS count
                     FROM days d LEFT JOIN recipes r ON r.created_at::date = d.d
                     GROUP BY d.d ORDER BY d.d`,
                ),
                daySeries(
                    days,
                    `SELECT d.d::text AS date, COUNT(e.id)::int AS count
                     FROM days d LEFT JOIN app_events e
                        ON e.created_at::date = d.d AND e.type = 'list_generated'
                     GROUP BY d.d ORDER BY d.d`,
                ),
                daySeries(
                    days,
                    `SELECT d.d::text AS date, COUNT(e.id)::int AS count
                     FROM days d LEFT JOIN app_events e
                        ON e.created_at::date = d.d AND e.type = 'week_add'
                     GROUP BY d.d ORDER BY d.d`,
                ),
                daySeries(
                    days,
                    `SELECT d.d::text AS date, COUNT(e.id)::int AS count
                     FROM days d LEFT JOIN app_events e
                        ON e.created_at::date = d.d AND e.type = 'onboarding_completed'
                     GROUP BY d.d ORDER BY d.d`,
                ),
            ]);

        const aiCalls = aiCallsRows.rows.map((r) => {
            const { total, ...values } = actionCounts(r);
            return { date: r.date, values, count: total, costPence: Number(r.cost_pence) };
        });

        res.json({
            days,
            totals: {
                users: t.users,
                verifiedUsers: t.verified_users,
                activeUsers7d: t.active7,
                activeUsers30d: t.active30,
                recipes: t.recipes,
                shares: t.shares,
                households: t.households,
                multiMemberHouseholds: t.multi_member,
                premiumHouseholds: t.premium_households,
                paidHouseholds: t.paid_households,
                compedHouseholds: t.comped_households,
                aiCalls: ai,
                aiCost,
                retention,
                householdSizes,
                invitesSent: inv.sent,
                invitesAccepted: inv.accepted,
                invitesPending: inv.pending,
                onboarding,
                install,
                macrosSource,
                topTags: tagsRes.rows.map((r) => ({ name: r.name, count: Number(r.n) })),
                deviceSplit,
            },
            series: { signups, activeUsers, aiCalls, recipesCreated, listsGenerated, weekAdds, onboardingCompleted },
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
}

// GET /admin/users — one row per user, all-time aggregates. AI usage / week adds
// / list generations are household-scoped (that's how those tables key), so for
// solo households they equal the user's own activity; for shared households each
// member's row reflects the shared household total.
async function users(req, res, next) {
    try {
        const { rows } = await pool.query(`
            SELECT
                u.id, u.name, u.email,
                u."createdAt"     AS created_at,
                u."emailVerified" AS email_verified,
                s.last_active, s.session_count,
                hm.household_id, h.name AS household_name, hmc.member_count AS household_member_count,
                h.plan AS household_plan,
                (h.stripe_subscription_id IS NOT NULL) AS household_paid,
                COALESCE(rc.recipe_count, 0)   AS recipe_count,
                to_jsonb(ai)                   AS ai_usage_json,
                COALESCE(sh.shares_created, 0) AS shares_created,
                COALESCE(ev.week_adds, 0)      AS week_adds,
                COALESCE(ev.lists_generated, 0) AS lists_generated
            FROM "user" u
            LEFT JOIN LATERAL (
                SELECT MAX(GREATEST(se."createdAt", se."updatedAt")) AS last_active,
                       COUNT(*) AS session_count
                FROM "session" se WHERE se."userId" = u.id
            ) s ON true
            LEFT JOIN household_member hm ON hm.user_id = u.id
            LEFT JOIN household h ON h.id = hm.household_id
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS member_count FROM household_member m
                WHERE m.household_id = hm.household_id
            ) hmc ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS recipe_count FROM recipes r WHERE r.user_id = u.id
            ) rc ON true
            LEFT JOIN LATERAL (
                SELECT
                    ${aiActionFilters("ai")},
                    COALESCE(SUM(ai.cost_pence), 0)::float AS cost_pence,
                    COALESCE(SUM(ai.credits), 0)::int      AS credits
                FROM ai_usage ai WHERE ai.household_id = hm.household_id
            ) ai ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS shares_created FROM recipe_shares rs WHERE rs.created_by = u.id
            ) sh ON true
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE type = 'week_add')       AS week_adds,
                    COUNT(*) FILTER (WHERE type = 'list_generated') AS lists_generated
                FROM app_events e WHERE e.user_id = u.id
            ) ev ON true
            ORDER BY u."createdAt" DESC
        `);

        res.json({
            users: rows.map((r) => ({
                id: r.id,
                name: r.name,
                email: r.email,
                created_at: r.created_at,
                email_verified: r.email_verified,
                last_active: r.last_active,
                session_count: Number(r.session_count),
                household_id: r.household_id,
                household_name: r.household_name,
                household_member_count: Number(r.household_member_count),
                plan: r.household_plan ?? "free",
                paid: r.household_paid ?? false,
                recipe_count: Number(r.recipe_count),
                ai_usage: {
                    ...actionCounts(r.ai_usage_json),
                    cost_pence: Number(r.ai_usage_json?.cost_pence ?? 0),
                    credits: Number(r.ai_usage_json?.credits ?? 0),
                },
                shares_created: Number(r.shares_created),
                week_adds: Number(r.week_adds),
                lists_generated: Number(r.lists_generated),
            })),
        });
    } catch (error) {
        next(error);
    }
}

// GET /admin/ai?days=30 — the AI ledger, sliced for the cost & latency panel.
// Everything comes from ai_usage (migration 015). Legacy rows backfilled from
// recipe_imports carry no tokens/cost/latency and are reported separately so
// the averages aren't dragged down by zeros.
async function aiStats(req, res, next) {
    try {
        let days = parseInt(req.query.days, 10);
        if (!ALLOWED_DAYS.includes(days)) days = 30;

        const [byActionRes, byModelRes, outcomesRes, householdsRes, dailyRes, legacyRes] = await Promise.all([
            pool.query(
                `SELECT action,
                        COUNT(*) FILTER (WHERE status <> 'rejected')::int                         AS actions,
                        COUNT(*) FILTER (WHERE status = 'ok' AND credits > 0)::int                AS charged,
                        COUNT(*) FILTER (WHERE status = 'ok' AND credits = 0
                                           AND meta ? 'outcome')::int                             AS refunded,
                        COUNT(*) FILTER (WHERE status = 'failed')::int                            AS failed,
                        COUNT(*) FILTER (WHERE status = 'rejected')::int                          AS rejected,
                        COUNT(*) FILTER (WHERE status = 'pending'
                                           AND created_at < now() - interval '10 minutes')::int   AS stale,
                        COALESCE(SUM(calls), 0)::int                                              AS model_calls,
                        COALESCE(SUM(credits), 0)::int                                            AS credits,
                        COALESCE(SUM(input_tokens), 0)::bigint                                    AS input_tokens,
                        COALESCE(SUM(output_tokens), 0)::bigint                                   AS output_tokens,
                        COALESCE(SUM(cache_read_tokens), 0)::bigint                               AS cache_read_tokens,
                        COALESCE(SUM(cost_usd), 0)::float                                         AS cost_usd,
                        COALESCE(SUM(cost_pence), 0)::float                                       AS cost_pence,
                        percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms)
                            FILTER (WHERE latency_ms IS NOT NULL AND status = 'ok')               AS p50_ms,
                        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
                            FILTER (WHERE latency_ms IS NOT NULL AND status = 'ok')               AS p95_ms,
                        MAX(latency_ms)                                                           AS max_ms
                 FROM ai_usage
                 WHERE created_at >= now() - ($1::int || ' days')::interval
                   AND (meta IS NULL OR NOT (meta ? 'legacy'))
                 GROUP BY action
                 ORDER BY cost_pence DESC, actions DESC`,
                [days],
            ),
            pool.query(
                `SELECT model,
                        COUNT(*)::int                                 AS actions,
                        COALESCE(SUM(calls), 0)::int                  AS model_calls,
                        COALESCE(SUM(input_tokens), 0)::bigint        AS input_tokens,
                        COALESCE(SUM(output_tokens), 0)::bigint       AS output_tokens,
                        COALESCE(SUM(cost_pence), 0)::float           AS cost_pence
                 FROM ai_usage
                 WHERE created_at >= now() - ($1::int || ' days')::interval
                   AND model IS NOT NULL
                 GROUP BY model ORDER BY cost_pence DESC`,
                [days],
            ),
            pool.query(
                `SELECT action, meta->>'outcome' AS outcome, COUNT(*)::int AS n
                 FROM ai_usage
                 WHERE created_at >= now() - ($1::int || ' days')::interval
                   AND meta ? 'outcome'
                 GROUP BY action, outcome ORDER BY n DESC`,
                [days],
            ),
            pool.query(
                `SELECT h.id, h.name, h.plan,
                        COALESCE((SELECT string_agg(u.email, ', ' ORDER BY u.email)
                                  FROM household_member m JOIN "user" u ON u.id = m.user_id
                                  WHERE m.household_id = h.id), '') AS emails,
                        COUNT(*) FILTER (WHERE a.status <> 'rejected')::int AS actions,
                        COALESCE(SUM(a.credits), 0)::int                    AS credits,
                        COALESCE(SUM(a.cost_pence), 0)::float               AS cost_pence,
                        COUNT(*) FILTER (WHERE a.status = 'rejected')::int  AS rejected
                 FROM ai_usage a JOIN household h ON h.id = a.household_id
                 WHERE a.created_at >= now() - ($1::int || ' days')::interval
                 GROUP BY h.id, h.name, h.plan
                 ORDER BY cost_pence DESC, actions DESC
                 LIMIT 12`,
                [days],
            ),
            pool.query(
                `${DAYS_CTE}
                 SELECT d.d::text AS date,
                        COALESCE(SUM(a.cost_pence), 0)::float AS cost_pence,
                        COUNT(a.id) FILTER (WHERE a.status <> 'rejected')::int AS actions
                 FROM days d LEFT JOIN ai_usage a ON a.created_at::date = d.d
                 GROUP BY d.d ORDER BY d.d`,
                [days],
            ),
            pool.query(
                `SELECT COUNT(*)::int AS n FROM ai_usage
                 WHERE created_at >= now() - ($1::int || ' days')::interval
                   AND meta ? 'legacy'`,
                [days],
            ),
        ]);

        const num = (v) => (v == null ? null : Number(v));
        const totals = { actions: 0, modelCalls: 0, credits: 0, costPence: 0, costUsd: 0, failed: 0, refunded: 0, rejected: 0 };
        const byAction = byActionRes.rows.map((r) => {
            totals.actions += Number(r.actions);
            totals.modelCalls += Number(r.model_calls);
            totals.credits += Number(r.credits);
            totals.costPence += Number(r.cost_pence);
            totals.costUsd += Number(r.cost_usd);
            totals.failed += Number(r.failed);
            totals.refunded += Number(r.refunded);
            totals.rejected += Number(r.rejected);
            return {
                action: r.action,
                actions: Number(r.actions),
                charged: Number(r.charged),
                refunded: Number(r.refunded),
                failed: Number(r.failed),
                rejected: Number(r.rejected),
                stale: Number(r.stale),
                modelCalls: Number(r.model_calls),
                credits: Number(r.credits),
                inputTokens: Number(r.input_tokens),
                outputTokens: Number(r.output_tokens),
                cacheReadTokens: Number(r.cache_read_tokens),
                costUsd: Number(r.cost_usd),
                costPence: Number(r.cost_pence),
                p50Ms: num(r.p50_ms),
                p95Ms: num(r.p95_ms),
                maxMs: num(r.max_ms),
            };
        });
        totals.costPence = Math.round(totals.costPence * 100) / 100;
        totals.costUsd = Math.round(totals.costUsd * 1e4) / 1e4;

        res.json({
            days,
            totals,
            byAction,
            byModel: byModelRes.rows.map((r) => ({
                model: r.model,
                actions: Number(r.actions),
                modelCalls: Number(r.model_calls),
                inputTokens: Number(r.input_tokens),
                outputTokens: Number(r.output_tokens),
                costPence: Number(r.cost_pence),
            })),
            outcomes: outcomesRes.rows.map((r) => ({ action: r.action, outcome: r.outcome, count: Number(r.n) })),
            topHouseholds: householdsRes.rows.map((r) => ({
                id: r.id,
                name: r.name,
                plan: r.plan,
                emails: r.emails,
                actions: Number(r.actions),
                credits: Number(r.credits),
                costPence: Number(r.cost_pence),
                rejected: Number(r.rejected),
            })),
            daily: dailyRes.rows.map((r) => ({ date: r.date, costPence: Number(r.cost_pence), count: Number(r.actions) })),
            legacyRows: Number(legacyRes.rows[0].n),
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
}

// ===== Config (admin writes) =====
// The knobs in app_config (lib/config.js): trial length, allowances, weights,
// free-tier household size, founders' offer. A change applies to households
// created afterwards; existing ones keep their snapshot.

// GET /admin/config
async function getConfigHandler(req, res, next) {
    try {
        const { getConfigWithMeta, DEFAULTS } = require("../lib/config");
        const { cfg, meta } = await getConfigWithMeta();
        res.json({ config: cfg, meta, defaults: DEFAULTS });
    } catch (error) {
        next(error);
    }
}

// PUT /admin/config { key, value }
async function putConfigHandler(req, res, next) {
    try {
        const { setConfig, getConfigWithMeta } = require("../lib/config");
        const key = typeof req.body?.key === "string" ? req.body.key : "";
        if (!key || !("value" in (req.body ?? {}))) {
            return res.status(400).json({ error: "key and value are required." });
        }
        await setConfig(key, req.body.value, req.user.email);
        db.recordEvent("config_changed", {
            userId: req.user.id,
            meta: { key, value: req.body.value, by: req.user.email },
        });
        const { cfg, meta } = await getConfigWithMeta();
        res.json({ config: cfg, meta });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ error: error.message });
        next(error);
    }
}

// GET /admin/credits?days=30 — the credit model in numbers: how households are
// spread across their allowance this period, how many are at the ceiling, and
// the trial funnel. Per-household usage is computed with the same
// credit_period() + live-credit sum the entitlement check uses.
async function creditStats(req, res, next) {
    try {
        let days = parseInt(req.query.days, 10);
        if (!ALLOWED_DAYS.includes(days)) days = 30;

        const [householdsRes, trialRes, rejectedRes] = await Promise.all([
            pool.query(`
                WITH hh AS (
                    SELECT h.id,
                           CASE
                               WHEN h.plan = 'premium' AND (h.premium_until IS NULL OR h.premium_until > now()) THEN 'premium'
                               WHEN h.trial_ends_at > now() THEN 'trial'
                               ELSE 'free'
                           END AS plan,
                           CASE
                               WHEN h.plan = 'premium' AND (h.premium_until IS NULL OR h.premium_until > now()) THEN h.premium_credit_allowance
                               WHEN h.trial_ends_at > now() THEN h.premium_credit_allowance
                               ELSE h.credit_allowance
                           END AS allowance,
                           p.period_start, p.period_end,
                           (SELECT COALESCE(SUM(u.credits), 0)::int FROM ai_usage u
                             WHERE u.household_id = h.id AND u.created_at >= p.period_start
                               AND (u.status = 'ok' OR (u.status = 'pending' AND u.created_at > now() - interval '10 minutes'))) AS used
                    FROM household h
                    CROSS JOIN LATERAL credit_period(COALESCE(h.credit_anchor_at, h.created_at)) p
                )
                SELECT plan,
                       COUNT(*)::int AS households,
                       COUNT(*) FILTER (WHERE used > 0)::int AS active,
                       COUNT(*) FILTER (WHERE allowance IS NOT NULL AND used >= allowance)::int AS at_ceiling,
                       COUNT(*) FILTER (WHERE allowance IS NOT NULL AND used >= allowance * 0.8)::int AS near_ceiling,
                       COALESCE(AVG(used), 0)::float AS avg_used,
                       COALESCE(percentile_cont(0.5)  WITHIN GROUP (ORDER BY used), 0)::float AS p50,
                       COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY used), 0)::float AS p75,
                       COALESCE(percentile_cont(0.9)  WITHIN GROUP (ORDER BY used), 0)::float AS p90,
                       COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY used), 0)::float AS p95,
                       MAX(used)::int AS max_used,
                       COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY used) FILTER (WHERE used > 0), 0)::float AS p50_active,
                       COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY used) FILTER (WHERE used > 0), 0)::float AS p90_active
                FROM hh
                GROUP BY plan
                ORDER BY plan
            `),
            pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE trial_ends_at > now())::int AS active,
                    COUNT(*) FILTER (WHERE trial_ends_at <= now() AND plan <> 'premium')::int AS expired_free,
                    COUNT(*) FILTER (WHERE trial_ends_at IS NOT NULL AND plan = 'premium' AND stripe_subscription_id IS NOT NULL)::int AS paying,
                    COUNT(*) FILTER (WHERE trial_ends_at > now() AND trial_ends_at <= now() + interval '4 days')::int AS ending_soon,
                    (SELECT COUNT(*)::int FROM app_events WHERE type = 'trial_started'
                       AND created_at >= now() - ($1::int || ' days')::interval) AS started_in_range,
                    (SELECT COUNT(*)::int FROM app_events WHERE type = 'trial_converted'
                       AND created_at >= now() - ($1::int || ' days')::interval) AS converted_in_range,
                    (SELECT COUNT(*)::int FROM app_events WHERE type = 'trial_prompt' AND meta->>'channel' = 'email'
                       AND created_at >= now() - ($1::int || ' days')::interval) AS emails_in_range,
                    (SELECT COUNT(*)::int FROM app_events WHERE type = 'trial_prompt' AND meta->>'channel' = 'app'
                       AND created_at >= now() - ($1::int || ' days')::interval) AS cards_in_range
                 FROM household`,
                [days],
            ),
            pool.query(
                `SELECT COUNT(*)::int AS rejections,
                        COUNT(DISTINCT household_id)::int AS households
                 FROM ai_usage
                 WHERE status = 'rejected'
                   AND created_at >= now() - ($1::int || ' days')::interval`,
                [days],
            ),
        ]);

        const byPlan = {};
        for (const r of householdsRes.rows) {
            byPlan[r.plan] = {
                households: Number(r.households),
                active: Number(r.active),
                atCeiling: Number(r.at_ceiling),
                nearCeiling: Number(r.near_ceiling),
                avgUsed: Math.round(Number(r.avg_used) * 10) / 10,
                p50: Math.round(Number(r.p50) * 10) / 10,
                p75: Math.round(Number(r.p75) * 10) / 10,
                p90: Math.round(Number(r.p90) * 10) / 10,
                p95: Math.round(Number(r.p95) * 10) / 10,
                max: Number(r.max_used),
                p50Active: Math.round(Number(r.p50_active) * 10) / 10,
                p90Active: Math.round(Number(r.p90_active) * 10) / 10,
            };
        }
        const t = trialRes.rows[0];
        const rj = rejectedRes.rows[0];
        res.json({
            days,
            byPlan,
            trial: {
                active: Number(t.active),
                endingSoon: Number(t.ending_soon),
                expiredFree: Number(t.expired_free),
                paying: Number(t.paying),
                startedInRange: Number(t.started_in_range),
                convertedInRange: Number(t.converted_in_range),
                emailsInRange: Number(t.emails_in_range),
                cardsInRange: Number(t.cards_in_range),
            },
            rejections: { count: Number(rj.rejections), households: Number(rj.households) },
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
}

// ===== Premium comps (admin writes) =====
// Entitlement is household.plan, so a "comp" is just a premium household with no
// Stripe subscription — nothing overwrites it (the Stripe callbacks only touch
// households that actually have a subscription). Granted premium never expires
// until revoked here.

async function householdIdForEmail(email) {
    const { rows } = await pool.query(
        `SELECT hm.household_id
         FROM household_member hm JOIN "user" u ON u.id = hm.user_id
         WHERE lower(u.email) = lower($1)
         LIMIT 1`,
        [email],
    );
    return rows[0]?.household_id ?? null;
}

// GET /admin/premium/comps — households comped to premium (premium, no Stripe sub).
async function comps(req, res, next) {
    try {
        const { rows } = await pool.query(`
            SELECT h.id,
                   h.created_at,
                   COALESCE(
                       json_agg(u.email ORDER BY u.email) FILTER (WHERE u.email IS NOT NULL),
                       '[]'
                   ) AS emails
            FROM household h
            LEFT JOIN household_member hm ON hm.household_id = h.id
            LEFT JOIN "user" u ON u.id = hm.user_id
            WHERE h.plan = 'premium' AND h.stripe_subscription_id IS NULL
            GROUP BY h.id
            ORDER BY h.created_at DESC NULLS LAST
        `);
        res.json({ comps: rows });
    } catch (error) {
        next(error);
    }
}

// POST /admin/premium/grant { email } — comp that user's household to premium.
async function grantPremium(req, res, next) {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
        if (!email) return res.status(400).json({ error: "An email is required." });
        const householdId = await householdIdForEmail(email);
        if (!householdId) return res.status(404).json({ error: "No account with that email." });

        // Comp = premium with no expiry and no credit ceiling. Leaves any Stripe
        // fields untouched, so a real paying household simply stays premium.
        await pool.query(
            `UPDATE household
             SET plan = 'premium', premium_until = NULL, premium_credit_allowance = NULL
             WHERE id = $1`,
            [householdId],
        );
        await pool.query(
            `INSERT INTO app_events (type, user_id, household_id, meta)
             VALUES ('premium_granted', $1, $2, $3)`,
            [req.user.id, householdId, JSON.stringify({ email, by: req.user.email })],
        );
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
}

// POST /admin/premium/revoke { email } — drop a comped household back to free.
// Refuses if the household has a real Stripe subscription (cancel that in Stripe
// instead — revoking here would only be undone by the next webhook).
async function revokePremium(req, res, next) {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
        if (!email) return res.status(400).json({ error: "An email is required." });
        const householdId = await householdIdForEmail(email);
        if (!householdId) return res.status(404).json({ error: "No account with that email." });

        const { rows } = await pool.query(
            "SELECT stripe_subscription_id FROM household WHERE id = $1",
            [householdId],
        );
        if (rows[0]?.stripe_subscription_id) {
            return res.status(409).json({
                error: "That household has an active paid subscription — cancel it in Stripe instead.",
            });
        }

        await pool.query(
            `UPDATE household
             SET plan = 'free', premium_until = NULL, premium_payer_user_id = NULL,
                 premium_credit_allowance = (SELECT (value)::int FROM app_config WHERE key = 'premium_credit_allowance')
             WHERE id = $1`,
            [householdId],
        );
        await pool.query(
            `INSERT INTO app_events (type, user_id, household_id, meta)
             VALUES ('premium_revoked', $1, $2, $3)`,
            [req.user.id, householdId, JSON.stringify({ email, by: req.user.email })],
        );
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    overview,
    users,
    aiStats,
    creditStats,
    getConfig: getConfigHandler,
    putConfig: putConfigHandler,
    comps,
    grantPremium,
    revokePremium,
};
