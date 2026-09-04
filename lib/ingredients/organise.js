// "Generate list by aisle" without (mostly) asking a model.
//
//   const { items, stats } = await organiseList(rows, { ledger });
//
// rows are shopping_list rows (ingredient_name | custom_product, recipe_count).
// Each line is normalised to a lookup key (normalise.js), resolved against the
// global ingredient_aisles cache with the backoff chain, and only the misses —
// deduplicated — go to the model in ONE call that may answer only with a slug
// from lib/ingredients/aisles.js. Model answers are written back (source
// 'model', confidence 0.5) so the next household gets them free, and anything
// nobody could place is logged to ingredient_aisle_misses for the seed to grow
// from. The rows come back in walking order with product_name kept VERBATIM:
// the delete endpoint matches the draft row on that text, so the model must
// never rewrite it (it used to).

const { jsonrepair } = require("jsonrepair");
const db = require("../../db/queries");
// Referenced through the module (not destructured) so tests can stub the model.
const ai = require("../ai");
const { normaliseIngredient, splitCompoundLine, AMBIGUOUS_HEADS } = require("./normalise");
const { OTHER, WALK_ORDER, isSlug, labelFor, orderIndex } = require("./aisles");

const AI_MODEL = "claude-haiku-4-5-20251001";
const REGION = "UK";

// "milk x3", "3 x milk", "milk (x2)" → the number; anything else → "1".
function quantityFrom(raw) {
    const s = String(raw ?? "");
    const tail = /(?:^|[\s(])x\s*(\d{1,3})\)?\s*$/i.exec(s);
    if (tail) return tail[1];
    const head = /^(\d{1,3})\s*x\s+/i.exec(s);
    if (head) return head[1];
    return "1";
}

function lineText(row) {
    return String(row.ingredient_name ?? row.custom_product ?? "").trim();
}

function titleCase(s) {
    return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

// Resolve one parsed line against the cache map with the backoff chain,
// refusing to guess from a bare ambiguous head ("pepper").
function hitFor(parsed, found) {
    for (let i = 0; i < parsed.candidates.length; i++) {
        const key = parsed.candidates[i];
        const aisle = found.get(key);
        if (aisle) {
            if (i > 0 && AMBIGUOUS_HEADS.has(key)) return null;
            return { key, aisle, exact: i === 0 };
        }
    }
    return null;
}

// One batched call: miss keys → slugs. Returns Map<key, slug>. Anything the
// model can't place or answers outside the taxonomy is left out.
async function askModel(missKeys, ledger) {
    const message = await ai.runModel(
        ledger,
        {
            model: AI_MODEL,
            max_tokens: Math.min(4096, Math.max(256, 40 * missKeys.length)),
            messages: [
                {
                    role: "user",
                    content: `You sort grocery items into UK supermarket aisles.
Aisles (use these exact ids and nothing else): ${WALK_ORDER.join(", ")}.
For each item below, answer with the single best aisle id. If an item is not a grocery item or you genuinely can't place it, answer "unknown".
Return ONLY a raw JSON object mapping each item, verbatim, to its aisle id — no markdown, no commentary.
Items:
${missKeys.map((k) => `- ${k}`).join("\n")}`,
                },
            ],
        },
        { timeout: 30_000 },
    );
    let data;
    const raw = ai.textOf(message);
    try {
        data = JSON.parse(raw);
    } catch {
        data = JSON.parse(jsonrepair(raw));
    }
    const out = new Map();
    if (data && typeof data === "object") {
        for (const [k, v] of Object.entries(data)) {
            const key = String(k).trim().toLowerCase();
            if (missKeys.includes(key) && isSlug(v)) out.set(key, v);
        }
    }
    return out;
}

async function organiseList(rows, { ledger = null } = {}) {
    const lines = rows.map((row, index) => {
        const raw = lineText(row);
        const parts = splitCompoundLine(raw);
        // Placement follows the first ingredient named; the row itself is
        // never split (the delete endpoint keys on the verbatim text).
        const parsed = normaliseIngredient(parts[0] ?? raw);
        return { index, row, raw, parsed, slug: null, matchKey: null };
    });

    const allKeys = [...new Set(lines.flatMap((l) => l.parsed.candidates))];
    const found = await db.lookupAisles(allKeys, REGION);

    const hitKeys = [];
    const misses = [];
    for (const line of lines) {
        if (!line.parsed.key) {
            misses.push(line);
            continue;
        }
        const hit = hitFor(line.parsed, found);
        if (hit) {
            line.slug = hit.aisle;
            line.matchKey = hit.key;
            hitKeys.push(hit.key);
        } else {
            misses.push(line);
        }
    }

    let modelCalls = 0;
    const askable = misses.filter((l) => l.parsed.key);
    const missKeys = [...new Set(askable.map((l) => l.parsed.key))];
    let answers = new Map();
    if (missKeys.length) {
        modelCalls = 1;
        try {
            answers = await askModel(missKeys, ledger);
        } catch (error) {
            // The list still generates — unplaced items land in Other.
            console.error("[organise] model call failed:", error.message);
        }
    }

    const writeBack = [];
    const unresolved = [];
    for (const line of askable) {
        const slug = answers.get(line.parsed.key);
        if (slug) {
            line.slug = slug;
            line.matchKey = line.parsed.key;
            if (!writeBack.some((w) => w.key === line.parsed.key)) {
                writeBack.push({ key: line.parsed.key, label: titleCase(line.parsed.key), aisle: slug });
            }
        } else {
            unresolved.push({ key: line.parsed.key, raw: line.raw.slice(0, 120) });
        }
    }

    await Promise.all([
        db.bumpAisleUsage([...new Set(hitKeys)], REGION),
        db.upsertModelAisles(writeBack, REGION),
        db.recordAisleMisses(dedupeBy(unresolved, (u) => u.key), REGION),
    ]);

    // Merge duplicates of the same resolved ingredient (a recipe line and a
    // hand-typed one): keep the recipe-derived name, sum the counts.
    const merged = new Map();
    for (const line of lines) {
        const isCustom = line.row.custom_product != null && line.row.ingredient_name == null;
        const groupKey = line.matchKey ? `k:${line.matchKey}` : `raw:${line.raw.toLowerCase()}`;
        const qty = Number(quantityFrom(line.raw)) || 1;
        const count = Number(line.row.recipe_count) || 0;
        const existing = merged.get(groupKey);
        if (existing) {
            existing.quantity += qty;
            existing.recipeCount += count;
            if (existing.isCustom && !isCustom) {
                existing.product = line.raw;
                existing.isCustom = false;
            }
            continue;
        }
        merged.set(groupKey, {
            product: line.raw,
            slug: line.slug,
            quantity: qty,
            recipeCount: count,
            isCustom,
            order: line.index,
        });
    }

    const items = [...merged.values()]
        .sort((a, b) => orderIndex(a.slug ?? "zz") - orderIndex(b.slug ?? "zz") || a.order - b.order)
        .map((m) => ({
            product: m.product,
            aisle: m.slug ? labelFor(m.slug) : OTHER,
            recipe_count: String(m.recipeCount),
            is_custom_product: m.isCustom,
            quantity: String(m.quantity),
        }));

    return {
        items,
        stats: {
            lines: lines.length,
            hits: hitKeys.length,
            misses: missKeys.length,
            resolvedByModel: writeBack.length,
            unresolved: unresolved.length,
            modelCalls,
        },
    };
}

function dedupeBy(arr, keyFn) {
    const seen = new Set();
    return arr.filter((x) => {
        const k = keyFn(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

module.exports = { organiseList, quantityFrom, askModel, AI_MODEL };
