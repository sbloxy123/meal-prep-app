-- Shared pool of recipe ideas for "Inspiration" (POST /recipes/suggest).
--
-- Every tap used to be a fresh model call. Ideas are not personal, so they
-- are pooled GLOBALLY by what was asked for: the normalised hint (key) and the
-- household's diet signature (diets: sorted, comma-joined, '' for none). Once a
-- pool holds enough ideas (lib/suggestions/pool.js POOL_SERVE_MIN) a tap is
-- served from it — a random six the household doesn't already have — and no
-- model runs; the tap still costs its credit (the value is the same). Misses
-- call the model, which is asked not to repeat the pool, and the answer is
-- merged in (deduped by title, capped) so "Again" keeps giving new ideas.
--
-- Same seed shape as ingredient_aisles (018): scripts/seed-suggestions.js runs
-- on every deploy with ON CONFLICT DO NOTHING, so a redeploy never overwrites
-- a pool that has grown from real use.

CREATE TABLE IF NOT EXISTS suggestion_pool (
    id          BIGSERIAL PRIMARY KEY,
    key         TEXT NOT NULL,                       -- suggestKey(hint): lower-cased, punctuation stripped; 'anything' for no hint
    hint        TEXT,                                -- a representative raw hint, for the admin
    diets       TEXT NOT NULL DEFAULT '',            -- dietSignature(): e.g. '' | 'vegetarian' | 'gluten-free,vegan'
    ideas       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ title, tags[], ingredients[] }]
    source      TEXT NOT NULL DEFAULT 'model',       -- seed | model
    usage_count INTEGER NOT NULL DEFAULT 0,          -- taps served from this pool
    model_calls INTEGER NOT NULL DEFAULT 0,          -- taps that ran the model for this pool
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (key, diets)
);

CREATE INDEX IF NOT EXISTS suggestion_pool_usage_idx ON suggestion_pool (usage_count DESC);
