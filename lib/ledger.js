// The AI usage ledger: one ai_usage row per user-facing AI action.
//
//   const ledger = await startAiAction(req, res, { action, … }); // lib/aiAllowance.js
//   const message = await runModel(ledger, params);   // lib/ai.js records tokens/cost
//   await ledger.settle("ok");                         // or "refund" / "failed"
//
// The row is inserted 'pending' up front (db.reserveCredits, under a
// per-household lock) so in-flight work already counts against the
// allowance, then settled once. Outcomes:
//   ok      – the action produced something the user can use; credits stand.
//   refund  – the model answered but the result was useless to the user (page
//             wasn't a recipe, photo unreadable). Tokens/cost are kept, credits
//             are zeroed. A completed-but-empty answer must not cost the user.
//   failed  – no completed model answer (SDK threw, fetch failed before the
//             model ran, unparseable response). Credits zeroed.
// settle() is idempotent — the first call wins — so a handler can settle on
// its success path and again in a catch without double-writing. Every DB
// failure inside the ledger is swallowed and logged: analytics must never
// break the action it is measuring.

const db = require("../db/queries");
const { costUsd, usdToPence, tokensFrom } = require("./aiCost");

class Ledger {
    constructor({ id, action, credits }) {
        this.id = id;
        this.action = action;
        this.credits = credits;
        this.calls = [];
        this.startedAt = null;
        this.endedAt = null;
        this.settled = false;
        this.model = null;
    }

    // Called by runModel for every model call, successful or not.
    record({ model, usage = null, latencyMs = 0, ok, startedAt, endedAt, error = null }) {
        const tokens = tokensFrom(usage);
        const usd = ok ? costUsd(model, usage) : 0;
        this.calls.push({ model, ok, latencyMs, tokens, usd, error: error ? String(error.message || error) : null });
        if (this.startedAt == null || startedAt < this.startedAt) this.startedAt = startedAt;
        if (this.endedAt == null || endedAt > this.endedAt) this.endedAt = endedAt;
        if (ok) this.model = model;
    }

    get succeededCalls() {
        return this.calls.filter((c) => c.ok).length;
    }

    totals() {
        const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0 };
        for (const c of this.calls) {
            t.input += c.tokens.input;
            t.output += c.tokens.output;
            t.cacheRead += c.tokens.cacheRead;
            t.cacheWrite += c.tokens.cacheWrite;
            t.usd += c.usd;
        }
        t.usd = Math.round(t.usd * 1e6) / 1e6;
        return t;
    }

    // outcome: "ok" | "refund" | "failed". extra.meta is merged into the row's
    // meta; extra.error / extra.errorCode fill error_code.
    async settle(outcome, extra = {}) {
        if (this.settled) return;
        this.settled = true;
        if (this.id == null) return;

        const t = this.totals();
        const models = [...new Set(this.calls.map((c) => c.model))];
        const meta = {
            ...(extra.meta || {}),
            ...(models.length > 1 ? { models } : {}),
            ...(extra.outcome ? { outcome: extra.outcome } : {}),
        };
        const errorCode =
            extra.errorCode ??
            (extra.error ? errorCodeFrom(extra.error) : null) ??
            (outcome === "failed" ? this.calls.find((c) => !c.ok)?.error?.slice(0, 120) ?? null : null);

        try {
            await db.settleAiUsage(this.id, {
                status: outcome === "failed" ? "failed" : "ok",
                credits: outcome === "ok" ? this.credits : 0,
                model: this.model,
                calls: this.calls.length,
                inputTokens: t.input,
                outputTokens: t.output,
                cacheReadTokens: t.cacheRead,
                cacheWriteTokens: t.cacheWrite,
                costUsd: t.usd,
                costPence: usdToPence(t.usd),
                latencyMs:
                    this.startedAt != null && this.endedAt != null ? this.endedAt - this.startedAt : null,
                errorCode,
                meta: Object.keys(meta).length ? meta : null,
            });
        } catch (error) {
            console.error("[ledger] settle failed:", error.message);
        }
    }

    // Convenience for catch blocks: settle as failed with the thrown error.
    async fail(error) {
        return this.settle("failed", { error });
    }
}

// A short, stable code for the error_code column — the SDK's error class name
// (RateLimitError, APIConnectionTimeoutError…) or an HTTP status where present.
function errorCodeFrom(error) {
    if (!error) return null;
    if (error.status) return `http_${error.status}`;
    if (error.name && error.name !== "Error") return error.name;
    if (error.code) return String(error.code);
    return String(error.message || error).slice(0, 120);
}

module.exports = { Ledger, errorCodeFrom };
