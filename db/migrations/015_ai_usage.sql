-- AI usage ledger + activity tracking (monetisation phase 1: analytics).
--
-- 1. ai_usage: one row per user-facing AI action (an import, a photo scan, a
--    "generate list by aisle"…), not per model call — a photo scan that
--    escalates Haiku → Sonnet is one row with calls = 2 and both models' cost
--    summed. Written by lib/ledger.js: the row is inserted 'pending' BEFORE the
--    model runs (so in-flight work counts against the allowance) and settled to
--    'ok' / 'failed' afterwards. 'failed' rows keep their tokens (spend is real)
--    but their credits are zeroed — a failure never charges the user.
--    'rejected' rows are reservations refused by the allowance check (credits 0,
--    no model call); they make "how often do people hit the ceiling" a query on
--    the same table.
--
--    Replaces recipe_imports, which only ever counted calls. That table is
--    backfilled into this one (meta.legacy = true, tokens/cost unknown = 0) and
--    no longer written; it is dropped in a later cleanup migration once the
--    dashboard has moved over.
--
--    Costs: cost_usd is what Anthropic bills (list price per model, computed
--    from usage tokens); cost_pence is the same converted at the rate in force
--    when the row was written (lib/aiCost.js) so the dashboard can show £
--    without a live FX lookup.
--
--    FKs are ON DELETE SET NULL (not CASCADE like recipe_imports) so deleting a
--    household or user keeps the spend history — the analytics are the point.
--
-- 2. user_activity: one row per user per (Europe/London) day they made an
--    authenticated request. Written by middleware/requireAuth.js. This is what
--    day-1 / day-7 / day-30 retention is computed from; the session table only
--    knows the LAST time a session was touched, not each day.
--
-- 3. An index app_events (household_id, type, created_at) — countRecentEvents
--    (the "My usuals" daily limiter) filters on exactly that and had no index.

CREATE TABLE IF NOT EXISTS ai_usage (
    id                 BIGSERIAL PRIMARY KEY,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at         TIMESTAMPTZ,
    household_id       TEXT REFERENCES household(id) ON DELETE SET NULL,
    user_id            TEXT REFERENCES "user"(id)    ON DELETE SET NULL,
    action             TEXT NOT NULL,        -- import | estimate | improve | generate | suggest | photo | social | aisle | parse | usuals
    credits            INTEGER NOT NULL DEFAULT 0,
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'ok', 'failed', 'rejected')),
    plan_at            TEXT,                 -- household plan when the row was opened: free | trial | premium
    model              TEXT,                 -- model that produced the answer (last successful call)
    calls              INTEGER NOT NULL DEFAULT 0,   -- model calls made for this action
    input_tokens       INTEGER NOT NULL DEFAULT 0,
    output_tokens      INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd           NUMERIC(12, 6) NOT NULL DEFAULT 0,
    cost_pence         NUMERIC(12, 4) NOT NULL DEFAULT 0,
    latency_ms         INTEGER,              -- whole action, first model call start → last call end
    error_code         TEXT,
    meta               JSONB
);

-- Allowance sums: this period's ok + pending credits for a household.
CREATE INDEX IF NOT EXISTS ai_usage_household_created_live_idx
    ON ai_usage (household_id, created_at)
    WHERE status IN ('ok', 'pending');

-- Per-action 6h burst ceilings (replaces recipe_imports_household_created_idx).
CREATE INDEX IF NOT EXISTS ai_usage_household_action_created_idx
    ON ai_usage (household_id, action, created_at);

-- Dashboard time series / per-action rollups.
CREATE INDEX IF NOT EXISTS ai_usage_action_created_idx
    ON ai_usage (action, created_at);

CREATE TABLE IF NOT EXISTS user_activity (
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    day     DATE NOT NULL,
    PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS user_activity_day_idx ON user_activity (day);

CREATE INDEX IF NOT EXISTS app_events_household_type_created_idx
    ON app_events (household_id, type, created_at);

-- Backfill the old call log so the dashboard keeps its history. Runs once: if
-- any legacy row already exists the migration has been applied before.
INSERT INTO ai_usage (created_at, settled_at, household_id, action, credits, status, calls, meta)
SELECT ri.created_at, ri.created_at, ri.household_id, ri.action, 1, 'ok', 1,
       '{"legacy": true}'::jsonb
FROM recipe_imports ri
WHERE NOT EXISTS (SELECT 1 FROM ai_usage WHERE meta->>'legacy' = 'true');
