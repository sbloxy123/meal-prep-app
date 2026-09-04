-- Daily metric snapshots (back of house v2). One row per Europe/London day,
-- written by lib/snapshots.js from the hourly job tick — it fills every
-- missing day back to a limit, so downtime never leaves a gap. Flows (that
-- day's signups, AI cost, shops…) are exact whenever they are written; stocks
-- that depend on current state (paying households, MRR) are exact only when
-- written on time and are flagged in metrics.reconstructed otherwise.
-- GET /admin/history rolls these up by month; the Monday digest reads them.
CREATE TABLE IF NOT EXISTS metric_snapshots (
    day        DATE PRIMARY KEY,
    metrics    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The weekly admin digest is claimed here before sending (one per ISO week).
CREATE UNIQUE INDEX IF NOT EXISTS app_events_admin_digest_once_idx
    ON app_events ((meta->>'week'))
    WHERE type = 'admin_digest';
