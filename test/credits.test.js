// Run with `npm test` (node --test).
//
// lib/credits.js is the pure half of entitlement: given a household row, the
// current period and the config, what plan is this, how many credits does it
// have, what does an action cost. These pin the rules the plan agreed on.

const test = require("node:test");
const assert = require("node:assert/strict");

const { effectivePlan, allowanceFor, weightFor, memberLimitFor, buildEntitlement, canAfford } = require("../lib/credits");

const NOW = new Date("2026-09-10T12:00:00Z");
const CONFIG = {
    trial_days: 14,
    free_credit_allowance: 50,
    premium_credit_allowance: 300,
    credit_weights: { import: 1, photo: 3, aisle: 0, usuals: 0 },
    member_limit_free: 2,
};

const row = (over = {}) => ({
    plan: "free",
    premium_until: null,
    trial_ends_at: null,
    credit_allowance: 50,
    premium_credit_allowance: 300,
    credit_weights: { import: 1, photo: 3, aisle: 0, usuals: 0 },
    member_limit: 2,
    founder: false,
    billing_interval: null,
    ...over,
});

test("premium while the plan is premium and premium_until is ahead or null", () => {
    assert.equal(effectivePlan(row({ plan: "premium" }), NOW), "premium");
    assert.equal(effectivePlan(row({ plan: "premium", premium_until: "2026-10-01T00:00:00Z" }), NOW), "premium");
    assert.equal(effectivePlan(row({ plan: "premium", premium_until: "2026-09-01T00:00:00Z" }), NOW), "free");
});

test("trial = free plan with trial_ends_at still ahead; premium beats trial", () => {
    assert.equal(effectivePlan(row({ trial_ends_at: "2026-09-20T00:00:00Z" }), NOW), "trial");
    assert.equal(effectivePlan(row({ trial_ends_at: "2026-09-01T00:00:00Z" }), NOW), "free");
    assert.equal(effectivePlan(row({ plan: "premium", trial_ends_at: "2026-09-20T00:00:00Z" }), NOW), "premium");
    assert.equal(effectivePlan(null, NOW), "free");
});

test("allowance follows the plan: free 50, premium/trial 300, comp unlimited", () => {
    assert.equal(allowanceFor(row(), "free", CONFIG), 50);
    assert.equal(allowanceFor(row(), "trial", CONFIG), 300);
    assert.equal(allowanceFor(row(), "premium", CONFIG), 300);
    assert.equal(allowanceFor(row({ plan: "premium", premium_credit_allowance: null }), "premium", CONFIG), null);
});

test("the household snapshot beats config; config fills a missing snapshot", () => {
    assert.equal(allowanceFor(row({ credit_allowance: 15 }), "free", CONFIG), 15);
    const noSnap = row();
    delete noSnap.credit_allowance;
    delete noSnap.premium_credit_allowance;
    assert.equal(allowanceFor(noSnap, "free", CONFIG), 50);
    assert.equal(allowanceFor(noSnap, "premium", CONFIG), 300);
});

test("weights: snapshot → config → 1, so a new action is never free by accident", () => {
    assert.equal(weightFor(row(), CONFIG, "photo"), 3);
    assert.equal(weightFor(row(), CONFIG, "aisle"), 0);
    assert.equal(weightFor(row({ credit_weights: { photo: 5 } }), CONFIG, "photo"), 5);
    assert.equal(weightFor(row({ credit_weights: { photo: 5 } }), CONFIG, "import"), 1);
    assert.equal(weightFor(row({ credit_weights: {} }), { credit_weights: {} }, "brand_new"), 1);
    assert.equal(weightFor(row({ credit_weights: { photo: "3" } }), CONFIG, "photo"), 3); // non-integer snapshot ignored
});

test("member limit: free households get their snapshot, premium and trial are unlimited", () => {
    assert.equal(memberLimitFor(row(), "free", CONFIG), 2);
    assert.equal(memberLimitFor(row({ member_limit: 1 }), "free", CONFIG), 1);
    assert.equal(memberLimitFor(row(), "trial", CONFIG), null);
    assert.equal(memberLimitFor(row(), "premium", CONFIG), null);
});

test("buildEntitlement assembles the API shape", () => {
    const period = { period_start: "2026-08-14T23:00:00Z", period_end: "2026-09-13T23:00:00Z" };
    const e = buildEntitlement(row({ trial_ends_at: "2026-09-20T00:00:00Z" }), period, 7, CONFIG, NOW);
    assert.equal(e.plan, "trial");
    assert.deepEqual(e.credits, {
        used: 7,
        allowance: 300,
        remaining: 293,
        unlimited: false,
        exhausted: false,
        resetsAt: "2026-09-13T23:00:00.000Z",
        periodStart: "2026-08-14T23:00:00.000Z",
    });
    assert.equal(e.memberLimit, null);
    assert.equal(e.trialEndsAt, "2026-09-20T00:00:00.000Z");
    assert.equal(e.weights.photo, 3);

    const free = buildEntitlement(row(), period, 50, CONFIG, NOW);
    assert.equal(free.plan, "free");
    assert.equal(free.credits.remaining, 0);
    assert.equal(free.credits.exhausted, true);
    assert.equal(free.memberLimit, 2);

    const comp = buildEntitlement(row({ plan: "premium", premium_credit_allowance: null }), period, 900, CONFIG, NOW);
    assert.equal(comp.credits.unlimited, true);
    assert.equal(comp.credits.remaining, null);
    assert.equal(comp.credits.exhausted, false);
});

test("canAfford: zero-credit actions always pass; unlimited always passes; the last credit is spendable", () => {
    const e = (used, allowance) => ({ credits: { used, allowance } });
    assert.equal(canAfford(e(50, 50), 0), true);
    assert.equal(canAfford(e(49, 50), 1), true);
    assert.equal(canAfford(e(50, 50), 1), false);
    assert.equal(canAfford(e(48, 50), 3), false);
    assert.equal(canAfford(e(47, 50), 3), true);
    assert.equal(canAfford(e(10_000, null), 3), true);
});
