const cheerio = require("cheerio");
const { jsonrepair } = require("jsonrepair");

const db = require("../db/queries");
const { assertSafeUrl } = require("../lib/urlGuard");
const { uploadFromUrl } = require("../lib/cloudinary");
const { startAiAction } = require("../lib/aiAllowance");
const { runModel, textOf } = require("../lib/ai");
const { normaliseSteps } = require("../lib/steps");
const {
    importUrlSchema,
    estimateMacrosSchema,
    improveRecipeSchema,
    importSocialSchema,
    parsePhotoSchema,
} = require("../schemas/recipe.schema.js");

// Every model call goes through lib/ai.js runModel(ledger, params) so tokens,
// cost and latency land on the action's ai_usage row. Same model as
// shoppingListController.
const AI_MODEL = "claude-haiku-4-5-20251001";
// Photo → recipe reads a cookbook page with vision. Haiku handles clean pages
// cheaply; when it's unsure or its output fails validation we escalate the same
// image(s) once to Sonnet, which reads dense/awkward pages more reliably.
const VISION_ESCALATION_MODEL = "claude-sonnet-4-6";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 3;
const IMPORT_LIMIT = 20;
const GENERATE_LIMIT = 15;
const PHOTO_LIMIT = 15;
// Up to four page photos through a vision model; Sonnet on a dense page can
// take a while. Well under the SDK default (10 minutes) all the same.
const PHOTO_CALL_TIMEOUT_MS = 90_000;
const IMPROVE_LIMIT = 15;
const SOCIAL_LIMIT = 20;
const SUGGEST_LIMIT = 15;
// "What do you cook most?" — the onboarding step where someone types their own
// go-to meals and we write them up. Deliberately NOT metered against the weekly
// AI pool (see generateUsuals), so it carries its own fair-use bound instead.
const USUALS_MAX_DISHES = 10;
const USUALS_MAX_TITLE_LEN = 80;
// The first concurrent Anthropic work in this codebase. Four keeps us well
// inside org rate limits while doing ten dishes in three waves (~12-18s).
const USUALS_CONCURRENCY = 4;
const USUALS_CALL_TIMEOUT_MS = 25_000;
// Past this, remaining dishes skip the AI and land as title-only recipes rather
// than turning one request into a minute-plus wait.
const USUALS_TOTAL_BUDGET_MS = 45_000;
const USUALS_RUNS_PER_DAY = 3;
const USUALS_TAG = "My usuals";
// How many ideas we ask for per "Give me inspiration" call.
const SUGGEST_COUNT = 6;
// Keep the free-text steer short — it's a nudge, not a document.
const MAX_HINT_LEN = 200;
// A fetched caption shorter than this is treated as "blocked/too sparse" (a login
// wall or a bare title) → we ask the user to paste the caption instead.
const MIN_CAPTION_LEN = 40;
// Instagram scraping (Apify) is slow; allow a generous window before we give up
// and fall back to the paste prompt. Slightly above the Apify run timeout (60s).
const IG_SCRAPE_TIMEOUT_MS = 65_000;
// Defense-in-depth cap on decoded image bytes (base64 ~4/3 the raw size); the
// route body parser (app.js) caps the payload itself.
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB
const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------- small parsing helpers ----------

// ISO-8601 duration (PT15M, PT1H30M, P0DT0H45M) → whole minutes, or null.
function isoDurationToMinutes(value) {
    if (typeof value !== "string") return null;
    const match = value.match(
        /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/,
    );
    if (!match) return null;
    const [, d, h, m, s] = match.map((x) => (x ? Number(x) : 0));
    const total = d * 1440 + h * 60 + m + Math.round(s / 60);
    return total > 0 ? total : null;
}

// "240 calories" / "18 g" / "18.5g" / 18 → 18 (number) or null.
function parseNumeric(value) {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const match = String(value).match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
}

function firstInt(value) {
    const n = parseNumeric(Array.isArray(value) ? value[0] : value);
    return n == null ? null : Math.round(n);
}

// image may be a string, { url }, an array of either, or an ImageObject.
function extractImageUrl(image) {
    if (!image) return null;
    if (typeof image === "string") return image;
    if (Array.isArray(image)) {
        for (const item of image) {
            const url = extractImageUrl(item);
            if (url) return url;
        }
        return null;
    }
    if (typeof image === "object") return image.url || null;
    return null;
}

// recipeInstructions: plain string | array of strings/HowToStep | HowToSection
// (with nested itemListElement). Flatten to an array of step strings.
function flattenInstructions(instructions) {
    if (!instructions) return [];
    if (typeof instructions === "string") {
        return instructions
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (!Array.isArray(instructions)) instructions = [instructions];

    const steps = [];
    for (const item of instructions) {
        if (typeof item === "string") {
            const t = item.trim();
            if (t) steps.push(t);
        } else if (item && typeof item === "object") {
            const type = normaliseType(item["@type"]);
            if (type.includes("HowToSection") && item.itemListElement) {
                steps.push(...flattenInstructions(item.itemListElement));
            } else if (item.text) {
                const t = String(item.text).trim();
                if (t) steps.push(t);
            } else if (item.name) {
                const t = String(item.name).trim();
                if (t) steps.push(t);
            }
        }
    }
    return steps;
}

// @type may be a string or an array of strings — normalise to a string[].
function normaliseType(type) {
    if (!type) return [];
    return (Array.isArray(type) ? type : [type]).map(String);
}

// Map schema.org NutritionInformation → our macro fields (per serving).
function mapNutrition(nutrition) {
    if (!nutrition || typeof nutrition !== "object") {
        return { calories: null, protein_g: null, carb_g: null, fat_g: null, found: false };
    }
    const calories = firstInt(nutrition.calories);
    const protein_g = parseNumeric(nutrition.proteinContent);
    const carb_g = parseNumeric(nutrition.carbohydrateContent);
    const fat_g = parseNumeric(nutrition.fatContent);
    const found =
        calories != null || protein_g != null || carb_g != null || fat_g != null;
    return { calories, protein_g, carb_g, fat_g, found };
}

function mapIngredients(recipeIngredient) {
    if (!Array.isArray(recipeIngredient)) return [];
    return recipeIngredient
        .map((raw) => (typeof raw === "string" ? raw : raw?.name || ""))
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((name) => ({ name, quantity: "", unit: "" }));
}

// Build the draft response shape from a set of already-extracted fields.
function buildDraft(fields, sourceUrl) {
    const nutrition = mapNutrition(fields.nutrition);
    const servings = firstInt(fields.recipeYield);
    // Provenance is "imported" only when we actually scraped nutrition macros;
    // servings alone (recipeYield) is not nutrition data.
    const hasMacros = nutrition.found;

    return {
        title: fields.title || null,
        description: fields.description || null,
        instructions: fields.instructions || "",
        link_url: sourceUrl,
        prep_time_minutes: isoDurationToMinutes(fields.prepTime),
        cook_time_minutes: isoDurationToMinutes(fields.cookTime),
        ingredients: fields.ingredients || [],
        collections: ["Imported"],
        image_url: null,
        image_public_id: null,
        _imageUrl: fields.imageUrl || null, // internal, stripped before responding
        servings,
        calories: nutrition.calories,
        protein_g: nutrition.protein_g,
        carb_g: nutrition.carb_g,
        fat_g: nutrition.fat_g,
        macros_source: hasMacros ? "imported" : null,
    };
}

// ---------- tier 1: JSON-LD ----------

function findRecipeNode(node, seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findRecipeNode(item, seen);
            if (found) return found;
        }
        return null;
    }
    if (normaliseType(node["@type"]).includes("Recipe")) return node;
    if (Array.isArray(node["@graph"])) {
        const found = findRecipeNode(node["@graph"], seen);
        if (found) return found;
    }
    return null;
}

function extractFromJsonLd($) {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
        const raw = $(scripts[i]).contents().text();
        if (!raw || !raw.trim()) continue;
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            try {
                data = JSON.parse(jsonrepair(raw));
            } catch {
                continue;
            }
        }
        const recipe = findRecipeNode(data);
        if (recipe) {
            return {
                title: recipe.name,
                description: recipe.description,
                imageUrl: extractImageUrl(recipe.image),
                ingredients: mapIngredients(recipe.recipeIngredient),
                instructions: normaliseSteps(flattenInstructions(recipe.recipeInstructions).join("\n")),
                prepTime: recipe.prepTime,
                cookTime: recipe.cookTime,
                nutrition: recipe.nutrition,
                recipeYield: recipe.recipeYield,
            };
        }
    }
    return null;
}

// ---------- tier 2: microdata ----------

function extractFromMicrodata($) {
    const scope = $('[itemtype*="Recipe"]').first();
    if (scope.length === 0) return null;

    const prop = (name) =>
        scope.find(`[itemprop="${name}"]`).map((_, el) => {
            const $el = $(el);
            return ($el.attr("content") || $el.attr("datetime") || $el.text() || "").trim();
        }).get().filter(Boolean);

    const first = (name) => prop(name)[0] || undefined;

    const imageEl = scope.find('[itemprop="image"]').first();
    const imageUrl =
        imageEl.attr("src") || imageEl.attr("content") || imageEl.attr("href") || null;

    const nutritionScope = scope.find('[itemprop="nutrition"]').first();
    const nutrition = nutritionScope.length
        ? {
              calories: nutritionScope.find('[itemprop="calories"]').first().text().trim(),
              proteinContent: nutritionScope.find('[itemprop="proteinContent"]').first().text().trim(),
              carbohydrateContent: nutritionScope.find('[itemprop="carbohydrateContent"]').first().text().trim(),
              fatContent: nutritionScope.find('[itemprop="fatContent"]').first().text().trim(),
          }
        : null;

    const ingredients = mapIngredients([
        ...prop("recipeIngredient"),
        ...prop("ingredients"),
    ]);
    const instructions = normaliseSteps(prop("recipeInstructions").join("\n"));
    const title = first("name");

    if (!title && ingredients.length === 0 && !instructions) return null;

    return {
        title,
        description: first("description"),
        imageUrl,
        ingredients,
        instructions,
        prepTime: first("prepTime"),
        cookTime: first("cookTime"),
        nutrition,
        recipeYield: first("recipeYield"),
    };
}

// ---------- tier 3: AI fallback ----------

function pageToText($) {
    $("script, style, noscript, nav, header, footer, svg, iframe").remove();
    return $("body").text().replace(/\s+/g, " ").trim().slice(0, 12_000);
}

function stripFences(text) {
    return text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
}

// AI extraction from a plain block of text — the readable text of a web page, or
// a social-media post caption/description. Returns the same `fields` shape the
// scrapers produce (so buildDraft can consume it), or null if it isn't a recipe.
async function extractRecipeFromText(text, ledger = null) {
    if (!text || !text.trim()) return null;

    const message = await runModel(ledger, {
        model: AI_MODEL,
        max_tokens: 2048,
        messages: [
            {
                role: "user",
                content: `You extract structured recipe data from a block of text — the readable text of a web page, or a social-media post caption (Instagram / TikTok / YouTube), which may include emoji, hashtags and chit-chat around the recipe.
Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "title": string,
  "description": string | null,
  "instructions": [string],            // one step per element, in order — never one paragraph
  "prep_time_minutes": number | null,
  "cook_time_minutes": number | null,
  "ingredients": [ { "name": string, "quantity": "", "unit": "" } ],
  "servings": number | null,
  "calories": number | null,           // per serving, kcal
  "protein_g": number | null,          // per serving, grams
  "carb_g": number | null,             // per serving, grams
  "fat_g": number | null               // per serving, grams
}
Each ingredient "name" is the full line (e.g. "500g beef mince"); leave quantity and unit as empty strings. Ignore hashtags, @mentions, follow/like requests and other non-recipe chatter.
If the text is not a recipe, return {"title": null}.
Source text:
${text}`,
            },
        ],
    });

    const raw = stripFences(message.content[0].text);
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
    if (!data || !data.title) return null;

    const nutrition = {
        calories: data.calories,
        proteinContent: data.protein_g,
        carbohydrateContent: data.carb_g,
        fatContent: data.fat_g,
    };
    return {
        title: data.title,
        description: data.description,
        imageUrl: null,
        ingredients: mapIngredients(
            Array.isArray(data.ingredients)
                ? data.ingredients.map((i) => (typeof i === "string" ? i : i?.name))
                : [],
        ),
        instructions: normaliseSteps(data.instructions),
        prepTime: data.prep_time_minutes ? `PT${data.prep_time_minutes}M` : null,
        cookTime: data.cook_time_minutes ? `PT${data.cook_time_minutes}M` : null,
        nutrition,
        recipeYield: data.servings,
    };
}

// Tier-3 web-page fallback: run the text extractor over the page's visible text.
async function extractWithAI($, ledger) {
    return extractRecipeFromText(pageToText($), ledger);
}

// ---------- fetching (SSRF-guarded, timeout, size cap, redirects) ----------

async function fetchPage(rawUrl) {
    let url = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertSafeUrl(url); // re-validate every hop

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, {
                headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
                redirect: "manual",
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location) throw new Error("Could not fetch that page");
            url = new URL(location, url).toString();
            continue;
        }
        if (!response.ok) throw new Error("Could not fetch that page");

        const declared = Number(response.headers.get("content-length"));
        if (declared && declared > MAX_BODY_BYTES) {
            throw new Error("That page is too large to import");
        }
        return await readCapped(response);
    }
    throw new Error("Too many redirects");
}

async function readCapped(response) {
    if (!response.body) return await response.text();
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BODY_BYTES) {
            reader.cancel();
            throw new Error("That page is too large to import");
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
}

// ---------- controllers ----------

async function importRecipe(req, res, next) {
    let ledger = null;
    try {
        const parsed = importUrlSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "A valid URL is required" });
        }
        const { url } = parsed.data;

        // Validate scheme/host up front so a bad/blocked URL is a clean 400
        // before we spend a rate-limit slot.
        try {
            await assertSafeUrl(url);
        } catch (guardError) {
            return res.status(400).json({ error: guardError.message });
        }

        ledger = await startAiAction(req, res, {
            action: "import",
            credits: 1,
            burstLimit: IMPORT_LIMIT,
            burstMessage: "Import limit reached — 20 per 6 hours. Try again later.",
        });
        if (!ledger) return;

        let html;
        try {
            html = await fetchPage(url);
        } catch (fetchError) {
            // Nothing reached the model: not a charge.
            await ledger.settle("failed", { error: fetchError, errorCode: "fetch_failed" });
            return res.status(400).json({ error: fetchError.message });
        }

        const $ = cheerio.load(html);
        const fromJsonLd = extractFromJsonLd($);
        let fields = fromJsonLd || extractFromMicrodata($);
        const source = fromJsonLd ? "jsonld" : fields ? "microdata" : "ai";
        if (!fields) {
            try {
                fields = await extractWithAI($, ledger);
            } catch (aiError) {
                console.error("[import] AI fallback failed:", aiError.message);
            }
        }

        if (!fields || (!fields.title && (fields.ingredients || []).length === 0)) {
            // The model answered (or the scrape found nothing) but there is no
            // recipe to give back — refunded, never charged.
            await ledger.settle(ledger.calls.length ? "refund" : "failed", {
                outcome: "no_recipe",
                meta: { source },
            });
            return res.status(400).json({
                error: "No recipe could be extracted from that URL.",
            });
        }

        const draft = buildDraft(fields, url);

        // Upload the scraped image to Cloudinary so we never return a raw
        // third-party URL (null if Cloudinary isn't configured or upload fails).
        if (draft._imageUrl) {
            const uploaded = await uploadFromUrl(draft._imageUrl);
            if (uploaded) {
                draft.image_url = uploaded.image_url;
                draft.image_public_id = uploaded.image_public_id;
            }
        }
        delete draft._imageUrl;

        await ledger.settle("ok", { meta: { source } });
        res.json(draft);
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

async function estimateMacros(req, res, next) {
    let ledger = null;
    try {
        const parsed = estimateMacrosSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "title and ingredients are required" });
        }
        const { title, servings, ingredients } = parsed.data;

        ledger = await startAiAction(req, res, {
            action: "estimate",
            credits: 1,
            burstLimit: IMPORT_LIMIT,
            burstMessage: "Estimate limit reached — 20 per 6 hours. Try again later.",
        });
        if (!ledger) return;

        const knownServings = servings && servings > 0 ? servings : null;
        const ingredientLines = ingredients
            .map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" ").trim())
            .filter(Boolean)
            .join("\n");

        // When the caller doesn't know the serving count, have the model infer a
        // sensible one from the ingredient amounts rather than guessing blindly,
        // and return it so the UI can show what the per-serving numbers assume.
        const servingsInstruction = knownServings
            ? `This recipe makes ${knownServings} servings. Use exactly that serving count.`
            : `The number of servings isn't given. Estimate a typical serving count for this dish yourself from the ingredient amounts (default to 4 if truly unclear), then give macros per single serving.`;

        const message = await runModel(ledger, {
            model: AI_MODEL,
            max_tokens: 512,
            messages: [
                {
                    role: "user",
                    content: `You are a nutrition estimator. Estimate the nutrition for this recipe.
Recipe title: ${title || "(untitled)"}
${servingsInstruction}
Ingredients:
${ingredientLines}

Estimate the macros PER SERVING. If you reason about whole-recipe totals, divide by the serving count before answering.
Return ONLY valid raw JSON (no markdown, no code fences) in exactly this shape:
{ "servings": number, "calories": number, "protein_g": number, "carb_g": number, "fat_g": number }
"servings" is the serving count the macros are based on (echo the given count, or your inferred one). All macro values are per serving; calories in kcal, the rest in grams.`,
                },
            ],
        });

        const raw = stripFences(message.content[0].text);
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            try {
                data = JSON.parse(jsonrepair(raw));
            } catch {
                await ledger.settle("failed", { errorCode: "unparseable" });
                return res.status(400).json({ error: "Could not estimate macros" });
            }
        }

        // Prefer the caller's serving count; otherwise use the model's inferred
        // one (falling back to 4 if it didn't return a usable number).
        const resolvedServings = knownServings ?? firstInt(data.servings) ?? 4;

        res.json({
            servings: resolvedServings,
            calories: parseNumeric(data.calories),
            protein_g: parseNumeric(data.protein_g),
            carb_g: parseNumeric(data.carb_g),
            fat_g: parseNumeric(data.fat_g),
        });
        await ledger.settle("ok");
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

async function improveRecipe(req, res, next) {
    let ledger = null;
    try {
        const parsed = improveRecipeSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "title and ingredients are required" });
        }
        const { title, servings, description, instructions, ingredients } = parsed.data;

        ledger = await startAiAction(req, res, {
            action: "improve",
            credits: 1,
            burstLimit: IMPROVE_LIMIT,
            burstMessage: "Improve limit reached — 15 per 6 hours. Try again later.",
        });
        if (!ledger) return;

        const knownServings = servings && servings > 0 ? servings : null;
        const servingsInstruction = knownServings
            ? `This recipe makes ${knownServings} servings. Use exactly that serving count.`
            : `The number of servings isn't given. Choose a sensible serving count for this dish (default to 4 if unclear).`;

        // One numbered line per ingredient so the model returns them in the same
        // order (the frontend maps the response back positionally and only fills
        // fields the user left blank).
        const ingredientLines = ingredients
            .map((i, idx) => {
                const amount = [i.quantity, i.unit].filter(Boolean).join(" ").trim();
                return `${idx + 1}. ${i.name}${amount ? ` (currently: ${amount})` : ""}`;
            })
            .join("\n");

        const message = await runModel(ledger, {
            model: AI_MODEL,
            max_tokens: 1536,
            messages: [
                {
                    role: "user",
                    content: `You are a cooking assistant. Improve this draft recipe by filling in the gaps so it's complete and sensible, WITHOUT changing what the dish is.

Recipe title: ${title || "(untitled)"}
${servingsInstruction}
Current description: ${description ? description : "(none)"}
Current method: ${instructions ? instructions : "(none)"}
Ingredients (keep this exact list and order):
${ingredientLines}

Do the following:
- For EACH ingredient, give a sensible amount for the serving count: a numeric "quantity" and a short "unit". Use metric UK units where sensible (g, ml, tbsp, tsp) or leave "unit" empty for whole counts (e.g. 1 onion, 2 eggs). Do NOT add, remove, reorder or rename ingredients.
- If the method is missing or thin, write clear step-by-step instructions. If it is written as one paragraph, split it into steps without changing what it says.
- If the description is missing, write a short one-sentence description.
- Estimate the macros PER SERVING from the amounts.

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "description": string,
  "servings": number,
  "instructions": [string],            // one step per element, in order — never one paragraph
  "ingredients": [ { "name": string, "quantity": string, "unit": string } ],
  "calories": number,                  // per serving, kcal
  "protein_g": number,                 // per serving, grams
  "carb_g": number,                    // per serving, grams
  "fat_g": number                      // per serving, grams
}
"ingredients" MUST have the same length and order as the list above. "quantity" is a number written as a string (e.g. "500", "1.5", "2"); "unit" is a short unit or "" for whole counts.`,
                },
            ],
        });

        const raw = stripFences(message.content[0].text);
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            try {
                data = JSON.parse(jsonrepair(raw));
            } catch {
                await ledger.settle("failed", { errorCode: "unparseable" });
                return res.status(400).json({ error: "Could not improve this recipe" });
            }
        }
        if (!data || typeof data !== "object") {
            await ledger.settle("refund", { outcome: "no_result" });
            return res.status(400).json({ error: "Could not improve this recipe" });
        }

        // Normalise the returned ingredients to { name, quantity, unit } strings,
        // preserving order. Fall back to the caller's own row if the model drops
        // one, so the array stays aligned with the request.
        const outIngredients = ingredients.map((row, idx) => {
            const imp = Array.isArray(data.ingredients) ? data.ingredients[idx] : null;
            const quantity = imp && imp.quantity != null ? String(imp.quantity).trim() : "";
            const unit = imp && imp.unit != null ? String(imp.unit).trim() : "";
            const name = imp && typeof imp.name === "string" && imp.name.trim() ? imp.name.trim() : row.name;
            return { name, quantity, unit };
        });

        const nutrition = mapNutrition({
            calories: data.calories,
            proteinContent: data.protein_g,
            carbohydrateContent: data.carb_g,
            fatContent: data.fat_g,
        });

        res.json({
            description: typeof data.description === "string" && data.description.trim()
                ? data.description.trim()
                : null,
            servings: knownServings ?? firstInt(data.servings) ?? 4,
            instructions:
                normaliseSteps(data.instructions),
            ingredients: outIngredients,
            calories: nutrition.calories,
            protein_g: nutrition.protein_g,
            carb_g: nutrition.carb_g,
            fat_g: nutrition.fat_g,
        });
        await ledger.settle("ok");
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

async function generateFromTitle(req, res, next) {
    let ledger = null;
    try {
        const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
        if (!title) {
            return res.status(400).json({ error: "A recipe title is required" });
        }

        ledger = await startAiAction(req, res, {
            action: "generate",
            credits: 1,
            burstLimit: GENERATE_LIMIT,
            burstMessage: "Generation limit reached — 15 per 6 hours. Try again later.",
        });
        if (!ledger) return;

        const message = await runModel(ledger, {
            model: AI_MODEL,
            max_tokens: 2048,
            messages: [
                {
                    role: "user",
                    content: `You are a recipe writer. Invent a sensible, common-sense recipe for this dish.
Dish title: ${title}

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "title": string,
  "description": string | null,
  "instructions": [string],            // one step per element, in order — never one paragraph
  "ingredients": [ { "name": string, "quantity": "", "unit": "" } ],
  "prep_time_minutes": number | null,
  "cook_time_minutes": number | null,
  "servings": number | null,
  "calories": number | null,           // per serving, kcal
  "protein_g": number | null,          // per serving, grams
  "carb_g": number | null,             // per serving, grams
  "fat_g": number | null               // per serving, grams
}
Each ingredient "name" is the full line (e.g. "500g beef mince"); leave quantity and unit as empty strings.
Give realistic quantities in the ingredient names and estimate the per-serving macros.`,
                },
            ],
        });

        const raw = stripFences(message.content[0].text);
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            try {
                data = JSON.parse(jsonrepair(raw));
            } catch {
                await ledger.settle("failed", { errorCode: "unparseable" });
                return res.status(400).json({ error: "Could not generate a recipe for that title" });
            }
        }
        if (!data || !data.title) {
            await ledger.settle("refund", { outcome: "no_recipe" });
            return res.status(400).json({ error: "Could not generate a recipe for that title" });
        }

        const nutrition = mapNutrition({
            calories: data.calories,
            proteinContent: data.protein_g,
            carbohydrateContent: data.carb_g,
            fatContent: data.fat_g,
        });

        res.json({
            title: data.title,
            description: data.description || null,
            instructions:
                normaliseSteps(data.instructions),
            link_url: null,
            prep_time_minutes: firstInt(data.prep_time_minutes),
            cook_time_minutes: firstInt(data.cook_time_minutes),
            ingredients: mapIngredients(
                Array.isArray(data.ingredients)
                    ? data.ingredients.map((i) => (typeof i === "string" ? i : i?.name))
                    : [],
            ),
            collections: ["Generated"],
            image_url: null,
            image_public_id: null,
            servings: firstInt(data.servings),
            calories: nutrition.calories,
            protein_g: nutrition.protein_g,
            carb_g: nutrition.carb_g,
            fat_g: nutrition.fat_g,
            macros_source: nutrition.found ? "estimated" : null,
        });
        await ledger.settle("ok");
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

// ---------- "My usuals" — the onboarding go-to meals step ----------

// A new user types the meals they actually cook, in their own words, and we
// write each one up as a proper recipe. This is the ownership moment in
// onboarding, so two things are deliberate:
//
//   1. It is FREE. Its ai_usage row is opened with credits = 0 (so it is
//      measured — tokens, cost, latency — but never charged; the allowance
//      sums credits, not rows). Fair use is bounded by a per-household daily
//      run counter instead.
//   2. We do NOT apply the household's dietary answers. Someone who ticked
//      vegetarian for one member and typed "spag bol" means the beef one they've
//      cooked for years; handing back a substitute they didn't ask for is
//      exactly the "our food, not yours" failure this step exists to fix. Diet
//      governs the starter recipes *we* choose, which is the right place for it.

// Households currently generating, so two requests in flight can't both pass the
// daily check (recordEvent is fire-and-forget and written after the work).
const usualsInFlight = new Set();

function usualsPrompt(dish) {
    return `You are a recipe writer for a UK home-cooking app. A user has typed the name of a meal they cook regularly, in their own words. Write that meal up as a proper recipe.

What they typed: "${dish}"

Their words may be shorthand, regional or affectionate ("spag bol" = spaghetti bolognese, "mac n cheese" = macaroni cheese, "mum's lasagne" = lasagne). Work out which dish they mean and write a sensible, common-sense version of it. Assume UK ingredients and measurements, and a family of four, unless their words say otherwise.

Keep their own words as the "title" where they read like a name for the dish (e.g. "Mum's Lasagne"), but expand obvious shorthand into the real dish name (e.g. "spag bol" -> "Spaghetti Bolognese"). Capitalise it properly.

If you genuinely cannot tell what dish they mean, return {"unknown": true} and nothing else. Do not invent an unrelated recipe.

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "title": string,
  "canonical_dish": string,            // the plain generic name, lower case, no
                                       // possessives or adjectives, e.g. "lasagne"
  "description": string | null,
  "instructions": [string],            // one step per element, in order — never one paragraph
  "ingredients": [ { "name": string, "quantity": "", "unit": "" } ],
  "prep_time_minutes": number | null,
  "cook_time_minutes": number | null,
  "servings": number | null,
  "calories": number | null,           // per serving, kcal
  "protein_g": number | null,          // per serving, grams
  "carb_g": number | null,             // per serving, grams
  "fat_g": number | null               // per serving, grams
}
Each ingredient "name" is the full line (e.g. "500g beef mince"); leave quantity and unit as empty strings.
Give realistic quantities in the ingredient names and estimate the per-serving macros.`;
}

// Clean, de-duplicate and cap what the client sent. Newlines and backticks are
// stripped so a dish name can't restructure the prompt; the length cap bounds
// the rest. Forgiving rather than rejecting — an over-long array means a stale
// client, not an attack.
function parseDishes(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const dishes = [];
    for (const entry of list) {
        if (typeof entry !== "string") continue;
        const clean = entry
            .replace(/[\r\n`]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, USUALS_MAX_TITLE_LEN);
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        dishes.push(clean);
    }
    return dishes;
}

// Run `worker` over items with a bounded number in flight, preserving order.
async function runPool(items, limit, worker) {
    const out = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (let i = cursor++; i < items.length; i = cursor++) {
            out[i] = await worker(items[i], i);
        }
    });
    // The worker never throws (each dish is wrapped), but a bug in it must not
    // lose the other nine dishes.
    await Promise.allSettled(runners);
    return out;
}

// AI draft -> the shape db.createRecipe wants. Mirrors the transform in
// recipeShareController, with one addition that matters (see quantity below).
function usualsToCreateData(input, data) {
    if (!data) {
        // Title-only: whatever they typed still lands in their list, tagged the
        // same, so nothing they wrote is lost. title/description/instructions
        // are all nullable.
        const title = input.charAt(0).toUpperCase() + input.slice(1);
        return {
            recipe_title: title.slice(0, 255),
            recipe_description: null,
            recipe_instructions: null,
            recipe_link_url: null,
            prep_time_minutes: null,
            cook_time_minutes: null,
            ingredient_name: [],
            ingredient_quantity: [],
            ingredient_unit: [],
            tags: [USUALS_TAG],
            image_url: null,
            image_public_id: null,
            servings: null,
            calories: null,
            protein_g: null,
            carb_g: null,
            fat_g: null,
            macros_source: null,
        };
    }

    const ings = mapIngredients(
        Array.isArray(data.ingredients)
            ? data.ingredients.map((i) => (typeof i === "string" ? i : i?.name))
            : [],
    ).slice(0, 40);
    const nutrition = mapNutrition({
        calories: data.calories,
        proteinContent: data.protein_g,
        carbohydrateContent: data.carb_g,
        fatContent: data.fat_g,
    });
    // recipes.calories is INTEGER; the others are unconstrained NUMERIC. A wild
    // model value would overflow and, because createRecipe swallows its error,
    // silently lose the whole recipe.
    const calories =
        nutrition.calories != null && nutrition.calories >= 0 && nutrition.calories < 100_000
            ? nutrition.calories
            : null;

    return {
        recipe_title: String(data.title).slice(0, 255),
        recipe_description: data.description || null,
        recipe_instructions:
            normaliseSteps(data.instructions),
        recipe_link_url: null,
        prep_time_minutes: firstInt(data.prep_time_minutes),
        cook_time_minutes: firstInt(data.cook_time_minutes),
        ingredient_name: ings.map((i) => i.name),
        // recipe_ingredients.quantity is numeric(6,2) and mapIngredients always
        // emits "". Passing "" to a numeric parameter throws — the HTTP path
        // only survives because recipe.schema.js coerces "" to 0. Calling
        // createRecipe directly we have to do it ourselves, and null is right
        // here: on this path the amounts live in the ingredient name.
        ingredient_quantity: ings.map(() => null),
        ingredient_unit: ings.map(() => ""),
        tags: [USUALS_TAG],
        image_url: null,
        image_public_id: null,
        servings: firstInt(data.servings),
        calories,
        protein_g: nutrition.protein_g,
        carb_g: nutrition.carb_g,
        fat_g: nutrition.fat_g,
        macros_source: nutrition.found ? "estimated" : null,
    };
}

async function generateUsuals(req, res, next) {
    const householdId = req.householdId;
    let ledger = null;
    try {
        const dishes = parseDishes(req.body?.dishes);
        const use = dishes.slice(0, USUALS_MAX_DISHES);
        if (use.length === 0) {
            return res.status(400).json({ error: "Type at least one dish" });
        }

        if (usualsInFlight.has(householdId)) {
            return res.status(429).json({
                error: "USUALS_LIMIT",
                message: "We're still writing your last batch — give it a moment.",
            });
        }
        const runs = await db.countRecentEvents("onboarding_usuals", householdId);
        if (runs >= USUALS_RUNS_PER_DAY) {
            return res.status(429).json({
                error: "USUALS_LIMIT",
                message:
                    "You've already done this a few times today. You can still add recipes one at a time from Add recipe.",
            });
        }
        usualsInFlight.add(householdId);

        // Free: logged (tokens, cost, latency) but opened with 0 credits.
        ledger = await startAiAction(req, res, {
            action: "usuals",
            credits: 0,
            weekly: false,
            meta: { dishes: use.length },
        });

        const startedAt = Date.now();

        async function draftDish(dish) {
            if (Date.now() - startedAt > USUALS_TOTAL_BUDGET_MS) return null;
            try {
                const message = await runModel(
                    ledger,
                    {
                        model: AI_MODEL,
                        max_tokens: 2048,
                        messages: [{ role: "user", content: usualsPrompt(dish) }],
                    },
                    // Without these we inherit the client defaults (10 minutes,
                    // 2 retries), which for parallel calls is a request that can
                    // hang for minutes.
                    { timeout: USUALS_CALL_TIMEOUT_MS, maxRetries: 1 },
                );
                const raw = stripFences(message.content[0].text);
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
                if (!data || data.unknown === true || !data.title) return null;
                return data;
            } catch (error) {
                console.error(`[usuals] generation failed for ${JSON.stringify(dish)}:`, error.message);
                return null;
            }
        }

        let drafts;
        try {
            drafts = await runPool(use, USUALS_CONCURRENCY, draftDish);
        } finally {
            usualsInFlight.delete(householdId);
        }

        // Generate in parallel, write sequentially: the inserts are milliseconds,
        // and serialising them keeps createSingleTag (read-then-insert, swallows
        // its unique violation) from racing on the shared tag. Belt and braces,
        // create the tag once up front too.
        await db.createSingleTag(USUALS_TAG);

        const results = [];
        for (let i = 0; i < use.length; i++) {
            const input = use[i];
            const data = drafts[i] ?? null;
            let recipeId = null;
            try {
                // createRecipe's own try only wraps its INSERT block — the
                // ingredient/tag upserts before it can throw straight out.
                recipeId = await db.createRecipe(
                    usualsToCreateData(input, data),
                    householdId,
                    req.user.id,
                );
            } catch (error) {
                console.error(`[usuals] createRecipe threw for ${JSON.stringify(input)}:`, error.message);
            }
            results.push({
                input,
                title: data?.title ? String(data.title).slice(0, 255) : input,
                // Matching only — never stored. Lets the client spot that
                // "mum's lasagne" and our "Oven Lasagne…" are the same dish.
                canonical:
                    typeof data?.canonical_dish === "string" ? data.canonical_dish.toLowerCase() : null,
                recipeId: recipeId ?? null,
                // createRecipe returns undefined when its insert failed, so a
                // falsy id is the only failure signal we get.
                status: !recipeId ? "failed" : data ? "written" : "title_only",
            });
        }

        const counts = {
            requested: use.length,
            written: results.filter((r) => r.status === "written").length,
            titleOnly: results.filter((r) => r.status === "title_only").length,
            failed: results.filter((r) => r.status === "failed").length,
            dropped: dishes.length - use.length,
        };

        db.recordEvent("onboarding_usuals", {
            userId: req.user.id,
            householdId,
            meta: {
                requested: counts.requested,
                written: counts.written,
                title_only: counts.titleOnly,
                failed: counts.failed,
                ms: Date.now() - startedAt,
            },
        });

        await ledger.settle("ok", {
            meta: {
                requested: counts.requested,
                written: counts.written,
                title_only: counts.titleOnly,
                failed: counts.failed,
            },
        });
        res.json({ results, counts });
    } catch (error) {
        usualsInFlight.delete(householdId);
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

// ---------- recipe inspiration (A2) ----------

// Normalise one raw suggestion from the model into { title, tags[], ingredients[] }
// of clean strings, or null if it hasn't got a usable title + ingredients.
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

async function suggestRecipes(req, res, next) {
    let ledger = null;
    try {
        const rawHint = typeof req.body?.hint === "string" ? req.body.hint.trim() : "";
        const hint = rawHint.slice(0, MAX_HINT_LEN);

        ledger = await startAiAction(req, res, {
            action: "suggest",
            credits: 1,
            burstLimit: SUGGEST_LIMIT,
            burstMessage: "Suggestion limit reached — 15 per 6 hours. Try again later.",
        });
        if (!ledger) return;

        const steer = hint
            ? `The user is after: "${hint}". Tailor every idea to that.`
            : "Give a varied mix of crowd-pleasing everyday home dinners.";

        const message = await runModel(ledger, {
            model: AI_MODEL,
            max_tokens: 1536,
            messages: [
                {
                    role: "user",
                    content: `You are a recipe idea generator. Suggest ${SUGGEST_COUNT} home-cooking recipe ideas.
${steer}

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "suggestions": [
    { "title": string, "tags": [string], "ingredients": [string] }
  ]
}
- "title" is the dish name (e.g. "Chicken katsu curry").
- "tags" are 1-3 short collection labels a home cook would file it under (e.g. "Dinner", "Kids", "Vegetarian", "Quick"). Capitalise them.
- "ingredients" are 5-10 plain ingredient names only — NO quantities, numbers or units (e.g. "chicken breast", "panko breadcrumbs", "curry sauce", "rice").
Give ${SUGGEST_COUNT} distinct ideas.`,
                },
            ],
        });

        const raw = stripFences(message.content[0].text);
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            try {
                data = JSON.parse(jsonrepair(raw));
            } catch {
                await ledger.settle("failed", { errorCode: "unparseable" });
                return res.status(400).json({ error: "Could not get ideas just now." });
            }
        }

        const list = Array.isArray(data?.suggestions)
            ? data.suggestions
            : Array.isArray(data)
              ? data
              : [];
        const suggestions = list.map(normaliseSuggestion).filter(Boolean);

        if (suggestions.length === 0) {
            await ledger.settle("refund", { outcome: "no_result" });
            return res.status(400).json({ error: "Could not get ideas just now." });
        }

        await ledger.settle("ok", { meta: { suggestions: suggestions.length } });
        res.json({ suggestions });
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

// ---------- photo → recipe (vision) ----------

const PHOTO_PROMPT = `You extract a single structured recipe from a photograph (or several photographs) of a recipe — typically a cookbook page, which may be spread across two facing pages. Treat all the images as ONE recipe.

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "title": string,
  "description": string | null,
  "instructions": [string],            // one step per element, in order — never one paragraph
  "ingredients": [ { "name": string, "quantity": "", "unit": "" } ],
  "prep_time_minutes": number | null,
  "cook_time_minutes": number | null,
  "servings": number | null,
  "calories": number | null,           // per serving, kcal, only if printed
  "protein_g": number | null,          // per serving, grams, only if printed
  "carb_g": number | null,             // per serving, grams, only if printed
  "fat_g": number | null,              // per serving, grams, only if printed
  "confidence": "high" | "low",        // see below
  "issues": string | null              // brief note on anything unclear
}
Each ingredient "name" is the full line as written (e.g. "500g beef mince"), keeping its quantity in the text; leave the "quantity" and "unit" fields as empty strings.
Only fill in macros that are actually printed on the page — do not estimate them; use null otherwise.
Set "confidence" to "low" if any image is blurry, cropped, glare-obscured, or partly unreadable, or if you had to guess the title, ingredients, or steps. Otherwise "high".
If the images do not contain a recipe, return {"title": null, "confidence": "low"}.`;

// One vision call for the given model; returns { data, ok }. Mirrors the JSON
// healing used by the other AI endpoints (JSON.parse → jsonrepair fallback).
async function extractFromImages(images, model, ledger = null) {
    const message = await runModel(ledger, {
        model,
        max_tokens: 2048,
        messages: [
            {
                role: "user",
                content: [
                    ...images.map((img) => ({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: img.media_type,
                            data: img.data,
                        },
                    })),
                    { type: "text", text: PHOTO_PROMPT },
                ],
            },
        ],
    }, { timeout: PHOTO_CALL_TIMEOUT_MS });

    const raw = stripFences(message.content[0].text);
    try {
        return { data: JSON.parse(raw), ok: true };
    } catch {
        try {
            return { data: JSON.parse(jsonrepair(raw)), ok: true };
        } catch {
            return { data: null, ok: false };
        }
    }
}

// Cheap structural checks — used (alongside the model's own confidence flag) to
// decide whether to escalate to the stronger vision model.
function validateDraft(data) {
    if (!data || typeof data !== "object") return false;
    if (typeof data.title !== "string" || !data.title.trim()) return false;

    const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
    if (ingredients.length === 0) return false;

    const instructions = normaliseSteps(data.instructions);
    if (!instructions.trim()) return false;

    // Soft check: OCR that drops amounts leaves ingredient lines with no digits.
    // Flag when fewer than half the lines contain a number.
    const names = ingredients.map((i) => (typeof i === "string" ? i : i?.name || ""));
    const withQuantity = names.filter((n) => /\d/.test(n)).length;
    if (names.length > 0 && withQuantity / names.length < 0.5) return false;

    return true;
}

async function parseFromPhoto(req, res, next) {
    let ledger = null;
    try {
        const parsed = parsePhotoSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "At least one photo is required" });
        }
        const { images } = parsed.data;

        const totalBytes = images.reduce(
            (sum, img) => sum + Math.ceil((img.data.length * 3) / 4),
            0,
        );
        if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
            return res.status(413).json({ error: "Those photos are too large." });
        }

        ledger = await startAiAction(req, res, {
            action: "photo",
            credits: 1,
            burstLimit: PHOTO_LIMIT,
            burstMessage: "Photo limit reached — 15 per 6 hours. Try again later.",
            meta: { images: images.length },
        });
        if (!ledger) return;

        // Haiku first; escalate the same image(s) once to Sonnet when Haiku's
        // JSON won't parse, it self-reports low confidence, or the draft fails
        // structural validation. Both calls land on the one ledger row.
        let servedBy = AI_MODEL;
        let result;
        try {
            result = await extractFromImages(images, AI_MODEL, ledger);
        } catch (err) {
            console.error("[photo] Haiku call failed:", err.message);
            result = { data: null, ok: false };
        }

        const needsEscalation =
            !result.ok ||
            result.data?.confidence === "low" ||
            !validateDraft(result.data);
        if (needsEscalation) {
            try {
                const escalated = await extractFromImages(images, VISION_ESCALATION_MODEL, ledger);
                if (escalated.ok) {
                    result = escalated;
                    servedBy = VISION_ESCALATION_MODEL;
                }
            } catch (err) {
                console.error("[photo] Sonnet escalation failed:", err.message);
            }
        }

        const data = result.data;
        if (!result.ok || !data || !data.title) {
            // A model answered but there is no recipe in it → refunded; no
            // model answered at all → failed. Neither charges.
            await ledger.settle(ledger.succeededCalls ? "refund" : "failed", {
                outcome: "no_recipe",
                meta: { escalated: needsEscalation },
            });
            return res.status(400).json({
                error: "No recipe could be read from that photo.",
            });
        }
        await ledger.settle("ok", {
            meta: { escalated: needsEscalation, confidence: data.confidence ?? null },
        });

        const nutrition = mapNutrition({
            calories: data.calories,
            proteinContent: data.protein_g,
            carbohydrateContent: data.carb_g,
            fatContent: data.fat_g,
        });

        res.json({
            title: data.title,
            description: data.description || null,
            instructions:
                normaliseSteps(data.instructions),
            link_url: null,
            prep_time_minutes: firstInt(data.prep_time_minutes),
            cook_time_minutes: firstInt(data.cook_time_minutes),
            ingredients: mapIngredients(
                Array.isArray(data.ingredients)
                    ? data.ingredients.map((i) => (typeof i === "string" ? i : i?.name))
                    : [],
            ),
            collections: ["Scanned"],
            image_url: null,
            image_public_id: null,
            servings: firstInt(data.servings),
            calories: nutrition.calories,
            protein_g: nutrition.protein_g,
            carb_g: nutrition.carb_g,
            fat_g: nutrition.fat_g,
            macros_source: nutrition.found ? "estimated" : null,
        });
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

// ---------- social import (caption-first + paste fallback) ----------

// Pull a YouTube video id from the common URL shapes.
function youtubeVideoId(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
        if (host.endsWith("youtube.com")) {
            if (u.pathname === "/watch") return u.searchParams.get("v");
            const m = u.pathname.match(/^\/(shorts|embed|v)\/([^/?]+)/);
            if (m) return m[2];
        }
    } catch {
        /* not a URL */
    }
    return null;
}

// YouTube Data API snippet (title + full description). Needs YOUTUBE_API_KEY;
// returns null if unset or the call fails (caller falls back to og-tags).
async function fetchYouTubeSnippet(id) {
    if (!process.env.YOUTUBE_API_KEY) return null;
    const api = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(
        id,
    )}&key=${process.env.YOUTUBE_API_KEY}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(api, { signal: controller.signal });
        if (!r.ok) return null;
        const data = await r.json();
        const snip = data?.items?.[0]?.snippet;
        if (!snip) return null;
        return {
            title: snip.title || "",
            description: snip.description || "",
            thumbnail:
                snip.thumbnails?.maxres?.url ||
                snip.thumbnails?.high?.url ||
                snip.thumbnails?.standard?.url ||
                snip.thumbnails?.medium?.url ||
                null,
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// Best-effort caption from Open Graph / meta tags on the page. Works for many
// public posts; IG/TikTok often serve a login wall (→ short/empty → null).
async function fetchOgCaption(url) {
    let html;
    try {
        html = await fetchPage(url);
    } catch {
        return null;
    }
    const $ = cheerio.load(html);
    const title =
        $('meta[property="og:title"]').attr("content") || $("title").text() || "";
    const desc =
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content") ||
        "";
    const caption = [title, desc].map((s) => s.trim()).filter(Boolean).join("\n\n").trim();
    return caption.length >= MIN_CAPTION_LEN ? caption : null;
}

// TikTok exposes a free public oEmbed whose `title` is the caption (and a
// `thumbnail_url` cover image). Returns { caption, imageUrl } or null.
async function fetchTikTokPost(url) {
    // Short links (vm./vt.tiktok.com) must be resolved to the canonical video URL.
    let target = url;
    try {
        const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
        if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            try {
                const r = await fetch(url, { redirect: "follow", signal: controller.signal });
                if (r.url) target = r.url;
            } finally {
                clearTimeout(timer);
            }
        }
    } catch {
        /* keep the original url */
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`,
            { signal: controller.signal },
        );
        if (!r.ok) return null;
        const data = await r.json();
        const title = typeof data?.title === "string" ? data.title.trim() : "";
        if (title.length < MIN_CAPTION_LEN) return null;
        return { caption: title, imageUrl: data?.thumbnail_url || null };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// Instagram has no free caption source (login wall). Use an Apify actor when
// APIFY_TOKEN is set; returns { caption, imageUrl } or null (→ paste fallback)
// if unset, slow, or failing.
async function fetchInstagramPost(url) {
    if (!process.env.APIFY_TOKEN) return null;
    const actor = process.env.APIFY_IG_ACTOR || "apify~instagram-scraper";
    const api = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
        process.env.APIFY_TOKEN,
    )}&timeout=60`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IG_SCRAPE_TIMEOUT_MS);
    try {
        const r = await fetch(api, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                directUrls: [url],
                resultsType: "posts",
                resultsLimit: 1,
                addParentData: false,
            }),
            signal: controller.signal,
        });
        if (!r.ok) {
            console.error("[social] Apify Instagram returned", r.status);
            return null;
        }
        const items = await r.json();
        const item = Array.isArray(items) ? items[0] : null;
        const raw = item?.caption;
        const caption = (typeof raw === "string" ? raw : raw?.text || "").trim();
        if (caption.length < MIN_CAPTION_LEN) return null;
        const imageUrl =
            item?.displayUrl ||
            (Array.isArray(item?.images) ? item.images[0] : null) ||
            null;
        return { caption, imageUrl };
    } catch (err) {
        console.error("[social] Apify Instagram failed:", err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// Resolve a post URL to { caption, imageUrl }, or null if we can't get a usable
// caption. imageUrl (a cover/thumbnail) is best-effort and may be null.
async function getSocialCaption(url) {
    let host = "";
    try {
        host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return null;
    }

    if (host === "youtu.be" || host.endsWith("youtube.com")) {
        const id = youtubeVideoId(url);
        if (id) {
            const snip = await fetchYouTubeSnippet(id);
            if (snip) {
                const combined = [snip.title, snip.description]
                    .filter(Boolean)
                    .join("\n\n")
                    .trim();
                if (combined.length >= MIN_CAPTION_LEN) {
                    return { caption: combined, imageUrl: snip.thumbnail || null };
                }
            }
        }
    } else if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
        const post = await fetchTikTokPost(url);
        if (post) return post;
    } else if (host === "instagram.com" || host.endsWith(".instagram.com")) {
        const post = await fetchInstagramPost(url);
        if (post) return post;
    }

    // Fallback: Open Graph / meta tags (covers other sites; usually null for IG/TikTok).
    const cap = await fetchOgCaption(url);
    return cap ? { caption: cap, imageUrl: null } : null;
}

async function importSocial(req, res, next) {
    let ledger = null;
    try {
        const parsed = importSocialSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "A URL or caption text is required" });
        }
        const { url, text } = parsed.data;
        const pasted = text && text.trim() ? text.trim() : null;

        // Get the caption (+ a cover image where available): use pasted text if
        // given, else try to fetch it.
        let caption = pasted;
        let imageUrl = null;
        if (!caption && url) {
            try {
                await assertSafeUrl(url);
            } catch (guardError) {
                return res.status(400).json({ error: guardError.message });
            }
            const social = await getSocialCaption(url);
            // Blocked / too sparse — ask for a paste. No AI call, no slot spent.
            if (!social || !social.caption) return res.json({ needsCaption: true });
            caption = social.caption;
            imageUrl = social.imageUrl || null;
        }
        if (!caption) {
            return res.status(400).json({ error: "A URL or caption text is required" });
        }

        // Rate-limit only now that we're actually going to call the model.
        ledger = await startAiAction(req, res, {
            action: "social",
            credits: 1,
            burstLimit: SOCIAL_LIMIT,
            burstMessage: "Import limit reached — 20 per 6 hours. Try again later.",
            meta: { pasted: Boolean(pasted) },
        });
        if (!ledger) return;

        let fields;
        try {
            fields = await extractRecipeFromText(caption, ledger);
        } catch (aiError) {
            console.error("[social] extraction failed:", aiError.message);
            await ledger.fail(aiError);
            return res.status(400).json({ error: "Couldn’t read a recipe from that." });
        }

        if (!fields || (!fields.title && (fields.ingredients || []).length === 0)) {
            await ledger.settle("refund", { outcome: "no_recipe" });
            // A fetched caption may simply be too thin — offer the paste path.
            if (url && !pasted) return res.json({ needsCaption: true });
            return res.status(400).json({ error: "Couldn’t find a recipe in that caption." });
        }

        const draft = buildDraft(fields, url || null);
        draft.collections = ["Social"];
        delete draft._imageUrl;
        // Upload the post's cover/thumbnail to Cloudinary so we keep a permanent
        // asset rather than an expiring social CDN link (null if Cloudinary isn't
        // configured or the upload fails).
        if (imageUrl) {
            const uploaded = await uploadFromUrl(imageUrl);
            if (uploaded) {
                draft.image_url = uploaded.image_url;
                draft.image_public_id = uploaded.image_public_id;
            }
        }
        await ledger.settle("ok");
        res.json(draft);
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

module.exports = {
    importRecipe,
    estimateMacros,
    improveRecipe,
    generateFromTitle,
    generateUsuals,
    suggestRecipes,
    parseFromPhoto,
    importSocial,
};
