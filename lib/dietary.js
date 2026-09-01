// Food-preference vocabulary — the single source of truth on the backend.
// The frontend keeps a byte-identical copy of these values (starter-recipes
// filtering + the onboarding wizard); change them in lockstep.

const PROTEINS = ["chicken", "beef", "pork", "lamb", "fish"];
const DIETS = ["vegetarian", "vegan", "pescatarian", "dairy-free", "gluten-free"];
const SCOPES = ["me", "everyone"];

/** "vegan", "vegan and gluten-free", "vegetarian, dairy-free and gluten-free" —
    prose for prompts and UI hand-offs. */
function describeDiets(diets) {
    const list = (diets ?? []).filter((d) => DIETS.includes(d));
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Validate + normalise a preferences body. Returns { proteins, diets, scope }
    or null when there's nothing usable. Hand-rolled (no Zod) to match the
    household controller's style: whitelist-filtered, de-duplicated, capped. */
function parsePrefs(body) {
    if (!body || typeof body !== "object") return null;
    // An explicitly empty proteins array is meaningful ("we don't eat much
    // meat"), so "no usable answer" means neither array was sent at all.
    if (!Array.isArray(body.proteins) && !Array.isArray(body.diets)) return null;
    const pick = (value, allowed) =>
        Array.isArray(value)
            ? [...new Set(value.filter((v) => allowed.includes(v)))].slice(0, allowed.length)
            : [];
    const scope = SCOPES.includes(body.scope) ? body.scope : "me";
    return { v: 1, proteins: pick(body.proteins, PROTEINS), diets: pick(body.diets, DIETS), scope };
}

module.exports = { PROTEINS, DIETS, describeDiets, parsePrefs };
