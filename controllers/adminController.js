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

        const [totalsRes, aiRes, invitesRes, macrosRes, tagsRes, deviceRes, onboardingRes, installRes, unverifiedRes, retentionRes, sizesRes, nudgeRes] =
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
                // "Shop together" nudge funnel + invite flow over the window.
                pool.query(
                    `SELECT
                        COUNT(DISTINCT household_id) FILTER (WHERE type = 'household_nudge_shown')::int AS shown,
                        COUNT(*) FILTER (WHERE type = 'household_nudge_outcome' AND meta->>'outcome' = 'invited')::int   AS invited,
                        COUNT(*) FILTER (WHERE type = 'household_nudge_outcome' AND meta->>'outcome' = 'later')::int     AS later,
                        COUNT(*) FILTER (WHERE type = 'household_nudge_outcome' AND meta->>'outcome' = 'never')::int     AS never,
                        COUNT(*) FILTER (WHERE type = 'household_nudge_outcome' AND meta->>'outcome' = 'dismissed')::int AS dismissed,
                        COUNT(*) FILTER (WHERE type = 'invite_sent')::int     AS invites_sent,
                        COUNT(*) FILTER (WHERE type = 'invite_accepted')::int AS invites_accepted,
                        (SELECT COUNT(*) FROM household h WHERE NOT EXISTS (
                            SELECT 1 FROM household_member m WHERE m.household_id = h.id GROUP BY m.household_id HAVING COUNT(*) > 1)
                          AND EXISTS (SELECT 1 FROM household_member m JOIN user_activity a ON a.user_id = m.user_id
                                      WHERE m.household_id = h.id AND a.day > (now() AT TIME ZONE 'Europe/London')::date - $1::int))::int AS solo_active
                     FROM app_events
                     WHERE created_at >= now() - ($1::int || ' days')::interval
                       AND type IN ('household_nudge_shown','household_nudge_outcome','invite_sent','invite_accepted')`,
                    [days],
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
                householdNudge: {
                    shown: nudgeRes.rows[0].shown,
                    invited: nudgeRes.rows[0].invited,
                    later: nudgeRes.rows[0].later,
                    never: nudgeRes.rows[0].never,
                    dismissed: nudgeRes.rows[0].dismissed,
                    invitesSent: nudgeRes.rows[0].invites_sent,
                    invitesAccepted: nudgeRes.rows[0].invites_accepted,
                    soloActive: nudgeRes.rows[0].solo_active,
                },
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
                COALESCE(ev.lists_generated, 0) AS lists_generated,
                u.installed_at, u.installed_platform, u.last_standalone_at
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
                installed_at: r.installed_at,
                installed_platform: r.installed_platform,
                last_standalone_at: r.last_standalone_at,
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

// ===== History (daily snapshots → months) =====

const HISTORY_COLUMNS = [
    ["month", "Month"], ["users", "Users"], ["signups", "Signups"], ["active_7d", "Active 7d (month end)"],
    ["d7", "Day-7 retention %"], ["d7_cohort", "D7 cohort"], ["paid_households", "Paying households"],
    ["mrr_pence", "MRR (pence)"], ["cancellations", "Cancellations"], ["trials_started", "Trials started"],
    ["trials_converted", "Trials converted"], ["ai_actions", "AI actions"], ["ai_cost_pence", "AI cost (pence)"],
    ["cost_per_paying_pence", "AI cost per paying household (pence)"], ["recipes_created", "Recipes added"],
    ["lists_generated", "Lists generated"], ["shops_finished", "Shops finished"], ["seat_hits", "Invites blocked by seats"],
    ["onboarding_completed", "Onboarding completed"], ["onboarding_skipped", "Onboarding skipped"], ["partial", "Partial month"],
];

const SUMMED = ["signups", "active_users", "ai_actions", "ai_rejected", "ai_credits", "ai_cost_pence", "aisle_actions", "aisle_model_calls",
    "lists_generated", "week_adds", "shops_finished", "recipes_created", "trials_started", "trials_converted", "trials_expired",
    "cancellations", "subscriptions_ended", "seat_hits", "cta_taps", "checkouts_started", "onboarding_shown", "onboarding_completed", "onboarding_skipped",
    "standalone_active_users", "invites_sent", "invites_accepted", "nudges_shown", "nudges_invited"];
const STOCKS = ["users", "verified_users", "households", "multi_member_households", "premium_households", "paid_households", "comped_households",
    "subs_monthly", "subs_annual", "subs_founders", "mrr_pence", "recipes", "trials_active", "aisle_rows", "active_7d", "active_30d",
    "installed_users", "standalone_active_7d", "standalone_active_30d"];

// Roll daily snapshots up into months: stocks from the last day, flows summed,
// retention weighted by cohort. The current month is flagged partial.
async function historyRows(months) {
    const { rows } = await pool.query(
        `SELECT day::text AS day, metrics FROM metric_snapshots
         WHERE day >= date_trunc('month', (now() AT TIME ZONE 'Europe/London')::date) - ($1::int || ' months')::interval
         ORDER BY day`,
        [months],
    );
    const byMonth = new Map();
    for (const r of rows) {
        const month = r.day.slice(0, 7);
        let m = byMonth.get(month);
        if (!m) {
            m = { month, days: 0, reconstructed: new Set(), ret: { d1: [0, 0], d7: [0, 0], d30: [0, 0] } };
            for (const k of SUMMED) m[k] = 0;
            byMonth.set(month, m);
        }
        m.days++;
        for (const k of SUMMED) m[k] += Number(r.metrics?.[k]) || 0;
        for (const k of STOCKS) m[k] = r.metrics?.[k] ?? m[k] ?? null; // last day wins
        for (const k of r.metrics?.reconstructed ?? []) m.reconstructed.add(k);
        for (const d of ["d1", "d7", "d30"]) {
            const x = r.metrics?.retention?.[d];
            if (x) { m.ret[d][0] += x.cohort; m.ret[d][1] += x.retained; }
        }
        m.lastDay = r.day;
    }
    const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }).slice(0, 7);
    return [...byMonth.values()].map((m) => {
        const pctOf = (d) => (m.ret[d][0] ? Math.round((m.ret[d][1] / m.ret[d][0]) * 1000) / 10 : null);
        return {
            ...m,
            ai_cost_pence: Math.round(m.ai_cost_pence * 100) / 100,
            d1: pctOf("d1"), d7: pctOf("d7"), d30: pctOf("d30"),
            d7_cohort: m.ret.d7[0],
            cost_per_paying_pence: m.paid_households ? Math.round((m.ai_cost_pence / m.paid_households) * 100) / 100 : null,
            reconstructed: [...m.reconstructed],
            partial: m.month === thisMonth,
            ret: undefined,
        };
    });
}

// GET /admin/history?months=12[&format=csv]
async function history(req, res, next) {
    try {
        let months = parseInt(req.query.months, 10);
        if (!Number.isInteger(months) || months < 1 || months > 36) months = 12;
        const rowsOut = await historyRows(months);
        if (req.query.format === "csv") {
            const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
            const lines = [HISTORY_COLUMNS.map(([, label]) => esc(label)).join(",")];
            for (const r of rowsOut) lines.push(HISTORY_COLUMNS.map(([k]) => esc(k === "partial" ? (r.partial ? "yes" : "") : r[k])).join(","));
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="fornetto-history-${new Date().toISOString().slice(0, 10)}.csv"`);
            return res.send("\uFEFF" + lines.join("\n"));
        }
        res.json({ months: rowsOut, generated_at: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
}

// ===== Onboarding (the questionnaire, step by step) =====
// GET /admin/onboarding?days=30 — per distinct user in the window, first
// occurrence of each event. Everything comes from app_events the wizard already
// logs; see the frontend's onboarding-wizard.tsx for what each meta key means.
async function onboardingStats(req, res, next) {
    try {
        let days = parseInt(req.query.days, 10);
        if (!ALLOWED_DAYS.includes(days)) days = 30;
        const win = "created_at >= now() - ($1::int || ' days')::interval";

        const [funnelRes, skipsRes, dietRes, dietsRes, proteinsRes, scopeRes, startersRes, usualsRes, followRes, entryRes] = await Promise.all([
            pool.query(
                `WITH e AS (SELECT user_id, type, meta FROM app_events WHERE user_id IS NOT NULL AND type LIKE 'onboarding_%' AND ${win})
                 SELECT
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_shown')::int AS shown,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_started')::int AS started,
                    COUNT(DISTINCT user_id) FILTER (WHERE (type = 'onboarding_step' AND (meta->>'step')::int >= 2) OR type = 'onboarding_completed')::int AS step2,
                    COUNT(DISTINCT user_id) FILTER (WHERE (type = 'onboarding_step' AND (meta->>'step')::int >= 3) OR type = 'onboarding_completed')::int AS step3,
                    COUNT(DISTINCT user_id) FILTER (WHERE (type = 'onboarding_step' AND (meta->>'step')::int >= 4) OR type = 'onboarding_completed')::int AS step4,
                    COUNT(DISTINCT user_id) FILTER (WHERE (type = 'onboarding_step' AND (meta->>'step')::int >= 5) OR type = 'onboarding_completed')::int AS step5,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_completed')::int AS completed,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_skipped')::int AS skipped,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_ai_handoff')::int AS ai_handoff,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_usuals_typed')::int AS usuals_typed,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_completed' AND (meta->>'added')::int > 0)::int AS added_from_list,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_completed' AND COALESCE((meta->>'usuals')::int, 0) > 0)::int AS added_own,
                    COUNT(DISTINCT user_id) FILTER (WHERE type = 'onboarding_completed' AND COALESCE((meta->>'added')::int, 0) = 0 AND COALESCE((meta->>'usuals_written')::int, 0) = 0)::int AS completed_empty,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY (meta->>'ms')::float) FILTER (WHERE type = 'onboarding_completed' AND meta ? 'ms') AS median_ms
                 FROM e`,
                [days],
            ),
            pool.query(
                `SELECT (meta->>'step')::int AS step, (meta->>'soft')::boolean AS soft, COUNT(DISTINCT user_id)::int AS n
                 FROM app_events WHERE type = 'onboarding_skipped' AND user_id IS NOT NULL AND ${win}
                 GROUP BY 1, 2 ORDER BY 1, 2`,
                [days],
            ),
            pool.query(
                `WITH last AS (
                    SELECT DISTINCT ON (user_id) user_id, meta FROM app_events
                    WHERE type IN ('onboarding_completed', 'onboarding_ai_handoff') AND user_id IS NOT NULL AND ${win}
                    ORDER BY user_id, created_at DESC)
                 SELECT COUNT(*)::int AS answered,
                        COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(meta->'diets', '[]'::jsonb)) > 0)::int AS with_diets,
                        COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(meta->'proteins', '[]'::jsonb)) > 0)::int AS with_proteins
                 FROM last`,
                [days],
            ),
            pool.query(
                `SELECT d AS diet, COUNT(DISTINCT user_id)::int AS n
                 FROM app_events, jsonb_array_elements_text(COALESCE(meta->'diets', '[]'::jsonb)) AS d
                 WHERE type IN ('onboarding_completed', 'onboarding_ai_handoff') AND user_id IS NOT NULL AND ${win}
                 GROUP BY 1 ORDER BY n DESC`,
                [days],
            ),
            pool.query(
                `SELECT p AS protein, COUNT(DISTINCT user_id)::int AS n
                 FROM app_events, jsonb_array_elements_text(COALESCE(meta->'proteins', '[]'::jsonb)) AS p
                 WHERE type = 'onboarding_completed' AND user_id IS NOT NULL AND ${win}
                 GROUP BY 1 ORDER BY n DESC`,
                [days],
            ),
            pool.query(
                `SELECT COALESCE(meta->>'scope', 'unanswered') AS scope, COUNT(DISTINCT user_id)::int AS n
                 FROM app_events WHERE type = 'onboarding_completed' AND user_id IS NOT NULL AND ${win} GROUP BY 1`,
                [days],
            ),
            pool.query(
                `SELECT COALESCE(AVG((meta->>'offered')::float), 0)::float AS avg_offered,
                        COALESCE(AVG((meta->>'chosen')::float), 0)::float AS avg_chosen,
                        COALESCE(AVG((meta->>'added')::float), 0)::float AS avg_added,
                        COALESCE(SUM((meta->>'added')::int), 0)::int AS total_added
                 FROM app_events WHERE type = 'onboarding_completed' AND ${win}`,
                [days],
            ),
            pool.query(
                `SELECT COUNT(*)::int AS runs,
                        COALESCE(SUM((meta->>'requested')::int), 0)::int AS dishes,
                        COALESCE(SUM((meta->>'written')::int), 0)::int AS written,
                        COALESCE(SUM((meta->>'title_only')::int), 0)::int AS title_only,
                        COALESCE(SUM((meta->>'failed')::int), 0)::int AS failed,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY (meta->>'ms')::float) AS median_ms
                 FROM app_events WHERE type = 'onboarding_usuals' AND ${win}`,
                [days],
            ),
            // What onboarded people did in the 7 days after finishing (or skipping).
            pool.query(
                `WITH done AS (
                    SELECT DISTINCT ON (user_id) user_id, type AS outcome, created_at FROM app_events
                    WHERE type IN ('onboarding_completed', 'onboarding_skipped') AND user_id IS NOT NULL AND ${win}
                    ORDER BY user_id, created_at DESC)
                 SELECT outcome,
                        COUNT(*)::int AS n,
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_events x WHERE x.user_id = d.user_id AND x.type = 'recipe_created' AND x.created_at BETWEEN d.created_at AND d.created_at + interval '7 days'))::int AS added_recipe,
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_events x WHERE x.user_id = d.user_id AND x.type = 'week_add' AND x.created_at BETWEEN d.created_at AND d.created_at + interval '7 days'))::int AS planned_week,
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_events x WHERE x.user_id = d.user_id AND x.type = 'list_generated' AND x.created_at BETWEEN d.created_at AND d.created_at + interval '7 days'))::int AS generated_list,
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_events x WHERE x.user_id = d.user_id AND x.type = 'shop_finished' AND x.created_at BETWEEN d.created_at AND d.created_at + interval '7 days'))::int AS finished_shop
                 FROM done d GROUP BY outcome`,
                [days],
            ),
            pool.query(
                `WITH shown AS (
                    SELECT DISTINCT ON (user_id) user_id, COALESCE(meta->>'entry', 'auto') AS entry FROM app_events
                    WHERE type = 'onboarding_shown' AND user_id IS NOT NULL AND ${win} ORDER BY user_id, created_at)
                 SELECT s.entry, COUNT(*)::int AS shown,
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_events c WHERE c.user_id = s.user_id AND c.type = 'onboarding_completed' AND c.${win}))::int AS completed
                 FROM shown s GROUP BY s.entry`,
                [days],
            ),
        ]);

        const f = funnelRes.rows[0];
        const n = (v) => Number(v) || 0;
        res.json({
            days,
            funnel: {
                shown: n(f.shown), started: n(f.started), step2: n(f.step2), step3: n(f.step3), step4: n(f.step4), step5: n(f.step5),
                completed: n(f.completed), skipped: n(f.skipped), aiHandoff: n(f.ai_handoff),
                medianMs: f.median_ms == null ? null : Math.round(Number(f.median_ms)),
            },
            skipsByStep: skipsRes.rows.map((r) => ({ step: r.step, soft: Boolean(r.soft), users: r.n })),
            byEntry: entryRes.rows.map((r) => ({ entry: r.entry, shown: r.shown, completed: r.completed })),
            dietary: {
                answered: n(dietRes.rows[0].answered),
                withDiets: n(dietRes.rows[0].with_diets),
                withProteins: n(dietRes.rows[0].with_proteins),
                diets: dietsRes.rows.map((r) => ({ label: r.diet, value: r.n })),
                proteins: proteinsRes.rows.map((r) => ({ label: r.protein, value: r.n })),
                scope: scopeRes.rows.map((r) => ({ label: r.scope, value: r.n })),
            },
            starters: {
                avgOffered: Math.round(Number(startersRes.rows[0].avg_offered) * 10) / 10,
                avgChosen: Math.round(Number(startersRes.rows[0].avg_chosen) * 10) / 10,
                avgAdded: Math.round(Number(startersRes.rows[0].avg_added) * 10) / 10,
                totalAdded: n(startersRes.rows[0].total_added),
                addedFromList: n(f.added_from_list),
            },
            usuals: {
                typed: n(f.usuals_typed),
                addedOwn: n(f.added_own),
                runs: n(usualsRes.rows[0].runs),
                dishes: n(usualsRes.rows[0].dishes),
                written: n(usualsRes.rows[0].written),
                titleOnly: n(usualsRes.rows[0].title_only),
                failed: n(usualsRes.rows[0].failed),
                medianMs: usualsRes.rows[0].median_ms == null ? null : Math.round(Number(usualsRes.rows[0].median_ms)),
            },
            outcomes: { completedEmpty: n(f.completed_empty) },
            followThrough: followRes.rows.map((r) => ({
                outcome: r.outcome === "onboarding_completed" ? "completed" : "skipped",
                users: r.n, addedRecipe: r.added_recipe, plannedWeek: r.planned_week, generatedList: r.generated_list, finishedShop: r.finished_shop,
            })),
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
}

// ===== Recipes: what people add, and one person's list =====
// Aggregate first (nobody named), then per user (titles + metadata), then the
// full recipe only on demand with a reason — every per-user look is logged as
// admin_viewed_user / admin_viewed_recipe so there is a record of who read what.

const RECIPE_SOURCES = ["manual", "import", "photo", "generate", "social", "share", "starter", "usuals"];

// GET /admin/recipes/overview?days=30
async function recipesOverview(req, res, next) {
    try {
        let days = parseInt(req.query.days, 10);
        if (!ALLOWED_DAYS.includes(days)) days = 30;
        const [sourcesRes, shapeRes, repeatsRes, recentRes, tagsRes] = await Promise.all([
            pool.query(
                `SELECT COALESCE(meta->>'source', 'unknown') AS source, COUNT(*)::int AS n
                 FROM app_events WHERE type = 'recipe_created' AND created_at >= now() - ($1::int || ' days')::interval
                 GROUP BY 1 ORDER BY n DESC`,
                [days],
            ),
            pool.query(
                `SELECT COUNT(*)::int AS recipes,
                        COUNT(*) FILTER (WHERE image_url IS NOT NULL)::int AS with_photo,
                        COUNT(*) FILTER (WHERE link_url IS NOT NULL AND link_url <> '')::int AS with_link,
                        COUNT(*) FILTER (WHERE favorite)::int AS favourited,
                        COUNT(*) FILTER (WHERE macros_source IS NOT NULL)::int AS with_macros,
                        COALESCE(AVG(ing.n), 0)::float AS avg_ingredients,
                        COALESCE(AVG(array_length(string_to_array(COALESCE(instructions, ''), E'\\n'), 1)), 0)::float AS avg_steps,
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_events e WHERE e.type = 'week_add' AND (e.meta->>'recipe_id')::int = r.id))::int AS ever_on_menu
                 FROM recipes r
                 LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) ing ON true
                 WHERE r.created_at >= now() - ($1::int || ' days')::interval`,
                [days],
            ),
            pool.query(
                `SELECT lower(regexp_replace(trim(title), '\\s+', ' ', 'g')) AS title, COUNT(DISTINCT household_id)::int AS households, COUNT(*)::int AS n
                 FROM recipes WHERE title IS NOT NULL
                 GROUP BY 1 HAVING COUNT(DISTINCT household_id) >= 2
                 ORDER BY households DESC, n DESC LIMIT 25`,
            ),
            pool.query(
                `SELECT r.id, r.title, r.created_at, r.is_on_menu, r.favorite, (r.image_url IS NOT NULL) AS has_photo,
                        left(md5(COALESCE(r.household_id, '')), 6) AS household_key,
                        (SELECT e.meta->>'source' FROM app_events e WHERE e.type = 'recipe_created' AND (e.meta->>'recipe_id')::int = r.id LIMIT 1) AS source,
                        COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = r.id), '{}') AS tags
                 FROM recipes r ORDER BY r.created_at DESC NULLS LAST, r.id DESC LIMIT 50`,
            ),
            pool.query(
                `SELECT t.name, COUNT(DISTINCT r.household_id)::int AS households, COUNT(*)::int AS n
                 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id JOIN recipes r ON r.id = rt.recipe_id
                 WHERE r.created_at >= now() - ($1::int || ' days')::interval
                 GROUP BY t.name ORDER BY n DESC LIMIT 15`,
                [days],
            ),
        ]);
        const s = shapeRes.rows[0];
        const sources = Object.fromEntries(RECIPE_SOURCES.map((k) => [k, 0]));
        for (const r of sourcesRes.rows) sources[r.source in sources ? r.source : "unknown"] = (sources[r.source] ?? 0) + Number(r.n);
        res.json({
            days,
            sources,
            shape: {
                recipes: Number(s.recipes), withPhoto: Number(s.with_photo), withLink: Number(s.with_link), favourited: Number(s.favourited),
                withMacros: Number(s.with_macros), avgIngredients: Math.round(Number(s.avg_ingredients) * 10) / 10,
                avgSteps: Math.round(Number(s.avg_steps) * 10) / 10, everOnMenu: Number(s.ever_on_menu),
            },
            repeats: repeatsRes.rows.map((r) => ({ title: r.title, households: r.households, count: r.n })),
            topTags: tagsRes.rows.map((r) => ({ name: r.name, households: r.households, count: r.n })),
            recent: recentRes.rows.map((r) => ({
                id: r.id, title: r.title, created_at: r.created_at, on_menu: r.is_on_menu, favourite: r.favorite, has_photo: r.has_photo,
                household_key: r.household_key, source: r.source ?? null, tags: r.tags ?? [],
            })),
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
}

// GET /admin/installs?days=30 — who has put Fornetto on a home screen, and
// whether it changes how they use it. "Installed" = at least one launch in
// standalone display-mode (user.installed_at, migration 021); iOS gives no
// other signal. The comparison is installed users vs everyone else over the
// window — installed people are self-selected (they came back at least once),
// so read it as "how the two groups behave", not as the effect of installing.
async function installStats(req, res, next) {
    try {
        let days = parseInt(req.query.days, 10);
        if (!ALLOWED_DAYS.includes(days)) days = 30;
        const win = [days];
        const SINCE = `((now() AT TIME ZONE 'Europe/London')::date - $1::int)`;

        const [totals, cohorts, platforms, compare, retention, weekly, recent] = await Promise.all([
            pool.query(
                `SELECT
                    (SELECT COUNT(*) FROM "user")::int AS users,
                    (SELECT COUNT(*) FROM "user" WHERE installed_at IS NOT NULL)::int AS installed_users,
                    (SELECT COUNT(*) FROM "user" WHERE installed_at > now() - ($1::int || ' days')::interval)::int AS installed_in_window,
                    (SELECT COUNT(*) FROM "user" WHERE "createdAt" > now() - ($1::int || ' days')::interval)::int AS signups_in_window,
                    (SELECT COUNT(*) FROM "user" WHERE "createdAt" > now() - ($1::int || ' days')::interval AND installed_at IS NOT NULL)::int AS signups_installed,
                    (SELECT COUNT(DISTINCT user_id) FROM user_activity WHERE day > ${SINCE})::int AS active_users,
                    (SELECT COUNT(DISTINCT user_id) FROM user_activity WHERE standalone AND day > ${SINCE})::int AS standalone_active,
                    (SELECT COUNT(*) FROM (
                        SELECT user_id FROM user_activity WHERE day > ${SINCE}
                        GROUP BY user_id HAVING bool_or(standalone) AND NOT bool_and(standalone)) x)::int AS mixed,
                    (SELECT COUNT(*) FROM user_activity WHERE day > ${SINCE})::int AS active_days,
                    (SELECT COUNT(*) FROM user_activity WHERE standalone AND day > ${SINCE})::int AS standalone_days,
                    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (installed_at - "createdAt")) / 86400)
                       FROM "user" WHERE installed_at IS NOT NULL)::float AS median_days_to_install`,
                win,
            ),
            pool.query(
                `SELECT to_char(date_trunc('month', "createdAt" AT TIME ZONE 'Europe/London'), 'YYYY-MM') AS month,
                        COUNT(*)::int AS signups,
                        COUNT(*) FILTER (WHERE installed_at IS NOT NULL)::int AS installed,
                        COUNT(*) FILTER (WHERE installed_at < "createdAt" + interval '1 day')::int AS installed_1d,
                        COUNT(*) FILTER (WHERE installed_at < "createdAt" + interval '7 days')::int AS installed_7d
                 FROM "user"
                 WHERE "createdAt" > now() - interval '12 months'
                 GROUP BY 1 ORDER BY 1 DESC`,
            ),
            pool.query(
                `SELECT COALESCE(installed_platform, 'unknown') AS platform, COUNT(*)::int AS n
                 FROM "user" WHERE installed_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
            ),
            pool.query(
                `WITH act AS (
                    SELECT user_id, COUNT(*)::int AS days, COUNT(*) FILTER (WHERE standalone)::int AS sa_days
                    FROM user_activity WHERE day > ${SINCE} GROUP BY user_id
                 ), ev AS (
                    SELECT user_id,
                           COUNT(*) FILTER (WHERE type = 'recipe_created')::int AS recipes,
                           COUNT(*) FILTER (WHERE type = 'list_generated')::int AS lists,
                           COUNT(*) FILTER (WHERE type = 'shop_finished')::int AS shops,
                           COUNT(*) FILTER (WHERE type = 'week_add')::int AS week_adds
                    FROM app_events
                    WHERE user_id IS NOT NULL AND created_at > now() - ($1::int || ' days')::interval
                    GROUP BY user_id
                 ), u AS (
                    SELECT u.id, (u.installed_at IS NOT NULL) AS installed,
                           COALESCE(h.plan = 'premium' AND h.stripe_subscription_id IS NOT NULL, false) AS paying
                    FROM "user" u
                    LEFT JOIN household_member hm ON hm.user_id = u.id
                    LEFT JOIN household h ON h.id = hm.household_id
                 )
                 SELECT u.installed,
                        COUNT(*)::int AS users,
                        COUNT(act.user_id)::int AS active,
                        COALESCE(AVG(act.days), 0)::float AS avg_active_days,
                        COALESCE(AVG(COALESCE(ev.recipes, 0)) FILTER (WHERE act.user_id IS NOT NULL), 0)::float AS avg_recipes,
                        COALESCE(AVG(COALESCE(ev.lists, 0)) FILTER (WHERE act.user_id IS NOT NULL), 0)::float AS avg_lists,
                        COALESCE(AVG(COALESCE(ev.shops, 0)) FILTER (WHERE act.user_id IS NOT NULL), 0)::float AS avg_shops,
                        COALESCE(AVG(COALESCE(ev.week_adds, 0)) FILTER (WHERE act.user_id IS NOT NULL), 0)::float AS avg_week_adds,
                        COUNT(*) FILTER (WHERE ev.shops > 0)::int AS shopped,
                        COUNT(*) FILTER (WHERE u.paying)::int AS paying
                 FROM u LEFT JOIN act ON act.user_id = u.id LEFT JOIN ev ON ev.user_id = u.id
                 GROUP BY u.installed`,
                win,
            ),
            pool.query(
                `SELECT (installed_at IS NOT NULL) AS installed,
                        COUNT(*) FILTER (WHERE "createdAt" < now() - interval '7 days')::int AS d7_cohort,
                        COUNT(*) FILTER (WHERE "createdAt" < now() - interval '7 days' AND EXISTS (
                            SELECT 1 FROM user_activity a WHERE a.user_id = u.id
                              AND a.day >= (u."createdAt" AT TIME ZONE 'Europe/London')::date + 7))::int AS d7_retained,
                        COUNT(*) FILTER (WHERE "createdAt" < now() - interval '30 days')::int AS d30_cohort,
                        COUNT(*) FILTER (WHERE "createdAt" < now() - interval '30 days' AND EXISTS (
                            SELECT 1 FROM user_activity a WHERE a.user_id = u.id
                              AND a.day >= (u."createdAt" AT TIME ZONE 'Europe/London')::date + 30))::int AS d30_retained
                 FROM "user" u GROUP BY 1`,
            ),
            pool.query(
                `SELECT to_char(date_trunc('week', day), 'YYYY-MM-DD') AS week,
                        COUNT(DISTINCT user_id)::int AS active,
                        COUNT(DISTINCT user_id) FILTER (WHERE standalone)::int AS in_app
                 FROM user_activity WHERE day > ${SINCE}
                 GROUP BY 1 ORDER BY 1`,
                win,
            ),
            pool.query(
                `SELECT u.id, u.name, u.email, u."createdAt" AS created_at, u.installed_at, u.installed_platform, u.last_standalone_at,
                        (SELECT COUNT(*) FROM user_activity a WHERE a.user_id = u.id AND a.day > (now() AT TIME ZONE 'Europe/London')::date - 30)::int AS active_days_30,
                        (SELECT COUNT(*) FROM user_activity a WHERE a.user_id = u.id AND a.standalone AND a.day > (now() AT TIME ZONE 'Europe/London')::date - 30)::int AS standalone_days_30
                 FROM "user" u WHERE u.installed_at IS NOT NULL
                 ORDER BY u.installed_at DESC LIMIT 25`,
            ),
        ]);

        const t = totals.rows[0];
        const group = (installed) => {
            const c = compare.rows.find((r) => r.installed === installed) ?? {};
            const r = retention.rows.find((x) => x.installed === installed) ?? {};
            const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
            return {
                users: c.users ?? 0,
                active: c.active ?? 0,
                avgActiveDays: round1(c.avg_active_days),
                avgRecipes: round1(c.avg_recipes),
                avgLists: round1(c.avg_lists),
                avgShops: round1(c.avg_shops),
                avgWeekAdds: round1(c.avg_week_adds),
                shopped: c.shopped ?? 0,
                paying: c.paying ?? 0,
                d7: { cohort: r.d7_cohort ?? 0, retained: r.d7_retained ?? 0 },
                d30: { cohort: r.d30_cohort ?? 0, retained: r.d30_retained ?? 0 },
            };
        };

        res.json({
            days,
            totals: {
                users: t.users,
                installedUsers: t.installed_users,
                installedInWindow: t.installed_in_window,
                signupsInWindow: t.signups_in_window,
                signupsInstalled: t.signups_installed,
                activeUsers: t.active_users,
                standaloneActive: t.standalone_active,
                mixed: t.mixed,
                activeDays: t.active_days,
                standaloneDays: t.standalone_days,
                medianDaysToInstall: t.median_days_to_install == null ? null : Math.round(t.median_days_to_install * 10) / 10,
            },
            cohorts: cohorts.rows,
            platforms: platforms.rows,
            compare: { installed: group(true), browser: group(false) },
            weekly: weekly.rows.map((w) => ({ week: w.week, active: w.active, inApp: w.in_app, browserOnly: w.active - w.in_app })),
            recent: recent.rows,
        });
    } catch (error) {
        next(error);
    }
}

// GET /admin/users/:id — one person: plan, household, activity, recipe list
// (titles + metadata only). Logged.
async function userDetail(req, res, next) {
    try {
        const id = String(req.params.id ?? "");
        const { rows: urows } = await pool.query(
            `SELECT u.id, u.name, u.email, u."createdAt" AS created_at, u."emailVerified" AS email_verified,
                    hm.household_id, hm.role, hm.onboarding_outcome, hm.onboarded_at, h.name AS household_name,
                    u.installed_at, u.installed_platform, u.last_standalone_at,
                    (SELECT COUNT(*) FROM user_activity a WHERE a.user_id = u.id AND a.day > (now() AT TIME ZONE 'Europe/London')::date - 30)::int AS active_days_30,
                    (SELECT COUNT(*) FROM user_activity a WHERE a.user_id = u.id AND a.standalone AND a.day > (now() AT TIME ZONE 'Europe/London')::date - 30)::int AS standalone_days_30
             FROM "user" u
             LEFT JOIN household_member hm ON hm.user_id = u.id
             LEFT JOIN household h ON h.id = hm.household_id
             WHERE u.id = $1`,
            [id],
        );
        const u = urows[0];
        if (!u) return res.status(404).json({ error: "No such user." });
        const householdId = u.household_id;
        const [entitlement, members, recipesRes, activityRes, aiRes] = await Promise.all([
            householdId ? db.getEntitlement(householdId) : Promise.resolve(null),
            householdId ? db.getHouseholdMembers(householdId) : Promise.resolve([]),
            householdId
                ? pool.query(
                      `SELECT r.id, r.title, r.created_at, r.is_on_menu, r.favorite, (r.image_url IS NOT NULL) AS has_photo,
                              (r.link_url IS NOT NULL AND r.link_url <> '') AS has_link, r.macros_source, r.user_id,
                              (SELECT e.meta->>'source' FROM app_events e WHERE e.type = 'recipe_created' AND (e.meta->>'recipe_id')::int = r.id LIMIT 1) AS source,
                              COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = r.id), '{}') AS tags,
                              (SELECT COUNT(*)::int FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredients,
                              (SELECT COUNT(*)::int FROM app_events e WHERE e.type = 'week_add' AND (e.meta->>'recipe_id')::int = r.id) AS times_on_menu
                       FROM recipes r WHERE r.household_id = $1 ORDER BY r.created_at DESC NULLS LAST, r.id DESC`,
                      [householdId],
                  )
                : Promise.resolve({ rows: [] }),
            pool.query(
                `SELECT type, created_at, meta FROM app_events
                 WHERE (user_id = $1 OR (household_id = $2 AND user_id IS NULL))
                   AND type IN ('onboarding_shown','onboarding_completed','onboarding_skipped','week_add','list_generated','shop_finished',
                                'trial_started','trial_prompt','trial_converted','checkout_started','subscription_cancelled','household_limit_hit',
                                'premium_cta','install_standalone_open','recipe_created','recipe_shared')
                 ORDER BY created_at DESC LIMIT 60`,
                [id, householdId],
            ),
            householdId
                ? pool.query(
                      `SELECT action, COUNT(*) FILTER (WHERE status <> 'rejected')::int AS n, COALESCE(SUM(cost_pence), 0)::float AS cost_pence
                       FROM ai_usage WHERE household_id = $1 GROUP BY action ORDER BY n DESC`,
                      [householdId],
                  )
                : Promise.resolve({ rows: [] }),
        ]);
        db.recordEvent("admin_viewed_user", { userId: req.user.id, householdId, meta: { target: id, admin: req.user.email } });
        const { householdId: _h, stripeSubscriptionId: _s, premiumPayerUserId: _p, ...ent } = entitlement ?? {};
        res.json({
            user: {
                id: u.id, name: u.name, email: u.email, created_at: u.created_at, email_verified: u.email_verified, role: u.role,
                onboarding_outcome: u.onboarding_outcome, onboarded_at: u.onboarded_at,
                installed_at: u.installed_at, installed_platform: u.installed_platform, last_standalone_at: u.last_standalone_at,
                active_days_30: u.active_days_30, standalone_days_30: u.standalone_days_30,
            },
            household: householdId ? { id: householdId, name: u.household_name, members: members.map((m) => ({ user_id: m.user_id, name: m.name, email: m.email, role: m.role })) } : null,
            entitlement: entitlement ? ent : null,
            recipes: recipesRes.rows.map((r) => ({ ...r, tags: r.tags ?? [], mine: r.user_id === id })),
            activity: activityRes.rows.map((r) => ({ type: r.type, at: r.created_at, meta: r.meta })),
            ai: aiRes.rows.map((r) => ({ action: r.action, count: r.n, costPence: Number(r.cost_pence) })),
        });
    } catch (error) {
        next(error);
    }
}

// GET /admin/recipes/:id?reason=… — the full recipe, any household. The reason
// is required and stored with the log entry; this is the intrusive step.
async function recipeDetail(req, res, next) {
    try {
        const id = Number.parseInt(req.params.id, 10);
        const reason = typeof req.query.reason === "string" ? req.query.reason.trim().slice(0, 140) : "";
        if (!Number.isInteger(id)) return res.status(400).json({ error: "A valid id is required." });
        if (reason.length < 3) return res.status(400).json({ error: "Say why you're opening this recipe (a few words)." });
        const { rows } = await pool.query(
            `SELECT r.*, u.email AS added_by_email,
                    COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = r.id), '{}') AS tags,
                    COALESCE((SELECT json_agg(json_build_object('name', i.name, 'quantity', ri.quantity, 'unit', ri.unit) ORDER BY ri.ingredient_id)
                              FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.recipe_id = r.id), '[]') AS ingredients
             FROM recipes r LEFT JOIN "user" u ON u.id = r.user_id WHERE r.id = $1`,
            [id],
        );
        const r = rows[0];
        if (!r) return res.status(404).json({ error: "No such recipe." });
        db.recordEvent("admin_viewed_recipe", { userId: req.user.id, householdId: r.household_id, meta: { recipe_id: id, target: r.user_id, admin: req.user.email, reason } });
        res.json({ recipe: r });
    } catch (error) {
        next(error);
    }
}

// GET /admin/access-log — the last 100 admin views.
async function accessLog(req, res, next) {
    try {
        const { rows } = await pool.query(
            `SELECT e.type, e.created_at, e.meta, u.email AS target_email
             FROM app_events e LEFT JOIN "user" u ON u.id = e.meta->>'target'
             WHERE e.type IN ('admin_viewed_user', 'admin_viewed_recipe')
             ORDER BY e.created_at DESC LIMIT 100`,
        );
        res.json({ entries: rows.map((r) => ({ type: r.type, at: r.created_at, admin: r.meta?.admin ?? null, target: r.target_email ?? r.meta?.target ?? null, recipe_id: r.meta?.recipe_id ?? null, reason: r.meta?.reason ?? null })) });
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
                       AND created_at >= now() - ($1::int || ' days')::interval) AS cards_in_range,
                    (SELECT COUNT(*)::int FROM app_events WHERE type = 'household_limit_hit'
                       AND created_at >= now() - ($1::int || ' days')::interval) AS household_limit_hits,
                    COUNT(*) FILTER (WHERE founder)::int AS founders,
                    COUNT(*) FILTER (WHERE plan = 'premium' AND stripe_subscription_id IS NOT NULL AND billing_interval = 'year')::int AS annual_subs,
                    COUNT(*) FILTER (WHERE plan = 'premium' AND stripe_subscription_id IS NOT NULL AND billing_interval = 'month')::int AS monthly_subs
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
            // Owners who tried to invite past their free-tier seats — the
            // retention-side paywall firing.
            householdLimitHits: Number(t.household_limit_hits),
            subscriptions: { monthly: Number(t.monthly_subs), annual: Number(t.annual_subs), founders: Number(t.founders) },
            rejections: { count: Number(rj.rejections), households: Number(rj.households) },
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
}

// ===== Ingredient → aisle cache (admin review) =====
// One bad mapping affects every household, so model guesses are a queue to
// work. Human decisions win forever (source 'human'; the seed script and the
// organise write-back both use ON CONFLICT DO NOTHING).

const { AISLES, isSlug } = require("../lib/ingredients/aisles");
const { normaliseIngredient } = require("../lib/ingredients/normalise");

// GET /admin/aisles — queue, misses, stats, the taxonomy.
async function aisleReview(req, res, next) {
    try {
        const [queue, misses, stats] = await Promise.all([
            db.getAisleReviewQueue({ limit: 100 }),
            db.getAisleMisses({ limit: 100 }),
            db.getAisleStats(),
        ]);
        res.json({ queue, misses, stats, aisles: AISLES });
    } catch (error) {
        next(error);
    }
}

// PUT /admin/aisles/:id { aisle } — confirm or correct a model guess.
async function setAisleHandler(req, res, next) {
    try {
        const id = Number.parseInt(req.params.id, 10);
        const aisle = req.body?.aisle;
        if (!Number.isInteger(id) || !isSlug(aisle)) {
            return res.status(400).json({ error: "A valid id and aisle are required." });
        }
        const row = await db.setAisle(id, aisle);
        if (!row) return res.status(404).json({ error: "No such mapping." });
        db.recordEvent("aisle_reviewed", { userId: req.user.id, meta: { key: row.key, aisle } });
        res.json({ row });
    } catch (error) {
        next(error);
    }
}

// DELETE /admin/aisles/:id — drop a wrong mapping so the next list asks again.
async function deleteAisleHandler(req, res, next) {
    try {
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return res.status(400).json({ error: "A valid id is required." });
        const ok = await db.deleteAisle(id);
        if (!ok) return res.status(404).json({ error: "No such mapping." });
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
}

// POST /admin/aisles { key | text, aisle, label? } — add a mapping by hand
// (typically for a miss). `text` is normalised the way a list line would be.
async function addAisleHandler(req, res, next) {
    try {
        const aisle = req.body?.aisle;
        const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
        let key = typeof req.body?.key === "string" ? req.body.key.trim().toLowerCase() : "";
        if (!key && text) key = normaliseIngredient(text).key ?? "";
        if (!key || !isSlug(aisle)) {
            return res.status(400).json({ error: "An ingredient and a valid aisle are required." });
        }
        const label = typeof req.body?.label === "string" && req.body.label.trim() ? req.body.label.trim() : text || key;
        const row = await db.addHumanAisle({ key, label: label.slice(0, 120), aisle });
        db.recordEvent("aisle_added", { userId: req.user.id, meta: { key, aisle } });
        res.status(201).json({ row });
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
    history,
    onboardingStats,
    recipesOverview,
    userDetail,
    recipeDetail,
    accessLog,
    installStats,
    getConfig: getConfigHandler,
    putConfig: putConfigHandler,
    aisleReview,
    setAisle: setAisleHandler,
    deleteAisle: deleteAisleHandler,
    addAisle: addAisleHandler,
    comps,
    grantPremium,
    revokePremium,
};
