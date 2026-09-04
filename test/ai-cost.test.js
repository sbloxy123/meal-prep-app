// Run with `npm test` (node --test).
//
// lib/aiCost.js turns Anthropic's usage block into money. These pin the
// arithmetic (list prices, cache multipliers, rounding) and the model-id
// matching, and lib/ledger.js's aggregation of several calls into one row.

const test = require("node:test");
const assert = require("node:assert/strict");

const { costUsd, usdToPence, priceFor, tokensFrom } = require("../lib/aiCost");
const { Ledger, errorCodeFrom } = require("../lib/ledger");

test("matches dated snapshots and bare aliases to the same price", () => {
    assert.equal(priceFor("claude-haiku-4-5-20251001").input, 1.0);
    assert.equal(priceFor("claude-haiku-4-5").input, 1.0);
    assert.equal(priceFor("claude-sonnet-4-6").output, 15.0);
    assert.equal(priceFor("gpt-whatever"), null);
    assert.equal(priceFor(undefined), null);
});

test("haiku: 3,000 in + 1,000 out = $0.008", () => {
    const usd = costUsd("claude-haiku-4-5-20251001", { input_tokens: 3000, output_tokens: 1000 });
    assert.equal(usd, 0.008);
});

test("sonnet vision page: 5,000 in + 1,500 out = $0.0375", () => {
    const usd = costUsd("claude-sonnet-4-6", { input_tokens: 5000, output_tokens: 1500 });
    assert.equal(usd, 0.0375);
});

test("cache reads are a tenth of input, cache writes 1.25x", () => {
    const usd = costUsd("claude-haiku-4-5", {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
    });
    assert.equal(usd, 0.1 + 1.25);
});

test("unknown model costs nothing rather than throwing", () => {
    assert.equal(costUsd("claude-mystery-9", { input_tokens: 100, output_tokens: 100 }), 0);
});

test("missing or junk usage fields count as zero", () => {
    assert.deepEqual(tokensFrom(null), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    assert.deepEqual(tokensFrom({ input_tokens: "12", output_tokens: -3, cache_read_input_tokens: "x" }), {
        input: 12,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
    });
});

test("usd → pence at an explicit rate, 4 dp", () => {
    assert.equal(usdToPence(0.008, 0.78), 0.624);
    assert.equal(usdToPence(1, 0.5), 50);
    assert.equal(usdToPence(0.0375, 0.78), 2.925);
});

test("a ledger sums several calls into one row and keeps the last model that answered", () => {
    const ledger = new Ledger({ id: 1, action: "photo", credits: 3 });
    ledger.record({
        model: "claude-haiku-4-5-20251001",
        usage: { input_tokens: 4000, output_tokens: 800 },
        latencyMs: 3000,
        ok: true,
        startedAt: 1000,
        endedAt: 4000,
    });
    ledger.record({
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 4000, output_tokens: 900 },
        latencyMs: 6000,
        ok: true,
        startedAt: 4000,
        endedAt: 10000,
    });
    const t = ledger.totals();
    assert.equal(t.input, 8000);
    assert.equal(t.output, 1700);
    // haiku 0.004 + 0.004 = 0.008; sonnet 0.012 + 0.0135 = 0.0255
    assert.equal(t.usd, 0.0335);
    assert.equal(ledger.model, "claude-sonnet-4-6");
    assert.equal(ledger.calls.length, 2);
    assert.equal(ledger.endedAt - ledger.startedAt, 9000);
});

test("a failed call records no cost but is still counted", () => {
    const ledger = new Ledger({ id: 1, action: "generate", credits: 1 });
    ledger.record({
        model: "claude-haiku-4-5",
        usage: null,
        latencyMs: 500,
        ok: false,
        startedAt: 0,
        endedAt: 500,
        error: new Error("boom"),
    });
    assert.equal(ledger.totals().usd, 0);
    assert.equal(ledger.calls.length, 1);
    assert.equal(ledger.succeededCalls, 0);
    assert.equal(ledger.model, null);
});

test("error codes prefer an HTTP status, then the error class", () => {
    assert.equal(errorCodeFrom({ status: 429, name: "RateLimitError" }), "http_429");
    assert.equal(errorCodeFrom({ name: "APIConnectionTimeoutError" }), "APIConnectionTimeoutError");
    assert.equal(errorCodeFrom(new Error("plain")), "plain");
    assert.equal(errorCodeFrom(null), null);
});
