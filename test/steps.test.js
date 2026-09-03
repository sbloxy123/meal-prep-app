// Run with `npm test` (node --test).
//
// normaliseSteps guards the instructions column: everything the AI writes goes
// through it. The cases below are the contract — turn prose into steps, never
// mangle a method that already has them. It is the twin of the frontend's
// display fallback in recipe-inventory-frontend `src/lib/instructions.ts`.

const test = require("node:test");
const assert = require("node:assert/strict");

const { normaliseSteps, splitSentences } = require("../lib/steps");

test("nothing in, nothing out", () => {
    assert.equal(normaliseSteps(null), "");
    assert.equal(normaliseSteps(undefined), "");
    assert.equal(normaliseSteps(""), "");
    assert.equal(normaliseSteps("   \n  "), "");
    assert.equal(normaliseSteps(42), "");
});

test("an array of steps becomes one step per line", () => {
    assert.equal(
        normaliseSteps(["Heat the oil", "Add the onion", "Serve"]),
        "Heat the oil\nAdd the onion\nServe",
    );
});

test("an array of schema.org step objects is flattened", () => {
    assert.equal(
        normaliseSteps([{ text: "Heat the oil" }, { name: "Add the onion" }, {}]),
        "Heat the oil\nAdd the onion",
    );
});

test("numbering inside array elements is stripped", () => {
    assert.equal(
        normaliseSteps(["1. Heat the oil", "2. Add the onion"]),
        "Heat the oil\nAdd the onion",
    );
});

test("a prose paragraph is split into steps", () => {
    const prose =
        "Preheat the oven to 200C fan. Toss the potatoes with olive oil, salt and " +
        "pepper in a roasting tin. Roast for 35 minutes, turning them once halfway " +
        "through. Serve with a squeeze of lemon.";
    assert.equal(
        normaliseSteps(prose),
        [
            "Preheat the oven to 200C fan.",
            "Toss the potatoes with olive oil, salt and pepper in a roasting tin.",
            "Roast for 35 minutes, turning them once halfway through.",
            "Serve with a squeeze of lemon.",
        ].join("\n"),
    );
});

test("decimals and unit abbreviations are not sentence ends", () => {
    const prose =
        "Heat 1.5 tbsp. oil in a large pan over a medium heat until it shimmers. " +
        "Add the onion with 0.5 tsp. salt and cook gently for 8 minutes.";
    assert.equal(normaliseSteps(prose).split("\n").length, 2);
});

test("a sentence ending in a time abbreviation still breaks", () => {
    const prose =
        "Brown the mince well in a heavy pan, breaking up any lumps as you go. " +
        "Add the tomatoes and simmer for 40 mins. Season and serve with pasta.";
    assert.equal(normaliseSteps(prose).split("\n").length, 3);
});

test("an existing stepped method is passed through untouched", () => {
    const stepped = "Heat the oil\nAdd the onion\nServe";
    assert.equal(normaliseSteps(stepped), stepped);
});

test("a genuine one-liner is left as one step", () => {
    assert.equal(
        normaliseSteps("Toss everything in a bowl and serve."),
        "Toss everything in a bowl and serve.",
    );
});

test("a short two-sentence note is left alone", () => {
    const short = "Mix everything together. Bake for 20 minutes.";
    assert.equal(normaliseSteps(short), short);
});

test("one long sentence with no boundary stays one step", () => {
    const long =
        "Simmer the stock with the bay leaves, thyme, peppercorns and a halved " +
        "onion over the lowest possible heat for a good three hours, skimming " +
        "occasionally, until it tastes of something worth eating";
    assert.equal(normaliseSteps(long), long);
});

test("an inline numbered list has its markers stripped", () => {
    const inline =
        "1. Heat the oil in a heavy pan until it shimmers. 2. Add the diced onion " +
        "and soften for ten minutes. 3. Stir in the garlic and cook for a minute more.";
    assert.equal(
        normaliseSteps(inline),
        [
            "Heat the oil in a heavy pan until it shimmers.",
            "Add the diced onion and soften for ten minutes.",
            "Stir in the garlic and cook for a minute more.",
        ].join("\n"),
    );
});

test("splitSentences does not split on semicolons or colons", () => {
    const text =
        "Make the dressing: whisk the oil, vinegar and mustard together; season it " +
        "well and set it aside while you cook.";
    assert.deepEqual(splitSentences(text), [text]);
});
