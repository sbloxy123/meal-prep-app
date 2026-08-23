const cheerio = require("cheerio");
const Anthropic = require("@anthropic-ai/sdk");
const { jsonrepair } = require("jsonrepair");

const db = require("../db/queries");
const { assertSafeUrl } = require("../lib/urlGuard");
const { uploadFromUrl } = require("../lib/cloudinary");
const {
    importUrlSchema,
    estimateMacrosSchema,
    improveRecipeSchema,
    parsePhotoSchema,
} = require("../schemas/recipe.schema.js");

// Reuse the same LLM client/model as shoppingListController (parse-ingredients).
const client = new Anthropic();
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
const IMPROVE_LIMIT = 15;
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
                instructions: flattenInstructions(recipe.recipeInstructions).join("\n"),
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
    const instructions = prop("recipeInstructions").join("\n");
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

async function extractWithAI($) {
    const text = pageToText($);
    if (!text) return null;

    const message = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 2048,
        messages: [
            {
                role: "user",
                content: `You extract structured recipe data from the readable text of a web page.
Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "title": string,
  "description": string | null,
  "instructions": string,              // steps joined by newline characters
  "prep_time_minutes": number | null,
  "cook_time_minutes": number | null,
  "ingredients": [ { "name": string, "quantity": "", "unit": "" } ],
  "servings": number | null,
  "calories": number | null,           // per serving, kcal
  "protein_g": number | null,          // per serving, grams
  "carb_g": number | null,             // per serving, grams
  "fat_g": number | null               // per serving, grams
}
Each ingredient "name" is the full line (e.g. "500g beef mince"); leave quantity and unit as empty strings.
If the text is not a recipe, return {"title": null}.
Page text:
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
        instructions: typeof data.instructions === "string" ? data.instructions : "",
        prepTime: data.prep_time_minutes ? `PT${data.prep_time_minutes}M` : null,
        cookTime: data.cook_time_minutes ? `PT${data.cook_time_minutes}M` : null,
        nutrition,
        recipeYield: data.servings,
    };
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

        const householdId = req.householdId;
        const recent = await db.countRecentImports(householdId, "import");
        if (recent >= IMPORT_LIMIT) {
            return res.status(429).json({
                error: "Import limit reached — 20 per 6 hours. Try again later.",
            });
        }
        await db.recordImport(householdId, "import");

        let html;
        try {
            html = await fetchPage(url);
        } catch (fetchError) {
            return res.status(400).json({ error: fetchError.message });
        }

        const $ = cheerio.load(html);
        let fields = extractFromJsonLd($) || extractFromMicrodata($);
        if (!fields) {
            try {
                fields = await extractWithAI($);
            } catch (aiError) {
                console.error("[import] AI fallback failed:", aiError.message);
            }
        }

        if (!fields || (!fields.title && (fields.ingredients || []).length === 0)) {
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

        res.json(draft);
    } catch (error) {
        next(error);
    }
}

async function estimateMacros(req, res, next) {
    try {
        const parsed = estimateMacrosSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "title and ingredients are required" });
        }
        const { title, servings, ingredients } = parsed.data;

        const householdId = req.householdId;
        const recent = await db.countRecentImports(householdId, "estimate");
        if (recent >= IMPORT_LIMIT) {
            return res.status(429).json({
                error: "Estimate limit reached — 20 per 6 hours. Try again later.",
            });
        }
        await db.recordImport(householdId, "estimate");

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

        const message = await client.messages.create({
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
    } catch (error) {
        next(error);
    }
}

async function improveRecipe(req, res, next) {
    try {
        const parsed = improveRecipeSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "title and ingredients are required" });
        }
        const { title, servings, description, instructions, ingredients } = parsed.data;

        const householdId = req.householdId;
        const recent = await db.countRecentImports(householdId, "improve");
        if (recent >= IMPROVE_LIMIT) {
            return res.status(429).json({
                error: "Improve limit reached — 15 per 6 hours. Try again later.",
            });
        }
        await db.recordImport(householdId, "improve");

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

        const message = await client.messages.create({
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
- If the method is missing or thin, write clear step-by-step instructions (one step per line).
- If the description is missing, write a short one-sentence description.
- Estimate the macros PER SERVING from the amounts.

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "description": string,
  "servings": number,
  "instructions": string,              // steps joined by newline characters
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
                return res.status(400).json({ error: "Could not improve this recipe" });
            }
        }
        if (!data || typeof data !== "object") {
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
                typeof data.instructions === "string"
                    ? data.instructions
                    : flattenInstructions(data.instructions).join("\n"),
            ingredients: outIngredients,
            calories: nutrition.calories,
            protein_g: nutrition.protein_g,
            carb_g: nutrition.carb_g,
            fat_g: nutrition.fat_g,
        });
    } catch (error) {
        next(error);
    }
}

async function generateFromTitle(req, res, next) {
    try {
        const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
        if (!title) {
            return res.status(400).json({ error: "A recipe title is required" });
        }

        const householdId = req.householdId;
        const recent = await db.countRecentImports(householdId, "generate");
        if (recent >= GENERATE_LIMIT) {
            return res.status(429).json({
                error: "Generation limit reached — 15 per 6 hours. Try again later.",
            });
        }
        await db.recordImport(householdId, "generate");

        const message = await client.messages.create({
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
  "instructions": string,              // steps joined by newline characters
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
                return res.status(400).json({ error: "Could not generate a recipe for that title" });
            }
        }
        if (!data || !data.title) {
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
                typeof data.instructions === "string"
                    ? data.instructions
                    : flattenInstructions(data.instructions).join("\n"),
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
    } catch (error) {
        next(error);
    }
}

// ---------- photo → recipe (vision) ----------

const PHOTO_PROMPT = `You extract a single structured recipe from a photograph (or several photographs) of a recipe — typically a cookbook page, which may be spread across two facing pages. Treat all the images as ONE recipe.

Return ONLY valid raw JSON (no markdown, no code fences) in EXACTLY this shape:
{
  "title": string,
  "description": string | null,
  "instructions": string,              // steps joined by newline characters
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
async function extractFromImages(images, model) {
    const message = await client.messages.create({
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
    });

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

    const instructions = typeof data.instructions === "string" ? data.instructions : "";
    if (!instructions.trim()) return false;

    // Soft check: OCR that drops amounts leaves ingredient lines with no digits.
    // Flag when fewer than half the lines contain a number.
    const names = ingredients.map((i) => (typeof i === "string" ? i : i?.name || ""));
    const withQuantity = names.filter((n) => /\d/.test(n)).length;
    if (names.length > 0 && withQuantity / names.length < 0.5) return false;

    return true;
}

async function parseFromPhoto(req, res, next) {
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

        const householdId = req.householdId;
        const recent = await db.countRecentImports(householdId, "photo");
        if (recent >= PHOTO_LIMIT) {
            return res.status(429).json({
                error: "Photo limit reached — 15 per 6 hours. Try again later.",
            });
        }
        await db.recordImport(householdId, "photo");

        // Haiku first; escalate the same image(s) once to Sonnet when Haiku's
        // JSON won't parse, it self-reports low confidence, or the draft fails
        // structural validation.
        let servedBy = AI_MODEL;
        let result;
        try {
            result = await extractFromImages(images, AI_MODEL);
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
                const escalated = await extractFromImages(images, VISION_ESCALATION_MODEL);
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
            return res.status(400).json({
                error: "No recipe could be read from that photo.",
            });
        }
        console.log(
            `[photo] served by ${servedBy} (confidence=${data.confidence ?? "?"})`,
        );

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
                typeof data.instructions === "string"
                    ? data.instructions
                    : flattenInstructions(data.instructions).join("\n"),
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
        next(error);
    }
}

module.exports = { importRecipe, estimateMacros, improveRecipe, generateFromTitle, parseFromPhoto };
