// How an Inspiration request maps onto a pool row (migration 022).
//
// suggestKey(hint): what the person typed, folded so "Quick dinners!",
// "quick  dinners" and "Quick Dinners" share one pool. An empty hint is the
// "anything" pool. Pure; tested in test/suggestions.test.js.
//
// dietSignature(context): the household's diets as a sorted, comma-joined
// string — from db.getSuggestContext(): the kitchen-wide rule plus every
// member's own answers, because ideas feed the whole kitchen, not just
// whoever tapped. '' means no restriction. This is part of the pool key, so a
// vegetarian household never draws from the beef pool, and part of the prompt
// on a miss.

const { DIETS } = require("../dietary");

const ANYTHING = "anything";
const MAX_KEY_LEN = 80;

function suggestKey(hint) {
    if (typeof hint !== "string") return ANYTHING;
    const key = hint
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // accents
        .replace(/[^a-z0-9\s-]/g, " ") // punctuation → space (keeps "gluten-free")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_KEY_LEN)
        .trim();
    return key || ANYTHING;
}

function dietSignature(context) {
    const found = new Set();
    const add = (list) => {
        for (const d of Array.isArray(list) ? list : []) if (DIETS.includes(d)) found.add(d);
    };
    add(context?.dietaryRule?.diets);
    for (const p of context?.memberPrefs ?? []) add(p?.diets);
    return [...found].sort().join(",");
}

/** "vegetarian and gluten-free" for prompts; '' when unrestricted. */
function describeSignature(signature) {
    const list = (signature || "").split(",").filter(Boolean);
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

module.exports = { ANYTHING, suggestKey, dietSignature, describeSignature };
