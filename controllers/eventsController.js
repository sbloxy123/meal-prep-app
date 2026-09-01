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
]);

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
    if (type === "onboarding_completed") {
        set("offered", num(m.offered));
        set("chosen", num(m.chosen));
        set("added", num(m.added));
        set("scope", str(m.scope, 10));
        set("proteins", list(m.proteins, PROTEINS));
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
        db.recordEvent(type, {
            userId: req.user?.id ?? null,
            householdId: req.householdId ?? null,
            meta: cleanMeta(type, req.body?.meta),
        });
    }
    res.json({ ok: true });
}

module.exports = { logEvent };
