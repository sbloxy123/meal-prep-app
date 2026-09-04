// The aisle cache end to end, against a real database with the seed loaded —
// run with  node -r dotenv/config --test test/organise.test.js
// (skips under a plain `npm test`). The model is stubbed: the first assertion
// is that a realistic list makes NO model call at all.

const test = require("node:test");
const assert = require("node:assert/strict");

const hasDb = Boolean(process.env.DATABASE_URL || process.env.DATABASE);
const pool = hasDb ? require("../db/pool") : null;
test.after(async () => {
    if (pool) await pool.end();
});

const REALISTIC = [
    "2 large free-range eggs, beaten", "400g chopped tomatoes", "250ml double cream", "1 onion, finely chopped",
    "3 garlic cloves, crushed", "500g beef mince", "a handful of fresh coriander", "1 tsp dried oregano",
    "200g smoked salmon", "300g frozen peas", "1 tbsp olive oil", "100g cheddar, grated", "2 chicken breasts, diced",
    "1 red pepper", "spaghetti", "2 tins of chickpeas", "kitchen roll", "milk x3", "greek yogurt", "1 lemon",
    "baby spinach", "soy sauce", "plain flour", "caster sugar", "a bunch of cilantro", "sea salt", "black pepper",
    "tortilla wraps", "basmati rice", "toilet roll",
];

test("a realistic 30-line list resolves entirely from the seed — zero model calls", { skip: !hasDb && "no database configured" }, async () => {
    const organise = require("../lib/ingredients/organise");
    {
        const rows = REALISTIC.map((t, i) => (i % 5 === 4 ? { custom_product: t, ingredient_name: null, recipe_count: "0" } : { ingredient_name: t, custom_product: null, recipe_count: "1" }));
        const { items, stats } = await organise.organiseList(rows, { ledger: null });
        assert.equal(stats.modelCalls, 0, `misses: ${stats.misses}`);
        assert.equal(stats.hits, REALISTIC.length);
        // "fresh coriander" and "cilantro" are the same ingredient → one row, quantity 2
        assert.equal(items.length, REALISTIC.length - 1);
        const by = Object.fromEntries(items.map((i) => [i.product, i]));
        assert.equal(by["400g chopped tomatoes"].aisle, "Tins & jars");
        assert.equal(by["a handful of fresh coriander"].aisle, "Fruit & veg");
        assert.equal(by["1 tsp dried oregano"].aisle, "Herbs & spices");
        assert.equal(by["300g frozen peas"].aisle, "Frozen");
        assert.equal(by["kitchen roll"].aisle, "Household");
        assert.equal(by["milk x3"].quantity, "3");
        assert.equal(by["milk x3"].is_custom_product, false);
        assert.equal(by["toilet roll"].is_custom_product, true);
        assert.equal(by["a handful of fresh coriander"].quantity, "2");
        assert.equal(by["a bunch of cilantro"], undefined);
        // walking order: fruit & veg before household
        assert.ok(items.findIndex((i) => i.product === "1 lemon") < items.findIndex((i) => i.product === "toilet roll"));
        // verbatim product names — the delete endpoint matches on this text
        assert.ok(items.every((i) => REALISTIC.includes(i.product)), "names untouched");
    }
});

test("a miss goes to the model once, is written back, and hits next time", { skip: !hasDb && "no database configured" }, async () => {
    const organise = require("../lib/ingredients/organise");
    const ai = require("../lib/ai");
    // letters only: a digits-only token would be stripped as a quantity
    const key = `zzq test berry ${Math.random().toString(36).slice(2, 8).replace(/\d/g, "x")}`;
    let calls = 0;
    const realRun = ai.runModel;
    // Stub the model: answer with a slug for our made-up key.
    ai.runModel = async (ledger, params) => {
        calls++;
        return { content: [{ type: "text", text: JSON.stringify({ [key]: "fruit-veg" }) }], usage: { input_tokens: 10, output_tokens: 5 }, model: params.model };
    };
    try {
        const rows = [{ ingredient_name: key, custom_product: null, recipe_count: "1" }];
        const first = await organise.organiseList(rows, { ledger: null });
        assert.equal(first.stats.modelCalls, 1);
        assert.equal(first.items[0].aisle, "Fruit & veg");
        const { rows: cached } = await pool.query("SELECT source, confidence, usage_count FROM ingredient_aisles WHERE key = $1", [key]);
        assert.equal(cached[0].source, "model");
        assert.equal(Number(cached[0].confidence), 0.5);
        const second = await organise.organiseList(rows, { ledger: null });
        assert.equal(second.stats.modelCalls, 0);
        assert.equal(calls, 1);
        // an unplaceable miss is logged
        ai.runModel = async () => ({ content: [{ type: "text", text: "{}" }], usage: {}, model: "x" });
        const miss = `zzq unplaceable ${Math.random().toString(36).slice(2, 8).replace(/\d/g, "x")}`;
        const third = await organise.organiseList([{ custom_product: miss, ingredient_name: null, recipe_count: "0" }], { ledger: null });
        assert.equal(third.items[0].aisle, "Other");
        const { rows: logged } = await pool.query("SELECT hit_count FROM ingredient_aisle_misses WHERE key = $1", [miss]);
        assert.equal(logged.length, 1);
        await pool.query("DELETE FROM ingredient_aisle_misses WHERE key = $1", [miss]);
    } finally {
        ai.runModel = realRun;
        await pool.query("DELETE FROM ingredient_aisles WHERE key = $1", [key]);
    }
});
