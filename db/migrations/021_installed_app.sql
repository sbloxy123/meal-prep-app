-- Installed-app tracking (back of house → Installs).
--
-- iOS gives no install event, so "installed" means "has launched Fornetto from
-- the home screen at least once". The frontend sends `X-Fornetto-Client:
-- <standalone|browser>/<platform>` on every data request (src/lib/api.ts);
-- middleware/requireAuth.js folds it into the per-day activity row and stamps
-- the user's first and latest standalone use. That is what the Installs tab,
-- the Users "App" column, the monthly history and the Monday digest read.

ALTER TABLE user_activity
    ADD COLUMN IF NOT EXISTS standalone BOOLEAN NOT NULL DEFAULT false, -- used the installed app that day
    ADD COLUMN IF NOT EXISTS platform   TEXT;                            -- ios | android | desktop | … (first seen that day)

ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS installed_at       TIMESTAMPTZ, -- first standalone launch
    ADD COLUMN IF NOT EXISTS installed_platform TEXT,
    ADD COLUMN IF NOT EXISTS last_standalone_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_activity_standalone_day_idx ON user_activity (day) WHERE standalone;
CREATE INDEX IF NOT EXISTS user_installed_at_idx ON "user" (installed_at) WHERE installed_at IS NOT NULL;

-- Backfill from install_standalone_open (logged once per session since the
-- install work shipped on 2026-09-03), so the tab has history on day one.
WITH firsts AS (
    SELECT user_id,
           MIN(created_at) AS first_at,
           MAX(created_at) AS last_at,
           (array_agg(meta->>'platform' ORDER BY created_at))[1] AS platform
    FROM app_events
    WHERE type = 'install_standalone_open' AND user_id IS NOT NULL
    GROUP BY user_id
)
UPDATE "user" u
SET installed_at       = COALESCE(u.installed_at, f.first_at),
    installed_platform = COALESCE(u.installed_platform, f.platform),
    last_standalone_at = GREATEST(COALESCE(u.last_standalone_at, f.last_at), f.last_at)
FROM firsts f
WHERE f.user_id = u.id;

INSERT INTO user_activity (user_id, day, standalone, platform)
SELECT user_id,
       (created_at AT TIME ZONE 'Europe/London')::date AS day,
       true,
       MIN(meta->>'platform')
FROM app_events
WHERE type = 'install_standalone_open' AND user_id IS NOT NULL
GROUP BY user_id, (created_at AT TIME ZONE 'Europe/London')::date
ON CONFLICT (user_id, day) DO UPDATE
    SET standalone = true,
        platform   = COALESCE(user_activity.platform, EXCLUDED.platform);
