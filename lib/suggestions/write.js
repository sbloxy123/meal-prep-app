// Writing a pool idea up as a full recipe — the prompt and its parser, shared
// by POST /recipes/suggest/add (lazy, on the first household that adds the
// idea) and the seed builder (up front, for the 50 common terms). The result
// is stored on the idea as `recipe` (migration 022's ideas JSONB), so every
// later household gets it instantly and free.
//
// Shape stored on the idea:
//   recipe: {
//     description: string|null,
//     ingredients: string[]        — full lines, e.g. "500g beef mince"
//     instructions: string         — one step per line (lib/steps normaliseSteps)
//     prep_time_minutes, cook_time_minutes, servings: number|null
//     calories, protein_g, carb_g, fat_g: number|null   — per serving
//   }

const { jsonrepair } = require("jsonrepair");
const { normaliseSteps } = require("../steps");
const { describeSignature } = require("./normalise");

function fullRecipePrompt({ title, ingredients, diets }) {
    const dietLine = diets ? `\nThe recipe MUST be ${describeSignature(diets)}.` : "";
    const ingLine =
        ingredients && ingredients.length
            ? `\nIt should use these (add what else is needed): ${ingredients.slice(0, 12).join(", ")}.`
            : "";
    return `You are a recipe writer for UK home cooks. Write a sensible, common-sense recipe for this dish.
Dish title: ${title}${dietLine}${ingLine}

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "description": string | null,        // one or two sentences
  "ingredients": [string],             // full lines with realistic UK quantities, e.g. "500g beef mince", "1 onion, finely chopped"
  "instructions": [string],            // one step per element, in the order the cook follows them — never one paragraph; 4-10 steps
  "prep_time_minutes": number | null,
  "cook_time_minutes": number | null,
  "servings": number | null,
  "calories": number | null,           // per serving, kcal
  "protein_g": number | null,          // per serving, grams
  "carb_g": number | null,             // per serving, grams
  "fat_g": number | null               // per serving, grams
}
Use metric and UK shop names (courgette, aubergine, mince, stock cube). Estimate the per-serving macros.`;
}

function stripFences(text) {
    return String(text ?? "")
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
}

const num = (v) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
    return Number.isFinite(n) ? n : null;
};
const int = (v) => {
    const n = num(v);
    return n == null ? null : Math.round(n);
};
const lines = (v) =>
    (Array.isArray(v) ? v : [])
        .map((x) => (typeof x === "string" ? x : x?.name || x?.text || ""))
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);

/** Model text → the stored recipe shape, or null when it isn't usable. */
function parseFullRecipe(text) {
    const raw = stripFences(text);
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        try {
            data = JSON.parse(jsonrepair(raw));
        } catch {
            return null;
        }
    }
    if (!data || typeof data !== "object") return null;
    const ingredients = lines(data.ingredients).slice(0, 40);
    const steps = lines(data.instructions).slice(0, 30);
    if (ingredients.length < 2 || steps.length < 2) return null;
    const calories = int(data.calories);
    return {
        description: typeof data.description === "string" && data.description.trim() ? data.description.trim().slice(0, 600) : null,
        ingredients,
        instructions: normaliseSteps(steps),
        prep_time_minutes: int(data.prep_time_minutes),
        cook_time_minutes: int(data.cook_time_minutes),
        servings: int(data.servings),
        // recipes.calories is INTEGER; a wild value would sink the whole insert.
        calories: calories != null && calories >= 0 && calories < 100_000 ? calories : null,
        protein_g: num(data.protein_g),
        carb_g: num(data.carb_g),
        fat_g: num(data.fat_g),
    };
}

module.exports = { fullRecipePrompt, parseFullRecipe };
