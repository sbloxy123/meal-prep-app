-- ingredient_aisles: GLOBAL ingredient → aisle cache shared by every household
-- (monetisation phase 4). One user resolving "gochujang" resolves it for
-- everyone, so "Generate list by aisle" costs (almost) nothing at scale and
-- can stay free at every tier.
--
--   key         normaliseIngredient() output (lib/ingredients/normalise.js)
--   label       human-readable, for the admin review screen
--   aisle       a slug from lib/ingredients/aisles.js
--   source      'seed' | 'model' | 'human'
--   confidence  1.0 for seed/human, 0.5 for model guesses until reviewed
--
-- Seeded with ~750 UK grocery items by scripts/seed-ingredient-aisles.js
-- (idempotent; runs on every Railway start after migrate:up). Model-generated
-- rows are the admin review queue (ingredient_aisles_review_idx). Misses are
-- logged to ingredient_aisle_misses so the seed can grow from real data.

CREATE TABLE IF NOT EXISTS ingredient_aisles (
    id            BIGSERIAL PRIMARY KEY,
    key           TEXT        NOT NULL,
    label         TEXT        NOT NULL,
    aisle         TEXT        NOT NULL,
    region        TEXT        NOT NULL DEFAULT 'UK',
    source        TEXT        NOT NULL DEFAULT 'model',
    confidence    REAL        NOT NULL DEFAULT 0.5,
    usage_count   INTEGER     NOT NULL DEFAULT 0,
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ingredient_aisles_key_region_unique UNIQUE (key, region)
);

CREATE INDEX IF NOT EXISTS ingredient_aisles_lookup_idx ON ingredient_aisles (region, key);

-- Admin review queue: model-generated entries nobody has checked, busiest first.
CREATE INDEX IF NOT EXISTS ingredient_aisles_review_idx
    ON ingredient_aisles (region, usage_count DESC)
    WHERE source = 'model' AND reviewed_at IS NULL;

-- Unresolved ingredients (no cache hit and the model couldn't place them, or
-- the normaliser produced nothing usable). Aggregate, no user ids.
CREATE TABLE IF NOT EXISTS ingredient_aisle_misses (
    id          BIGSERIAL PRIMARY KEY,
    key         TEXT        NOT NULL,
    raw_sample  TEXT,
    region      TEXT        NOT NULL DEFAULT 'UK',
    hit_count   INTEGER     NOT NULL DEFAULT 1,
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ingredient_aisle_misses_unique UNIQUE (key, region)
);
