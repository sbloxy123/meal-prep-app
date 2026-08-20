-- Households: shared tenancy for recipes, shopping lists and menus.
-- Converts single-owner (user_id) scoping to household scoping. user_id is kept
-- on the owned tables as "added by" attribution; household_id becomes the scope
-- key every query filters on. The API contract (endpoint paths/shapes) is
-- unchanged — requireAuth now resolves the caller's household.

-- 1. Household and membership tables.
CREATE TABLE IF NOT EXISTS household (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_member (
    household_id TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',   -- 'owner' | 'member'
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (household_id, user_id)
);

-- One household per user for now. Relax this index later to support a user
-- belonging to multiple households.
CREATE UNIQUE INDEX IF NOT EXISTS household_member_user_unique
    ON household_member (user_id);

-- 2. Backfill: give every existing user their own household. The household id
--    reuses the user id here so the row backfill in step 4 is trivial and
--    guaranteed unique; new households created by the app get a fresh uuid.
INSERT INTO household (id, name)
SELECT u.id, COALESCE(u.name, u.email) || '''s kitchen'
FROM "user" u
WHERE NOT EXISTS (SELECT 1 FROM household_member hm WHERE hm.user_id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO household_member (household_id, user_id, role)
SELECT u.id, u.id, 'owner'
FROM "user" u
WHERE NOT EXISTS (SELECT 1 FROM household_member hm WHERE hm.user_id = u.id);

-- 3. Add the scope key to the owned tables.
ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS household_id TEXT REFERENCES household(id) ON DELETE CASCADE;
ALTER TABLE shopping_list
    ADD COLUMN IF NOT EXISTS household_id TEXT REFERENCES household(id) ON DELETE CASCADE;
ALTER TABLE generated_shopping_list
    ADD COLUMN IF NOT EXISTS household_id TEXT REFERENCES household(id) ON DELETE CASCADE;

-- 4. Backfill household_id from the existing user_id (household.id == user.id above).
UPDATE recipes                 SET household_id = user_id WHERE household_id IS NULL AND user_id IS NOT NULL;
UPDATE shopping_list           SET household_id = user_id WHERE household_id IS NULL AND user_id IS NOT NULL;
UPDATE generated_shopping_list SET household_id = user_id WHERE household_id IS NULL AND user_id IS NOT NULL;

-- 5. Fix the latent global-uniqueness bug: this constraint meant two users
--    (and now two households) could never both have the same product in a
--    generated list — the second insert threw. Scope is enforced in queries.
ALTER TABLE generated_shopping_list
    DROP CONSTRAINT IF EXISTS generated_shopping_list_product_name_key;

-- 6. Indexes for the new scoping key.
CREATE INDEX IF NOT EXISTS recipes_household_idx                 ON recipes (household_id);
CREATE INDEX IF NOT EXISTS shopping_list_household_idx           ON shopping_list (household_id);
CREATE INDEX IF NOT EXISTS generated_shopping_list_household_idx ON generated_shopping_list (household_id);
