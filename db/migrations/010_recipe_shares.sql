-- Recipe sharing: a stable share token per recipe. The token is handed out in a
-- link (frontend route /shared/<token>); any signed-in user can preview the
-- recipe and save a copy into their own household. One token per recipe
-- (UNIQUE recipe_id) so re-sharing returns the same link. Cascades away with the
-- source recipe.

CREATE TABLE IF NOT EXISTS recipe_shares (
    token TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    recipe_id INTEGER NOT NULL UNIQUE REFERENCES recipes(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
