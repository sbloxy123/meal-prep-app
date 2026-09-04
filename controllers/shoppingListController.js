const db = require("../db/queries");
const { jsonrepair } = require("jsonrepair");
const { startAiAction } = require("../lib/aiAllowance");
const { runModel, textOf } = require("../lib/ai");
const { organiseList } = require("../lib/ingredients/organise");

const AI_MODEL = "claude-haiku-4-5-20251001";

// Per-household 6h burst ceilings — the anti-abuse guard that applies to
// everyone. The weekly free pool (startAiAction) is checked first and only
// bites free households.
const AISLE_LIMIT = 20;
// "Add with AI" on the shopping list (paste → items). Free — it is a tiny call
// and the list must stay free at every tier — but it had NO ceiling at all
// before the ledger landed, so it gets one now.
const PARSE_LIMIT = 30;

const {
    recipeShoppingListSchema,
    customProductSchema,
    recipeIngredientSchema,
    shoppingListItemSchema,
} = require("../schemas/recipe.schema.js");

async function createShoppingList(req, res, next) {
    try {
        const formData = {
            ingredients: [].concat(req.body.ingredients || []),
            recipeId: req.body.recipeId,
        };
        const result = recipeShoppingListSchema.safeParse(formData);

        if (!result.success) {
            return res.status(400).json({ errors: result.error.flatten().fieldErrors });
        }

        await db.createShoppingList(result.data, req.householdId, req.user.id);
        db.recordEvent("week_add", {
            userId: req.user.id,
            householdId: req.householdId,
            meta: result.data.recipeId ? { recipe_id: result.data.recipeId } : null,
        });
        res.status(201).json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function getShoppingList(req, res, next) {
    try {
        const householdId = req.householdId;
        const [shoppingList, allRecipesOnMenu, singleRecipeIngredients, singleRecipeTags, allTags, shoppingListIngredientsByRecipe, householdMemberCount, entitlement, onboarding] =
            await Promise.all([
                db.getShoppingListItems(householdId),
                db.allRecipesOnMenu(householdId),
                db.getSingleRecipeIngredients(householdId),
                db.getSingleRecipeTags(householdId),
                db.getAllTags(householdId),
                db.getShoppingListIngredientsByRecipe(householdId),
                db.getHouseholdMemberCount(householdId),
                db.getEntitlement(householdId),
                db.getOnboardingState(householdId, req.user.id),
            ]);

        // Strip the server-only fields before this goes to the browser.
        const { householdId: _hh, stripeSubscriptionId: _sub, premiumPayerUserId: _payer, ...publicEntitlement } = entitlement;

        res.json({
            shoppingList,
            allRecipesOnMenu,
            singleRecipeIngredients,
            singleRecipeTags,
            allTags,
            shoppingListIngredientsByRecipe,
            householdMemberCount,
            // Plan, trial and credits for the whole app to read (lib/credits.js
            // buildEntitlement shape).
            entitlement: publicEntitlement,
            // Compatibility for the frontend release before `entitlement`
            // shipped: it derives `exhausted` from these and would otherwise
            // fall back to a 15-per-week limit and disable every AI button.
            // trial reads as 'premium' there (it only knows two plans). Drop
            // in the cleanup PR once the credits frontend is live.
            plan: entitlement.plan === "free" ? "free" : "premium",
            aiUsedThisWeek: entitlement.credits.used,
            aiWeeklyLimit: entitlement.credits.allowance ?? 1_000_000_000,
            weekResetsAt: entitlement.credits.resetsAt,
            // Onboarding questionnaire state — this response is the app's one
            // "chrome" fetch, so the wizard's trigger rides it for free.
            //
            // 'pre_existing' means "was already using the app when onboarding
            // shipped", not a choice the user made, so it doesn't count as
            // having answered: an account that empties its recipe list still
            // qualifies. Only a real 'completed' or 'skipped' outcome stops the
            // questionnaire being offered again — which is what keeps "Reset
            // recipes" from ambushing someone who already said no.
            onboardingNeeded:
                onboarding != null &&
                (onboarding.onboarded_at == null ||
                    onboarding.onboarding_outcome === "pre_existing") &&
                !onboarding.has_recipes,
            onboardingOutcome: onboarding?.onboarding_outcome ?? null,
            foodPrefs: onboarding?.food_prefs ?? null,
            dietaryRule: onboarding?.dietary_rule ?? null,
        });
    } catch (error) {
        next(error);
    }
}

async function deleteShoppingList(req, res, next) {
    try {
        await db.deleteShoppingList(req.householdId);
        await db.removeIsOnMenuRecipes(req.householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

// §8.1 — close the loop after shopping: clear the draft list, the generated
// aisle list, and take every recipe off this week, ready for a fresh start.
// Composes existing queries; no schema change.
async function finishShop(req, res, next) {
    try {
        const householdId = req.householdId;
        await db.deleteShoppingList(householdId);
        await db.clearGeneratedShoppingList(householdId);
        await db.removeIsOnMenuRecipes(householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function createCustomProduct(req, res, next) {
    try {
        const formData = { custom_product: req.body.custom_product };
        const result = customProductSchema.safeParse(formData);

        if (!result.success) {
            return res.status(400).json({ errors: result.error.flatten().fieldErrors });
        }

        await db.createCustomProduct(result.data.custom_product, req.householdId);
        res.status(201).json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function updateCustomProductItem(req, res, next) {
    try {
        const formData = {
            custom_product_id: req.params.id,
            custom_product: req.body.custom_product,
        };
        const result = customProductSchema.safeParse(formData);

        await db.updateCustomProduct(result.data.custom_product_id, result.data.custom_product, req.householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function updateShoppingListItem(req, res, next) {
    try {
        const formData = {
            ingredient_id: req.params.id,
            ingredient_name: req.body.ingredient_name,
        };
        const result = recipeIngredientSchema.safeParse(formData);

        await db.updateIngredient(result.data.ingredient_id, result.data.ingredient_name, req.householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function deleteSingleShoppingListItem(req, res, next) {
    try {
        const result = shoppingListItemSchema.safeParse({ shoppingItemId: req.params.id });
        await db.removeSingleShoppingListItem(result.data.shoppingItemId, req.householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function removeRecipeFromShoppingList(req, res, next) {
    try {
        await db.removeRecipeFromShoppingList(req.params.id, req.householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

// "Generate list by aisle". Free at every tier (weight 0 — the ledger row is
// kept for the usage curve and the cache hit rate), still burst-capped. The
// aisle cache (lib/ingredients/organise.js) places almost everything without a
// model; only genuine misses go to Haiku, in one call.
async function organiseShoppingList(req, res, next) {
    let ledger = null;
    try {
        const householdId = req.householdId;

        ledger = await startAiAction(req, res, {
            action: "aisle",
            burstLimit: AISLE_LIMIT,
            burstMessage: "Aisle-sort limit reached — 20 per 6 hours. Try again later.",
        });
        if (!ledger) return;

        const shoppingList = await db.getShoppingListItems(householdId);
        const { items, stats } = await organiseList(shoppingList, { ledger });

        await db.createShoppingListByAisles(items, householdId);
        await ledger.settle("ok", { meta: stats });
        db.recordEvent("list_generated", {
            userId: req.user.id,
            householdId,
            meta: { lines: stats.lines, hits: stats.hits, misses: stats.misses, model_calls: stats.modelCalls },
        });
        res.json({ success: true, stats });
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

async function parseIngredientsWithAI(req, res, next) {
    let ledger = null;
    try {
        const householdId = req.householdId;
        const rawText = req.body.ingredients_text;
        if (!rawText || !rawText.trim()) {
            return res.status(400).json({ error: "No ingredients text provided" });
        }

        // Free (credits 0, no weekly check) but logged and burst-capped.
        ledger = await startAiAction(req, res, {
            action: "parse",
            credits: 0,
            weekly: false,
            burstLimit: PARSE_LIMIT,
            burstMessage: "That's a lot of pasting — try again in a few hours.",
        });
        if (!ledger) return;

        const message = await runModel(ledger, {
            model: AI_MODEL,
            max_tokens: 1024,
            messages: [
                {
                    role: "user",
                    content: `You are a helpful shopping assistant. The user has pasted a list of ingredients or shopping items as raw text.
Parse the text and extract each individual item as a clean, simple string (e.g. "2 chicken breasts", "olive oil", "500g pasta").
Remove any bullet points, numbers used as list markers, or other formatting characters.
Return ONLY a JSON array of strings with no other text, markdown, or code fences.
Example output: ["2 chicken breasts", "olive oil", "500g pasta"]
Raw text: ${rawText}`,
                },
            ],
        });

        const responseText = textOf(message);

        let items;
        try {
            items = JSON.parse(responseText);
        } catch {
            items = JSON.parse(jsonrepair(responseText));
        }

        if (!Array.isArray(items)) {
            await ledger.settle("failed", { errorCode: "unparseable" });
            return res.status(500).json({ error: "Unexpected response format from AI" });
        }

        const addedItems = [];
        for (const item of items) {
            const trimmed = String(item ?? "").trim();
            if (trimmed) {
                await db.createCustomProduct(trimmed, householdId);
                const row = await db.getCustomProductByName(trimmed, householdId);
                if (row) addedItems.push(row);
            }
        }

        await ledger.settle("ok", { meta: { items: addedItems.length } });
        res.json({ success: true, items: addedItems });
    } catch (error) {
        if (ledger) await ledger.fail(error);
        next(error);
    }
}

module.exports = {
    createShoppingList,
    getShoppingList,
    deleteShoppingList,
    finishShop,
    createCustomProduct,
    updateShoppingListItem,
    updateCustomProductItem,
    deleteSingleShoppingListItem,
    removeRecipeFromShoppingList,
    organiseShoppingList,
    parseIngredientsWithAI,
};
