// The Inspiration prompt and its parser, shared by the request path
// (recipeImportController.suggestRecipes) and the seed builder
// (scripts/build-suggestion-seed.js) so both fill pools with the same shape.

const { jsonrepair } = require("jsonrepair");
const { describeSignature } = require("./normalise");

function stripFences(text) {
    return String(text ?? "")
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
}

/**
 * @param {object} p
 * @param {string} p.hint    what the person typed ('' = anything)
 * @param {string} p.diets   dietSignature(), '' when unrestricted
 * @param {number} p.count   ideas wanted
 * @param {string[]} p.avoid titles already in the pool — don't repeat them
 */
function suggestionPrompt({ hint, diets, count, avoid }) {
    const steer = hint
        ? `The user is after: "${hint}". Tailor every idea to that.`
        : "Give a varied mix of crowd-pleasing everyday home dinners.";
    const dietLine = diets
        ? `\nEvery idea MUST be ${describeSignature(diets)} — no exceptions, no "swap the meat" notes.`
        : "";
    const avoidLine =
        avoid && avoid.length
            ? `\nDo NOT suggest any of these (already offered): ${avoid.slice(0, 40).join("; ")}. Give different dishes.`
            : "";
    return `You are a recipe idea generator for UK home cooks. Suggest ${count} home-cooking recipe ideas.
${steer}${dietLine}${avoidLine}

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "suggestions": [
    { "title": string, "tags": [string], "ingredients": [string] }
  ]
}
- "title" is the dish name (e.g. "Chicken katsu curry").
- "tags" are 1-3 short collection labels a home cook would file it under (e.g. "Dinner", "Kids", "Vegetarian", "Quick"). Capitalise them.
- "ingredients" are 5-10 plain ingredient names only — NO quantities, numbers or units (e.g. "chicken breast", "panko breadcrumbs", "curry sauce", "rice").
Give ${count} distinct ideas.`;
}

// Normalise one raw suggestion into { title, tags[], ingredients[] } of clean
// strings, or null if it hasn't got a usable title + ingredients.
function normaliseSuggestion(raw) {
    if (!raw || typeof raw !== "object") return null;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) return null;
    const toStrings = (value) =>
        (Array.isArray(value) ? value : [])
            .map((v) => (typeof v === "string" ? v : v?.name || ""))
            .map((s) => s.replace(/\s+/g, " ").trim())
            .filter(Boolean);
    const ingredients = toStrings(raw.ingredients);
    if (ingredients.length === 0) return null;
    return { title, tags: toStrings(raw.tags), ingredients };
}

/** Model text → clean suggestions[]. Throws "unparseable" when it isn't JSON. */
function parseSuggestions(text) {
    const raw = stripFences(text);
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        try {
            data = JSON.parse(jsonrepair(raw));
        } catch {
            const err = new Error("unparseable");
            err.code = "unparseable";
            throw err;
        }
    }
    const list = Array.isArray(data?.suggestions) ? data.suggestions : Array.isArray(data) ? data : [];
    return list.map(normaliseSuggestion).filter(Boolean);
}

module.exports = { suggestionPrompt, parseSuggestions, normaliseSuggestion };
