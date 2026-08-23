-- Recipe URL import + nutrition macros.
--
-- 1. recipe_imports: a small audit table used purely as a per-household rate
--    limiter for the AI/scrape endpoints. We count calls (not saved recipes)
--    because the cost (page fetch + LLM) is incurred on the call regardless of
--    whether the user keeps the draft. `action` separates the two limited
--    endpoints ('import' | 'estimate') so each gets its own rolling window.
--
-- 2. Nutrition macros on recipes — six nullable columns (per serving unless
--    noted). macros_source records where the numbers came from.

CREATE TABLE IF NOT EXISTS recipe_imports (
    id BIGSERIAL PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
    action TEXT NOT NULL DEFAULT 'import',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_imports_household_created_idx
    ON recipe_imports (household_id, action, created_at);

ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS servings      INTEGER,   -- number of servings
    ADD COLUMN IF NOT EXISTS calories      INTEGER,   -- kcal / serving
    ADD COLUMN IF NOT EXISTS protein_g     NUMERIC,   -- g / serving
    ADD COLUMN IF NOT EXISTS carb_g        NUMERIC,   -- g / serving
    ADD COLUMN IF NOT EXISTS fat_g         NUMERIC,   -- g / serving
    ADD COLUMN IF NOT EXISTS macros_source TEXT
        CHECK (macros_source IN ('manual', 'imported', 'estimated'));
