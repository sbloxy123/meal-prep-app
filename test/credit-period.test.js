// The anniversary-period maths lives in ONE place: the credit_period() SQL
// function (migration 016). This exercises it against a real database, so it
// needs DATABASE_URL (or the HOST/USER/… set) — run with
//
//   node -r dotenv/config --test test/credit-period.test.js
//
// Under a plain `npm test` (no env) it skips rather than fails.

const test = require("node:test");
const assert = require("node:assert/strict");

const hasDb = Boolean(process.env.DATABASE_URL || process.env.DATABASE);

// anchor, now → expected [start, end, index] as UTC instants.
// London midnight is 00:00Z in winter (GMT) and 23:00Z the previous day in
// summer (BST). Clamping always works from the ORIGINAL anchor day.
const CASES = [
    ["2026-01-31T10:00:00Z", "2026-02-15T00:00:00Z", "2026-01-31T00:00:00Z", "2026-02-28T00:00:00Z", 0],
    ["2026-01-31T10:00:00Z", "2026-03-01T00:00:00Z", "2026-02-28T00:00:00Z", "2026-03-30T23:00:00Z", 1], // no drift to 28 Mar; 31 Mar is BST
    ["2026-01-30T00:00:00Z", "2026-02-28T12:00:00Z", "2026-02-28T00:00:00Z", "2026-03-29T23:00:00Z", 1], // the +1 correction; 30 Mar is BST
    ["2028-01-31T00:00:00Z", "2028-02-10T00:00:00Z", "2028-01-31T00:00:00Z", "2028-02-29T00:00:00Z", 0], // leap year
    ["2026-03-15T00:00:00Z", "2026-04-01T00:00:00Z", "2026-03-15T00:00:00Z", "2026-04-14T23:00:00Z", 0], // GMT → BST
    ["2026-10-10T08:00:00Z", "2026-11-01T00:00:00Z", "2026-10-09T23:00:00Z", "2026-11-10T00:00:00Z", 0], // BST → GMT
    ["2026-05-31T00:00:00Z", "2026-07-01T00:00:00Z", "2026-06-29T23:00:00Z", "2026-07-30T23:00:00Z", 1], // 31 → 30 June (BST)
    ["2026-02-14T00:00:00Z", "2026-03-14T00:00:00Z", "2026-03-14T00:00:00Z", "2026-04-13T23:00:00Z", 1], // end is exclusive
    ["2026-02-14T00:00:00Z", "2026-02-13T23:59:00Z", "2026-02-14T00:00:00Z", "2026-03-14T00:00:00Z", 0], // now before anchor
    ["2025-02-14T00:00:00Z", "2026-02-20T00:00:00Z", "2026-02-14T00:00:00Z", "2026-03-14T00:00:00Z", 12],
    ["2026-03-29T01:30:00Z", "2026-03-29T12:00:00Z", "2026-03-29T00:00:00Z", "2026-04-28T23:00:00Z", 0], // spring-forward day
];

test("credit_period(): anniversary maths with clamping, DST and exclusive end", { skip: !hasDb && "no database configured" }, async () => {
    const pool = require("../db/pool");
    try {
        for (const [anchor, now, start, end, index] of CASES) {
            const { rows } = await pool.query("SELECT * FROM credit_period($1::timestamptz, $2::timestamptz)", [anchor, now]);
            const r = rows[0];
            assert.equal(new Date(r.period_start).toISOString(), new Date(start).toISOString(), `start for anchor ${anchor} at ${now}`);
            assert.equal(new Date(r.period_end).toISOString(), new Date(end).toISOString(), `end for anchor ${anchor} at ${now}`);
            assert.equal(r.period_index, index, `index for anchor ${anchor} at ${now}`);
        }

        // Idempotent at the boundaries: now = start and now = end - 1ms give the same period.
        const { rows: a } = await pool.query("SELECT * FROM credit_period($1::timestamptz, $2::timestamptz)", [
            "2026-01-31T10:00:00Z",
            "2026-02-28T00:00:00Z",
        ]);
        const { rows: b } = await pool.query("SELECT * FROM credit_period($1::timestamptz, $2::timestamptz)", [
            "2026-01-31T10:00:00Z",
            "2026-03-30T22:59:59.999Z", // 1ms before 31 Mar 00:00 BST
        ]);
        assert.equal(new Date(a[0].period_start).toISOString(), new Date(b[0].period_start).toISOString());
        assert.equal(a[0].period_index, 1);
    } finally {
        await pool.end();
    }
});
