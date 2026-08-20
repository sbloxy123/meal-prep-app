-- Household invites (C2). An owner invites someone by email; the invitee
-- accepts via a tokenised link and joins the household. Depends on the
-- household tables from 005_households.sql.

CREATE TABLE IF NOT EXISTS household_invite (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    household_id TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    invited_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS household_invite_token_idx ON household_invite (token);
CREATE INDEX IF NOT EXISTS household_invite_household_idx ON household_invite (household_id);

-- At most one outstanding (unaccepted) invite per email per household.
CREATE UNIQUE INDEX IF NOT EXISTS household_invite_pending_unique
    ON household_invite (household_id, lower(invited_email))
    WHERE accepted_at IS NULL;
