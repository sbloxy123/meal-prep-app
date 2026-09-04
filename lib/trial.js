// The two trial prompts — and only two: four days before the trial ends and
// on its last day. Each goes out once per household by email (this sweep)
// and once in the app (the frontend's TrialPrompt card logs the same event
// with channel 'app'). Nothing else nags.
//
// The sweep runs hourly in-process (app.js). Idempotency is a database
// claim, not a memory: db.claimTrialPrompt inserts the trial_prompt event
// under the unique index from migration 017 and returns false when it already
// exists, so a second instance or a restart mid-sweep cannot send twice.
// Only the household owner is emailed.

const db = require("../db/queries");
const { sendEmail, trialEmail, trialEmailText } = require("./email");

const FRONTEND_URL = (
    process.env.ALLOWED_ORIGINS?.split(",")[0] || "http://localhost:3000"
).trim().replace(/\/$/, "");

// stage → how many days before the end it fires. Expressed relative to the
// end so a 21-day trial gets the same two prompts as a 14-day one.
const STAGES = [
    { stage: "ending_soon", daysBefore: 4 },
    { stage: "last_day", daysBefore: 1 },
];

function premiumUrl(stage) {
    return `${FRONTEND_URL}/premium?from=trial_email_${stage}`;
}

async function sendTrialPromptEmail({ household, stage, daysLeft }) {
    const url = premiumUrl(stage);
    const endsOn = new Date(household.trial_ends_at).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Europe/London",
    });
    const vars = {
        stage,
        daysLeft,
        endsOn,
        url,
        freeCredits: household.credit_allowance,
        premiumCredits: household.premium_credit_allowance,
        name: household.owner_name,
    };
    await sendEmail({
        to: household.owner_email,
        subject:
            stage === "last_day"
                ? "Your Fornetto Premium trial ends tomorrow"
                : `${daysLeft} days left on your Fornetto Premium trial`,
        text: trialEmailText(vars),
        html: trialEmail(vars),
    });
}

// One pass: for each stage, every trialling free household inside the window
// that hasn't had that stage yet. Returns { sent, skipped, failed } for logs.
async function sweepTrialPrompts({ now = new Date() } = {}) {
    const out = { sent: 0, skipped: 0, failed: 0 };
    for (const { stage, daysBefore } of STAGES) {
        let due;
        try {
            due = await db.getTrialHouseholdsDue({ daysBefore, now });
        } catch (error) {
            console.error(`[trial] query failed for ${stage}:`, error.message);
            out.failed++;
            continue;
        }
        for (const household of due) {
            let claimed = false;
            try {
                claimed = await db.claimTrialPrompt({
                    householdId: household.id,
                    userId: household.owner_id,
                    stage,
                    channel: "email",
                    endsAt: household.trial_ends_at,
                });
            } catch (error) {
                console.error(`[trial] claim failed for ${household.id}:`, error.message);
                out.failed++;
                continue;
            }
            if (!claimed) {
                out.skipped++;
                continue;
            }
            const daysLeft = Math.max(
                1,
                Math.ceil((new Date(household.trial_ends_at) - now) / 86_400_000),
            );
            try {
                await sendTrialPromptEmail({ household, stage, daysLeft });
                out.sent++;
            } catch (error) {
                // The claim stands (no retry storm); the in-app card still fires.
                console.error(`[trial] email failed for ${household.id} (${stage}):`, error.message);
                db.recordEvent("trial_prompt_failed", {
                    householdId: household.id,
                    meta: { stage, error: String(error.message ?? error).slice(0, 120) },
                });
                out.failed++;
            }
        }
    }
    return out;
}

// Registered with lib/jobs.js (see lib/jobs-registry.js); disabled when
// email isn't configured — there is nothing to send.
const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

module.exports = { STAGES, sweepTrialPrompts, premiumUrl, emailConfigured };
