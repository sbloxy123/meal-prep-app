const db = require("../db/queries");
const { PROTEINS, DIETS } = require("../lib/dietary");

// Generic client-side usage events (the onboarding funnel today). Best-effort
// like premium_cta: never fails the request, never awaited.
//
// The admin dashboard aggregates these with SQL that casts meta values, so meta
// is whitelisted and coerced per event rather than stored as sent — a client
// can't put a string where a COUNT/SUM expects a number.

const ALLOWED = new Set([
    "onboarding_shown",
    "onboarding_started",
    "onboarding_step",
    "onboarding_skipped",
    "onboarding_ai_handoff",
    "onboarding_completed",
    // Intent: they typed dishes on the "what do you cook most?" step. The
    // server logs onboarding_usuals separately for what was actually written —
    // the ratio between the two is the drop-off. Keep the names distinct: the
    // usuals fair-use counter counts onboarding_usuals only.
    "onboarding_usuals_typed",
    // Install funnel. iOS has no install prompt or appinstalled event, so the
    // sheet is ours and the only true "installed" signal is a later launch in
    // standalone display-mode (install_standalone_open, once per session).
    // install_email_sent is written server-side (lib/install.js), not here.
    "install_prompt_shown",
    "install_prompt_outcome",
    "install_page_view",
    "install_standalone_open",
    // A phone on an iOS newer than the walkthrough has been verified on. The
    // first sighting of each major emails the admins (lib/install.js).
    "install_layout_unverified",
    // The in-app trial card was shown (stage: ending_soon | last_day | ended).
    // The email counterpart is written server-side by lib/trial.js. One row
    // per household/stage/channel (unique index, migration 017) — repeats are
    // dropped by the database, so a client can't inflate the funnel.
    "trial_prompt",
]);

const { alertNewIosMajor } = require("../lib/install");

const num = (v) => (Number.isFinite(v) ? Math.trunc(v) : undefined);
const str = (v, max = 40) => (typeof v === "string" ? v.slice(0, max) : undefined);
const list = (v, allowed) =>
    Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))] : undefined;

// Per-event meta shape. Anything not named here is dropped.
function cleanMeta(type, raw) {
    const m = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    const set = (k, v) => {
        if (v !== undefined) out[k] = v;
    };

    if (type === "onboarding_shown") set("entry", str(m.entry, 20));
    if (type === "onboarding_step" || type === "onboarding_skipped") set("step", num(m.step));
    if (type === "onboarding_skipped") set("soft", m.soft === true);
    if (type === "onboarding_ai_handoff" || type === "onboarding_completed") {
        set("diets", list(m.diets, DIETS));
    }
    if (type === "onboarding_usuals_typed") set("dishes", num(m.dishes));
    if (type === "onboarding_completed") {
        set("offered", num(m.offered));
        set("chosen", num(m.chosen));
        set("added", num(m.added));
        set("scope", str(m.scope, 10));
        set("proteins", list(m.proteins, PROTEINS));
        set("usuals", num(m.usuals));
        set("usuals_written", num(m.usualsWritten));
        set("usuals_title_only", num(m.usualsTitleOnly));
    }

    if (type.startsWith("install_")) {
        set("platform", str(m.platform, 20));
        set("browser", str(m.browser, 20));
    }
    if (type === "install_prompt_shown") set("source", str(m.source, 20));
    if (type === "install_prompt_outcome") set("outcome", str(m.outcome, 20));
    if (type === "install_page_view") set("from", str(m.from, 20));
    if (type === "install_layout_unverified") {
        set("ios", str(m.ios, 8));
        set("verified", num(m.verified));
    }

    if (type === "trial_prompt") {
        set("stage", ["ending_soon", "last_day", "ended"].includes(m.stage) ? m.stage : undefined);
        set("channel", "app");
    }

    if (Object.keys(out).length === 0) return null;
    // Belt and braces against an unexpectedly large payload reaching JSONB.
    return JSON.stringify(out).length > 1024 ? null : out;
}

async function logEvent(req, res) {
    const type = typeof req.body?.type === "string" ? req.body.type : "";
    // Unknown event names are ignored rather than rejected — analytics must
    // never be able to break a user-facing flow.
    if (ALLOWED.has(type)) {
        const meta = cleanMeta(type, req.body?.meta);
        db.recordEvent(type, {
            userId: req.user?.id ?? null,
            householdId: req.householdId ?? null,
            meta,
        });
        if (type === "install_layout_unverified" && meta?.ios) {
            void alertNewIosMajor(meta.ios).catch((err) =>
                console.error("[install] iOS alert failed:", err.message ?? err),
            );
        }
    }
    res.json({ ok: true });
}

module.exports = { logEvent };
