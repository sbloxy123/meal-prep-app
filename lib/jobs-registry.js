// Every background job, in the order they run each hour. Add a job = one line.
const { registerJob } = require("./jobs");

function registerAll() {
    const trial = require("./trial");
    const snapshots = require("./snapshots");
    const digest = require("./digest");
    registerJob("trial-prompts", () => trial.sweepTrialPrompts(), { enabled: trial.emailConfigured() });
    registerJob("snapshots", () => snapshots.writeMissingSnapshots());
    registerJob("weekly-digest", () => digest.sendWeeklyDigestIfDue(), { enabled: trial.emailConfigured() });
    if (!trial.emailConfigured()) console.warn("[jobs] RESEND_API_KEY not set — trial emails and the digest are disabled");
}

module.exports = { registerAll };
