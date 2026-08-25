-- Premium subscription (household-scoped).
--
-- Premium is billed per household: one member pays and the whole household is
-- unlocked. `plan` is the effective entitlement the API reads on every AI call;
-- the stripe_* columns and premium_payer_user_id are written by the BetterAuth
-- Stripe plugin's subscription callbacks (Phase 2) and are unused in Phase 1
-- (they land now so we don't need a second migration). `premium_until` lets an
-- entitlement outlive a cancellation until the paid period ends.

ALTER TABLE household
    ADD COLUMN IF NOT EXISTS plan                  TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'premium')),
    ADD COLUMN IF NOT EXISTS premium_until         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS premium_payer_user_id  TEXT
        REFERENCES "user"(id) ON DELETE SET NULL;
