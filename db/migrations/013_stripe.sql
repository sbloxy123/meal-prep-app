-- BetterAuth Stripe plugin schema (@better-auth/stripe).
--
-- The plugin keys a subscription to the paying user (referenceId = user.id) and
-- stores its Stripe state here; our own entitlement lives on household.plan
-- (migration 012), written from the plugin's subscription callbacks. Column
-- names follow the BetterAuth convention used in 002 — quoted camelCase, since
-- the adapter reads/writes fields verbatim.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

CREATE TABLE IF NOT EXISTS "subscription" (
    id                     TEXT PRIMARY KEY,
    plan                   TEXT,
    "referenceId"          TEXT NOT NULL,
    "stripeCustomerId"     TEXT,
    "stripeSubscriptionId" TEXT,
    status                 TEXT,
    "periodStart"          TIMESTAMP,
    "periodEnd"            TIMESTAMP,
    "cancelAtPeriodEnd"    BOOLEAN,
    "cancelAt"             TIMESTAMP,
    "canceledAt"           TIMESTAMP,
    "endedAt"              TIMESTAMP,
    seats                  INTEGER,
    "trialStart"           TIMESTAMP,
    "trialEnd"             TIMESTAMP,
    "billingInterval"      TEXT,
    "stripeScheduleId"     TEXT
);

CREATE INDEX IF NOT EXISTS subscription_reference_idx ON "subscription" ("referenceId");
