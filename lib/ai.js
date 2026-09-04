// The one place this API talks to Anthropic.
//
//   const message = await runModel(ledger, { model, max_tokens, messages }, { timeout });
//
// Wraps client.messages.create so every call is timed and its usage block
// (tokens) lands on the ledger — the ai_usage row for the action — whether the
// call succeeds or throws. Callers never touch the client directly; that is
// what makes "every AI call is logged" true rather than hoped for.
//
// Timeouts are explicit. The SDK defaults (10 minutes, 2 retries) turned a
// parallel batch into a request that could hang for minutes (see the usuals
// path), so the default here is a minute with one retry; callers pass their
// own where they know better.

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 1;

async function runModel(ledger, params, options = {}) {
    const opts = {
        timeout: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        ...options,
    };
    const startedAt = Date.now();
    try {
        const message = await client.messages.create(params, opts);
        const endedAt = Date.now();
        ledger?.record({
            model: message.model || params.model,
            usage: message.usage,
            latencyMs: endedAt - startedAt,
            ok: true,
            startedAt,
            endedAt,
        });
        return message;
    } catch (error) {
        const endedAt = Date.now();
        ledger?.record({
            model: params.model,
            usage: null,
            latencyMs: endedAt - startedAt,
            ok: false,
            startedAt,
            endedAt,
            error,
        });
        throw error;
    }
}

// The text of the first content block, with any ```json fences stripped —
// every prompt in this app asks for raw JSON and the models still fence it
// sometimes.
function textOf(message) {
    const block = message?.content?.find((b) => b.type === "text");
    const text = block?.text ?? "";
    return text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
}

module.exports = { runModel, textOf, client, DEFAULT_TIMEOUT_MS };
