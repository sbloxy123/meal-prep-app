// Run with `npm test` (node --test).
//
// lib/suggestions/*: how an Inspiration request maps onto a shared pool row
// (key + diet signature) and how a serving is picked / a pool is grown.

const test = require("node:test");
const assert = require("node:assert/strict");

const { suggestKey, dietSignature, describeSignature, ANYTHING } = require("../lib/suggestions/normalise");
const { pick, merge, POOL_MAX, titleKey } = require("../lib/suggestions/pool");
const { parseFullRecipe, fullRecipePrompt } = require("../lib/suggestions/write");

test("suggestKey folds case, punctuation and whitespace; empty is 'anything'", () => {
    assert.equal(suggestKey("Quick dinners"), "quick dinners");
    assert.equal(suggestKey("  quick   DINNERS!! "), "quick dinners");
    assert.equal(suggestKey("Gluten-free"), "gluten-free");
    assert.equal(suggestKey("Crème brûlée ideas"), "creme brulee ideas");
    assert.equal(suggestKey(""), ANYTHING);
    assert.equal(suggestKey("   "), ANYTHING);
    assert.equal(suggestKey(undefined), ANYTHING);
    assert.equal(suggestKey("!!!"), ANYTHING);
    assert.equal(suggestKey("x".repeat(200)).length, 80);
});

test("dietSignature unions the household rule and every member, sorted; unknowns dropped", () => {
    assert.equal(dietSignature(null), "");
    assert.equal(dietSignature({ dietaryRule: null, memberPrefs: [] }), "");
    assert.equal(dietSignature({ dietaryRule: { diets: ["vegetarian"] }, memberPrefs: [] }), "vegetarian");
    assert.equal(
        dietSignature({ dietaryRule: { diets: ["vegan"] }, memberPrefs: [{ diets: ["gluten-free"] }, { diets: ["vegan", "keto"] }] }),
        "gluten-free,vegan",
    );
    assert.equal(describeSignature(""), "");
    assert.equal(describeSignature("vegan"), "vegan");
    assert.equal(describeSignature("gluten-free,vegan"), "gluten-free and vegan");
});

const idea = (title) => ({ title, tags: ["Dinner"], ingredients: ["a", "b"] });
const POOL = ["A", "B", "C", "D", "E", "F", "G", "H"].map(idea);

test("pick serves n distinct ideas, skipping titles the household has", () => {
    const out = pick(POOL, 6, ["a", "B "]);
    assert.equal(out.length, 6);
    assert.ok(!out.some((i) => i.title === "A" || i.title === "B"));
    assert.equal(new Set(out.map((i) => i.title)).size, 6);
});

test("pick falls back to excluded ideas rather than under-serving", () => {
    const out = pick(POOL, 6, POOL.map((i) => i.title));
    assert.equal(out.length, 6);
    assert.equal(pick(POOL.slice(0, 2), 6, []).length, 2);
    assert.deepEqual(pick([], 6, []), []);
});

test("merge dedupes by title (existing wins), appends fresh, caps at POOL_MAX dropping the oldest", () => {
    const merged = merge(POOL.slice(0, 3), [idea("c"), idea("Z"), idea("z!")]);
    assert.deepEqual(merged.map((i) => i.title), ["A", "B", "C", "Z"]);

    const many = Array.from({ length: POOL_MAX + 5 }, (_, i) => idea(`T${i}`));
    const capped = merge(many.slice(0, POOL_MAX), many.slice(POOL_MAX));
    assert.equal(capped.length, POOL_MAX);
    assert.equal(capped[0].title, "T5"); // the five oldest went
    assert.equal(capped[capped.length - 1].title, `T${POOL_MAX + 4}`);
});

test("titleKey is forgiving about punctuation and case", () => {
    assert.equal(titleKey("Mac & cheese!"), "mac cheese");
    assert.equal(titleKey("  Mac   Cheese "), "mac cheese");
});

test("parseFullRecipe: steps one per line, numbers coerced, wild calories dropped, thin output rejected", () => {
    const text = '```json\n' + JSON.stringify({
        description: "  A quick weeknight bake. ",
        ingredients: ["500g beef mince", { name: "1 onion, chopped" }, ""],
        instructions: ["Preheat the oven to 200C.", "Brown the mince.", "Bake for 25 minutes."],
        prep_time_minutes: "10", cook_time_minutes: 25.4, servings: 4,
        calories: 999999, protein_g: "32.5", carb_g: null, fat_g: 18,
    }) + "\n```";
    const r = parseFullRecipe(text);
    assert.equal(r.description, "A quick weeknight bake.");
    assert.deepEqual(r.ingredients, ["500g beef mince", "1 onion, chopped"]);
    assert.equal(r.instructions.split("\n").length, 3);
    assert.equal(r.prep_time_minutes, 10);
    assert.equal(r.cook_time_minutes, 25);
    assert.equal(r.calories, null);
    assert.equal(r.protein_g, 32.5);
    assert.equal(r.fat_g, 18);
    assert.equal(parseFullRecipe("not json"), null);
    assert.equal(parseFullRecipe(JSON.stringify({ ingredients: ["x"], instructions: ["y"] })), null);
});

test("fullRecipePrompt carries the diets and the idea's ingredients", () => {
    const p = fullRecipePrompt({ title: "Chickpea curry", ingredients: ["chickpeas", "spinach"], diets: "gluten-free,vegan" });
    assert.match(p, /MUST be gluten-free and vegan/);
    assert.match(p, /chickpeas, spinach/);
    assert.doesNotMatch(fullRecipePrompt({ title: "Toast", ingredients: [], diets: "" }), /MUST be/);
});
