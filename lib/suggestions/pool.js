// The pure half of the Inspiration pool: picking a serving from a pool and
// merging fresh model output into it. Reading/writing rows is db/queries.js
// (readSuggestionPool / upsertSuggestionPool / bumpSuggestionUsage); the
// request flow is recipeImportController.suggestRecipes.

const SERVE_COUNT = 6; // ideas per tap
const POOL_SERVE_MIN = 12; // serve from the pool without the model once it holds this many
const POOL_MAX = 24; // keep the newest/most varied up to this many per pool

const titleKey = (t) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A random `n` from `ideas`, skipping titles the household already has
 * (`excludeTitles`). Falls back to excluded ideas only when there aren't
 * enough others — better a repeat than an empty answer.
 */
function pick(ideas, n = SERVE_COUNT, excludeTitles = []) {
    const exclude = new Set(excludeTitles.map(titleKey));
    const fresh = [];
    const seen = [];
    for (const idea of ideas ?? []) {
        (exclude.has(titleKey(idea?.title)) ? seen : fresh).push(idea);
    }
    const out = shuffle(fresh).slice(0, n);
    if (out.length < n) out.push(...shuffle(seen).slice(0, n - out.length));
    return out;
}

/** Existing pool + fresh model ideas, deduped by title (existing wins), capped. */
function merge(existing, fresh, max = POOL_MAX) {
    const out = [];
    const keys = new Set();
    for (const idea of [...(existing ?? []), ...(fresh ?? [])]) {
        const k = titleKey(idea?.title);
        if (!k || keys.has(k)) continue;
        keys.add(k);
        out.push(idea);
    }
    // Over the cap: drop the oldest (existing come first) so the pool keeps moving.
    return out.length > max ? out.slice(out.length - max) : out;
}

function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

module.exports = { SERVE_COUNT, POOL_SERVE_MIN, POOL_MAX, pick, merge, titleKey };
