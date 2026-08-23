-- Admin analytics foundation.
--
-- 1. recipes.created_at: recipes were never timestamped, so creation could not
--    be trended over time. Existing rows adopt the migration time (they cluster
--    at deploy — early "recipes created" history is therefore approximate).
--
-- 2. app_events: a lightweight, append-only usage log for actions not already
--    captured elsewhere (AI usage lives in recipe_imports; logins are derivable
--    from the session table). Fed by db.recordEvent() from the controllers.
--    FKs are ON DELETE SET NULL so removing a user/household preserves the
--    historical aggregate counts.

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS app_events (
    id           BIGSERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id      TEXT REFERENCES "user"(id)   ON DELETE SET NULL,
    household_id TEXT REFERENCES household(id) ON DELETE SET NULL,
    type         TEXT NOT NULL,   -- 'recipe_created' | 'week_add' | 'list_generated' | 'recipe_shared' | 'share_saved'
    meta         JSONB
);

CREATE INDEX IF NOT EXISTS app_events_type_created_idx ON app_events (type, created_at);
CREATE INDEX IF NOT EXISTS app_events_user_created_idx ON app_events (user_id, created_at);
