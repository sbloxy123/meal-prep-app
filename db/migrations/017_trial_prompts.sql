-- Trial prompts are sent at most once per household, stage and channel: the
-- hourly email sweep (lib/trial.js) claims the row FIRST with
-- INSERT … ON CONFLICT DO NOTHING and only sends when the insert won, so a
-- restart or a second instance can never double-send. The in-app card logs the
-- same event with channel 'app'.
CREATE UNIQUE INDEX IF NOT EXISTS app_events_trial_prompt_once_idx
    ON app_events (household_id, (meta->>'stage'), (meta->>'channel'))
    WHERE type = 'trial_prompt';
