-- Cleanup after the credits launch: recipe_imports was the old per-call rate
-- limit log. Migration 015 backfilled every row into ai_usage (meta.legacy)
-- and nothing has written here since; the dashboard and the allowance read
-- ai_usage only.
DROP TABLE IF EXISTS recipe_imports;
