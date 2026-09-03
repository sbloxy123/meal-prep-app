// Method steps.
//
// `recipes.instructions` is a single TEXT column holding one step per line.
// The AI paths (import, generate, improve, photo, My usuals) are asked for an
// array of steps, but a model will sometimes hand back one prose paragraph
// instead — which then renders as a wall of text on the recipe page. Everything
// written to that column goes through normaliseSteps, so prose is turned into
// steps on the way in rather than being stored and shown as it came.
//
// The frontend has a twin of splitSentences in the display fallback
// (recipe-inventory-frontend `src/lib/instructions.ts`), which repairs the
// recipes written before this existed. Keep the two regexes and the
// abbreviation list byte-for-byte identical.

const LEADING_MARKER = /^\s*(?:\d+[.)]|[-•*])\s+/;

// "…until it shimmers. 2. Add the onion." breaks after "shimmers." and again
// after the "2.", leaving the marker stranded as a piece of its own. It holds
// no content, so drop it.
const MARKER_ONLY = /^(?:\d+[.)]|[-•*])$/;

// Under this length a single line is treated as a genuine one-liner and left
// alone, even when it holds two sentences ("Mix everything. Bake for 20 mins.").
const MIN_PROSE_LENGTH = 120;

// Abbreviations whose trailing full stop is not the end of a sentence. Their
// dot is swapped for a placeholder before the split and restored afterwards.
// Units of time are deliberately absent: "Bake for 20 mins. Rest before
// slicing." is a real sentence break, and protecting it would lose the step.
const ABBREVIATIONS = /\b(?:tbsp|tsp|oz|lbs?|fl|approx|e\.g|i\.e)\./gi;
const DOT = "\u0000";

// A sentence ends at . ! or ? followed by whitespace and then the start of
// something new. Requiring the whitespace keeps decimals (1.5, gas mark 4.5)
// intact; requiring an upper-case letter, digit or opening quote after it
// avoids splitting on a stray lower-case continuation.
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9"“(])/;

function splitSentences(text) {
    return text
        .replace(ABBREVIATIONS, (match) => match.slice(0, -1) + DOT)
        .split(SENTENCE_BOUNDARY)
        .map((piece) => piece.split(DOT).join(".").replace(LEADING_MARKER, "").trim())
        .filter((piece) => piece.length > 0 && !MARKER_ONLY.test(piece));
}

// Anything a model might give us for "instructions" → one step per line.
// Accepts an array of strings, an array of schema.org-ish {text}/{name}
// objects, a newline-separated string, or a single paragraph of prose.
function normaliseSteps(value) {
    if (!value) return "";

    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object") return item.text || item.name || "";
                return "";
            })
            .map((step) => String(step).replace(LEADING_MARKER, "").trim())
            .filter((step) => step.length > 0)
            .join("\n");
    }

    if (typeof value !== "string") return "";

    const lines = value
        .split(/\r?\n/)
        .map((line) => line.replace(LEADING_MARKER, "").trim())
        .filter((line) => line.length > 0);

    // Nothing to repair: no method at all, or the model gave us real steps.
    if (lines.length !== 1) return lines.join("\n");

    const only = lines[0];
    if (only.length < MIN_PROSE_LENGTH) return only;
    const sentences = splitSentences(only);
    return sentences.length >= 2 ? sentences.join("\n") : only;
}

module.exports = { normaliseSteps, splitSentences };
