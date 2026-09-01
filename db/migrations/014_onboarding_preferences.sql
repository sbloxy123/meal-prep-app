-- Onboarding questionnaire + food preferences.
--
-- Per-person answers live on household_member: it is the only per-user row this
-- app owns (the "user" table is BetterAuth-managed and lib/auth.js declares no
-- additionalFields, so a column there would be invisible to authClient). It
-- already carries per-member state (role), and the unique index on user_id
-- means one row per user.
--
-- The household-wide dietary rule lives on household, following the precedent
-- of household.plan: a setting one member writes that the whole household
-- reads. Its JSON carries "setBy" so writes can be limited to the first
-- writer / the member who set it.
--
-- onboarded_at is the "don't ask again" marker; onboarding_outcome is the
-- funnel dimension. 'pre_existing' is the backfill value for members whose
-- household already had recipes when this shipped: they are not in the funnel
-- and aren't shown the questionnaire while they have recipes. It records
-- "was already using the app", NOT an answer — so if such an account later
-- empties its recipe list it does qualify again (see the onboardingNeeded rule
-- in controllers/shoppingListController.js). Only a real 'completed' or
-- 'skipped' outcome settles it for good.

ALTER TABLE household_member
    ADD COLUMN IF NOT EXISTS food_prefs         JSONB,
    ADD COLUMN IF NOT EXISTS onboarded_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS onboarding_outcome TEXT
        CHECK (onboarding_outcome IN ('completed', 'skipped', 'pre_existing'));

ALTER TABLE household
    ADD COLUMN IF NOT EXISTS dietary_rule JSONB;

-- Backfill: anyone already using the app is out of scope for onboarding.
UPDATE household_member hm
SET onboarded_at = now(), onboarding_outcome = 'pre_existing'
WHERE hm.onboarded_at IS NULL
  AND EXISTS (SELECT 1 FROM recipes r WHERE r.household_id = hm.household_id);
