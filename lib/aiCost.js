// What a model call costs, from the usage block Anthropic returns.
//
// Pure: no I/O, so it is unit-tested (test/ai-cost.test.js). Prices are list
// prices in USD per million tokens. Cache reads are billed at 10% of input,
// cache writes at 125% (5-minute TTL — the only kind this app uses). The GBP
// figure uses a fixed rate so the dashboard can show pence without a live FX
// lookup; set AI_USD_TO_GBP in the environment to move it. When prices or the
// rate change, only rows written afterwards are affected — the ledger stores
// what was true at the time.

const PRICES_USD_PER_MTOK = [
    // Match on the model id prefix so a dated snapshot ("…-20251001") and the
    // bare alias both resolve. Longest prefix wins.
    { prefix: "claude-haiku-4-5", input: 1.0, output: 5.0 },
    { prefix: "claude-sonnet-4-6", input: 3.0, output: 15.0 },
    { prefix: "claude-sonnet-4-5", input: 3.0, output: 15.0 },
    { prefix: "claude-sonnet-5", input: 2.0, output: 10.0 },
    { prefix: "claude-opus-4-6", input: 5.0, output: 25.0 },
    { prefix: "claude-opus-4-7", input: 5.0, output: 25.0 },
    { prefix: "claude-opus-4-8", input: 5.0, output: 25.0 },
    { prefix: "claude-opus-5", input: 5.0, output: 25.0 },
];

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

const DEFAULT_USD_TO_GBP = 0.78;

function usdToGbpRate() {
    const raw = Number(process.env.AI_USD_TO_GBP);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_TO_GBP;
}

function priceFor(model) {
    if (typeof model !== "string") return null;
    let best = null;
    for (const p of PRICES_USD_PER_MTOK) {
        if (model.startsWith(p.prefix) && (!best || p.prefix.length > best.prefix.length)) {
            best = p;
        }
    }
    return best;
}

// Normalise the SDK's usage object (any field may be missing on older responses).
function tokensFrom(usage) {
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);
    return {
        input: n(usage?.input_tokens),
        output: n(usage?.output_tokens),
        cacheRead: n(usage?.cache_read_input_tokens),
        cacheWrite: n(usage?.cache_creation_input_tokens),
    };
}

// Cost in USD for one call. Unknown model → 0 (and the caller records the model
// id, so a zero-cost row with a model name is the signal to add a price).
function costUsd(model, usage) {
    const price = priceFor(model);
    if (!price) return 0;
    const t = tokensFrom(usage);
    const usd =
        (t.input * price.input +
            t.output * price.output +
            t.cacheRead * price.input * CACHE_READ_MULTIPLIER +
            t.cacheWrite * price.input * CACHE_WRITE_MULTIPLIER) /
        1_000_000;
    return round(usd, 6);
}

function usdToPence(usd, rate = usdToGbpRate()) {
    return round(usd * rate * 100, 4);
}

function round(value, places) {
    const f = 10 ** places;
    return Math.round(value * f) / f;
}

module.exports = {
    PRICES_USD_PER_MTOK,
    DEFAULT_USD_TO_GBP,
    priceFor,
    tokensFrom,
    costUsd,
    usdToPence,
    usdToGbpRate,
};
