// Read-only admin analytics. Self-contained: queries run against the pool
// directly (rather than growing db/queries.js) since nothing here is reused.
// All aggregates are over existing tables + app_events. No writes.
const pool = require("../db/pool");

const ALLOWED_DAYS = [7, 30, 90, 365];

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

        const [totalsRes, aiRes, invitesRes, macrosRes, tagsRes, deviceRes] =
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
                        ) x)::int AS multi_member
                `),
                pool.query(
                    `SELECT action, COUNT(*)::int AS n FROM recipe_imports
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
            ]);

        const t = totalsRes.rows[0];

        const ai = { import: 0, estimate: 0, generate: 0, photo: 0, improve: 0, suggest: 0 };
        for (const r of aiRes.rows) {
            if (r.action in ai) ai[r.action] = Number(r.n);
        }
        ai.total = ai.import + ai.estimate + ai.generate + ai.photo + ai.improve + ai.suggest;

        const macrosSource = {};
        for (const r of macrosRes.rows) macrosSource[r.macros_source] = Number(r.n);

        const deviceSplit = {};
        for (const r of deviceRes.rows) deviceSplit[r.device] = Number(r.n);

        const inv = invitesRes.rows[0];

        const [signups, activeUsers, aiCallsRows, recipesCreated, listsGenerated, weekAdds] =
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
                        COUNT(*) FILTER (WHERE ri.action = 'import')::int   AS import,
                        COUNT(*) FILTER (WHERE ri.action = 'estimate')::int AS estimate,
                        COUNT(*) FILTER (WHERE ri.action = 'generate')::int AS generate,
                        COUNT(*) FILTER (WHERE ri.action = 'photo')::int    AS photo,
                        COUNT(*) FILTER (WHERE ri.action = 'improve')::int  AS improve,
                        COUNT(*) FILTER (WHERE ri.action = 'suggest')::int  AS suggest
                     FROM days d LEFT JOIN recipe_imports ri ON ri.created_at::date = d.d
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
            ]);

        const aiCalls = aiCallsRows.rows.map((r) => ({
            date: r.date,
            values: {
                import: Number(r.import),
                estimate: Number(r.estimate),
                generate: Number(r.generate),
                photo: Number(r.photo),
                improve: Number(r.improve),
                suggest: Number(r.suggest),
            },
        }));

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
                aiCalls: ai,
                invitesSent: inv.sent,
                invitesAccepted: inv.accepted,
                invitesPending: inv.pending,
                macrosSource,
                topTags: tagsRes.rows.map((r) => ({ name: r.name, count: Number(r.n) })),
                deviceSplit,
            },
            series: { signups, activeUsers, aiCalls, recipesCreated, listsGenerated, weekAdds },
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
                COALESCE(rc.recipe_count, 0)   AS recipe_count,
                COALESCE(ai.import_count, 0)   AS ai_import,
                COALESCE(ai.estimate_count, 0) AS ai_estimate,
                COALESCE(ai.generate_count, 0) AS ai_generate,
                COALESCE(ai.photo_count, 0)    AS ai_photo,
                COALESCE(ai.improve_count, 0)  AS ai_improve,
                COALESCE(ai.suggest_count, 0)  AS ai_suggest,
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
                    COUNT(*) FILTER (WHERE action = 'import')   AS import_count,
                    COUNT(*) FILTER (WHERE action = 'estimate') AS estimate_count,
                    COUNT(*) FILTER (WHERE action = 'generate') AS generate_count,
                    COUNT(*) FILTER (WHERE action = 'photo')    AS photo_count,
                    COUNT(*) FILTER (WHERE action = 'improve')  AS improve_count,
                    COUNT(*) FILTER (WHERE action = 'suggest')  AS suggest_count
                FROM recipe_imports ri WHERE ri.household_id = hm.household_id
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
                recipe_count: Number(r.recipe_count),
                ai_usage: {
                    import: Number(r.ai_import),
                    estimate: Number(r.ai_estimate),
                    generate: Number(r.ai_generate),
                    photo: Number(r.ai_photo),
                    improve: Number(r.ai_improve),
                    suggest: Number(r.ai_suggest),
                    total:
                        Number(r.ai_import) +
                        Number(r.ai_estimate) +
                        Number(r.ai_generate) +
                        Number(r.ai_photo) +
                        Number(r.ai_improve) +
                        Number(r.ai_suggest),
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

module.exports = { overview, users };
