// Monday-morning email to ADMIN_EMAILS with last week's numbers and the
// week-on-week change, built from metric_snapshots. Runs from the hourly job
// tick: on a Monday at or after 08:00 London it claims the ISO week in
// app_events (unique index, migration 020) and sends once.

const pool = require("../db/pool");
const db = require("../db/queries");
const { sendEmail } = require("./email");

const TZ = "Europe/London";

function londonParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
    const p = Object.fromEntries(fmt.formatToParts(date).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
    return { weekday: p.weekday, hour: Number(p.hour), day: `${p.year}-${p.month}-${p.day}` };
}

// ISO week key, e.g. 2026-W37, for the week that just ended (Mon–Sun).
function isoWeekKey(dayStr) {
    const d = new Date(dayStr + "T00:00:00Z");
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t - yearStart) / 86_400_000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function adminEmails() {
    return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
}

async function weekTotals(endDay, offsetDays) {
    // Seven snapshot days ending `offsetDays` before endDay (inclusive window).
    const { rows } = await pool.query(
        `SELECT day::text AS day, metrics FROM metric_snapshots
         WHERE day <= $1::date - $2::int AND day > $1::date - $2::int - 7
         ORDER BY day`,
        [endDay, offsetDays],
    );
    const sum = (k) => rows.reduce((a, r) => a + (Number(r.metrics?.[k]) || 0), 0);
    const last = rows[rows.length - 1]?.metrics ?? {};
    const ret = rows.reduce((a, r) => {
        const d = r.metrics?.retention?.d7;
        if (d) { a.cohort += d.cohort; a.retained += d.retained; }
        return a;
    }, { cohort: 0, retained: 0 });
    return {
        days: rows.length,
        signups: sum("signups"),
        active7d: Number(last.active_7d) || 0,
        users: Number(last.users) || 0,
        paid: Number(last.paid_households) || 0,
        mrrPence: Number(last.mrr_pence) || 0,
        aiCostPence: Math.round(sum("ai_cost_pence") * 100) / 100,
        trialsStarted: sum("trials_started"),
        trialsConverted: sum("trials_converted"),
        shops: sum("shops_finished"),
        lists: sum("lists_generated"),
        recipes: sum("recipes_created"),
        cancellations: sum("cancellations"),
        d7: ret.cohort ? Math.round((ret.retained / ret.cohort) * 100) : null,
        d7Cohort: ret.cohort,
    };
}

function delta(now, before, fmt = (v) => String(v)) {
    if (before == null || now == null) return "";
    const diff = now - before;
    if (diff === 0) return " (no change)";
    return ` (${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))} vs last week)`;
}

const money = (p) => `£${(p / 100).toFixed(2)}`;

function digestText({ week, endDay, a, b, url }) {
    const line = (label, v, d = "") => `${label}: ${v}${d}`;
    return [
        `Fornetto — week ${week} (to ${endDay})`,
        "",
        line("Signups", a.signups, delta(a.signups, b.signups)),
        line("Active in the last 7 days", a.active7d, delta(a.active7d, b.active7d)),
        line("Day-7 retention", a.d7 == null ? "—" : `${a.d7}% of ${a.d7Cohort}`, b.d7 == null ? "" : delta(a.d7, b.d7, (v) => `${v} pts`)),
        line("Paying households", a.paid, delta(a.paid, b.paid)),
        line("MRR", money(a.mrrPence), delta(a.mrrPence, b.mrrPence, money)),
        line("Cancellations", a.cancellations, delta(a.cancellations, b.cancellations)),
        line("Trials started / converted", `${a.trialsStarted} / ${a.trialsConverted}`),
        line("AI cost", money(a.aiCostPence), delta(a.aiCostPence, b.aiCostPence, money)),
        line("Lists generated / shops finished", `${a.lists} / ${a.shops}`, delta(a.shops, b.shops)),
        line("Recipes added", a.recipes, delta(a.recipes, b.recipes)),
        "",
        `Back of house: ${url}`,
        a.days < 7 ? `(only ${a.days} day${a.days === 1 ? "" : "s"} of snapshots this week)` : "",
    ].filter((l) => l !== "").join("\n");
}

function digestHtml(text) {
    const { actionEmail } = require("./email");
    const body = text
        .split("\n")
        .slice(2)
        .filter((l) => l && !l.startsWith("Back of house"))
        .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;"))
        .join("<br>");
    const url = /Back of house: (\S+)/.exec(text)?.[1] ?? "";
    return actionEmail({ heading: text.split("\n")[0], body, buttonLabel: "Open back of house", url });
}

async function sendWeeklyDigestIfDue({ now = new Date() } = {}) {
    const { weekday, hour, day } = londonParts(now);
    if (weekday !== "Mon" || hour < 8) return { skipped: "not due" };
    const to = adminEmails();
    if (to.length === 0) return { skipped: "no ADMIN_EMAILS" };
    const yesterday = require("./snapshots").addDays(day, -1); // Sunday
    const week = isoWeekKey(yesterday);
    const { rowCount } = await pool.query(
        `INSERT INTO app_events (type, meta) VALUES ('admin_digest', $1)
         ON CONFLICT ((meta->>'week')) WHERE type = 'admin_digest' DO NOTHING`,
        [JSON.stringify({ week })],
    );
    if (rowCount !== 1) return { skipped: "already sent" };
    const [a, b] = await Promise.all([weekTotals(yesterday, 0), weekTotals(yesterday, 7)]);
    const FRONTEND_URL = (process.env.ALLOWED_ORIGINS?.split(",")[0] || "http://localhost:3000").trim().replace(/\/$/, "");
    const url = `${FRONTEND_URL}/back-of-house`;
    const text = digestText({ week, endDay: yesterday, a, b, url });
    await sendEmail({ to, subject: `Fornetto week ${week}: ${a.signups} signups, ${a.paid} paying, ${money(a.mrrPence)} MRR`, text, html: digestHtml(text) });
    return { sent: 1, week };
}

module.exports = { sendWeeklyDigestIfDue, weekTotals, isoWeekKey, digestText };
