// The one in-process scheduler. Every background job registers here with a
// name and a function; a single hourly tick runs them in order, each in its
// own try/catch so one failure never starves the others. Jobs must be
// idempotent — they run on every instance and after every restart — which
// they achieve by claiming their work in the database (see lib/trial.js,
// lib/snapshots.js, lib/digest.js).
//
//   registerJob("snapshots", () => writeMissingSnapshots());
//   startJobs();   // once, from app.js after listen

const TICK_MS = 60 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 30 * 1000;

const jobs = [];
let timer = null;

function registerJob(name, run, { enabled = true } = {}) {
    jobs.push({ name, run, enabled });
}

async function tick() {
    for (const job of jobs) {
        if (!job.enabled) continue;
        try {
            const result = await job.run();
            if (result && Object.values(result).some((v) => v)) {
                console.log(`[jobs] ${job.name}: ${JSON.stringify(result)}`);
            }
        } catch (error) {
            console.error(`[jobs] ${job.name} failed:`, error.message);
        }
    }
}

function startJobs() {
    if (timer) return;
    setTimeout(tick, FIRST_TICK_DELAY_MS).unref();
    timer = setInterval(tick, TICK_MS);
    timer.unref();
    console.log(`[jobs] scheduled: ${jobs.filter((j) => j.enabled).map((j) => j.name).join(", ") || "none"}`);
}

module.exports = { registerJob, startJobs, tick };
