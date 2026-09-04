-- Credits, trial and per-household plan snapshot (monetisation phase 2).
--
-- 1. app_config: the knobs that must be changeable without a deploy — trial
--    length, credit allowances, action weights, free-tier household size,
--    founders' offer. One row per key, JSON value, edited from /back-of-house
--    (PUT /admin/config). Read through lib/config.js (cached).
--
-- 2. household gains a SNAPSHOT of those knobs, taken when the household is
--    created (db.insertHousehold). Changing app_config affects households
--    created afterwards only — early users are grandfathered for good, and
--    the free-tier member limit can be tightened later without touching
--    anyone who already has it. NULL allowance = unlimited (used for comps).
--
--    credit_anchor_at is the day the household's monthly credit period turns
--    over (their signup anniversary, floored to a Europe/London day, so the
--    copy can say "resets on the 14th"). Nothing is reset or stored per
--    period: usage is SUM(ai_usage.credits) since credit_period(anchor).start.
--
--    trial_ends_at: 14 days (app_config.trial_days) of full Premium from the
--    USER's signup, not the household's creation — so leaving a household and
--    getting a fresh one can never mint a second trial, and nobody inherits
--    another member's trial. Backfilled for existing households from their
--    earliest member's signup; those trials are all already over.
--
-- 3. credit_period(anchor, at): the one implementation of the anniversary
--    maths, used by every entitlement read. Adds whole months to the
--    ORIGINAL anchor day (31 Jan → 28 Feb → 31 Mar, no drift), London-zone
--    aware, end exclusive. age() counts a month only once the same
--    day-of-month comes round, which is one short when the anchor day was
--    clamped (31 Jan → 28 Feb), so a single +1 correction follows it.
--
-- 4. ai_usage: aisle-sort rows drop to 0 credits (the shopping list is free
--    at every tier from here on), so the first credit period isn't inflated
--    by list generations made under the old rule.

CREATE TABLE IF NOT EXISTS app_config (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
);

INSERT INTO app_config (key, value) VALUES
    ('trial_days',               '14'),
    ('free_credit_allowance',    '50'),
    ('premium_credit_allowance', '300'),
    ('credit_weights',           '{"import": 1, "estimate": 1, "improve": 1, "generate": 1, "suggest": 1, "photo": 3, "social": 1, "aisle": 0, "parse": 0, "usuals": 0}'),
    ('member_limit_free',        '2'),
    ('founders_coupon',          'null'),
    ('founders_cap',             '200')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE household
    ADD COLUMN IF NOT EXISTS credit_allowance         INTEGER,      -- free-tier credits per period; NULL = unlimited
    ADD COLUMN IF NOT EXISTS premium_credit_allowance INTEGER,      -- premium + trial soft cap; NULL = unlimited (comps)
    ADD COLUMN IF NOT EXISTS credit_weights           JSONB,        -- action → credits, snapshot of app_config.credit_weights
    ADD COLUMN IF NOT EXISTS member_limit             INTEGER,      -- free-tier household size, snapshot
    ADD COLUMN IF NOT EXISTS credit_anchor_at         TIMESTAMPTZ,  -- period turnover anchor (signup)
    ADD COLUMN IF NOT EXISTS trial_ends_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS billing_interval         TEXT,         -- 'month' | 'year' from the Stripe subscription
    ADD COLUMN IF NOT EXISTS founder                  BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION credit_period(anchor TIMESTAMPTZ, at TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (period_start TIMESTAMPTZ, period_end TIMESTAMPTZ, period_index INTEGER)
LANGUAGE sql STABLE AS $$
    WITH a AS (
        SELECT date_trunc('day', anchor AT TIME ZONE 'Europe/London') AS a_local,
               (at AT TIME ZONE 'Europe/London')                      AS now_local
    ),
    m AS (
        SELECT a_local, now_local,
               (EXTRACT(YEAR FROM age(now_local, a_local)) * 12
                + EXTRACT(MONTH FROM age(now_local, a_local)))::int AS n0
        FROM a
    ),
    n AS (
        SELECT a_local,
               CASE WHEN a_local + ((n0 + 1) * interval '1 month') <= now_local
                    THEN n0 + 1
                    ELSE GREATEST(n0, 0)
               END AS n
        FROM m
    )
    SELECT (a_local + (n * interval '1 month'))       AT TIME ZONE 'Europe/London',
           (a_local + ((n + 1) * interval '1 month')) AT TIME ZONE 'Europe/London',
           n
    FROM n
$$;

-- Backfill every existing household with today's defaults (= grandfathered at
-- the launch values) and a trial dated from its earliest member's signup.
UPDATE household h SET
    credit_allowance         = COALESCE(h.credit_allowance,
                                        (SELECT (value)::int FROM app_config WHERE key = 'free_credit_allowance')),
    premium_credit_allowance = COALESCE(h.premium_credit_allowance,
                                        (SELECT (value)::int FROM app_config WHERE key = 'premium_credit_allowance')),
    credit_weights           = COALESCE(h.credit_weights,
                                        (SELECT value FROM app_config WHERE key = 'credit_weights')),
    member_limit             = COALESCE(h.member_limit,
                                        (SELECT (value)::int FROM app_config WHERE key = 'member_limit_free')),
    credit_anchor_at         = COALESCE(h.credit_anchor_at, h.created_at),
    trial_ends_at            = COALESCE(
                                   h.trial_ends_at,
                                   COALESCE(
                                       (SELECT MIN(u."createdAt") FROM household_member hm
                                        JOIN "user" u ON u.id = hm.user_id
                                        WHERE hm.household_id = h.id),
                                       h.created_at
                                   ) + ((SELECT (value)::int FROM app_config WHERE key = 'trial_days') || ' days')::interval
                               )
WHERE h.credit_allowance IS NULL
   OR h.premium_credit_allowance IS NULL
   OR h.credit_weights IS NULL
   OR h.member_limit IS NULL
   OR h.credit_anchor_at IS NULL
   OR h.trial_ends_at IS NULL;

-- Comps (premium with no Stripe subscription) are genuinely unlimited.
UPDATE household SET premium_credit_allowance = NULL
WHERE plan = 'premium' AND stripe_subscription_id IS NULL;

-- The shopping list is free at every tier from now on.
UPDATE ai_usage SET credits = 0 WHERE action = 'aisle' AND credits <> 0;
