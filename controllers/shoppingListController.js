const db = require("../db/queries");
const Anthropic = require("@anthropic-ai/sdk");
const { jsonrepair } = require("jsonrepair");
const client = new Anthropic();

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

        await db.createShoppingList(result.data, req.user.id);
        res.status(201).json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function getShoppingList(req, res, next) {
    try {
        const userId = req.user.id;
        const [shoppingList, allRecipesOnMenu, singleRecipeIngredients, singleRecipeTags, allTags, shoppingListIngredientsByRecipe] =
            await Promise.all([
                db.getShoppingListItems(userId),
                db.allRecipesOnMenu(userId),
                db.getSingleRecipeIngredients(userId),
                db.getSingleRecipeTags(userId),
                db.getAllTags(),
                db.getShoppingListIngredientsByRecipe(userId),
            ]);

        res.json({
            shoppingList,
            allRecipesOnMenu,
            singleRecipeIngredients,
            singleRecipeTags,
            allTags,
            shoppingListIngredientsByRecipe,
        });
    } catch (error) {
        next(error);
    }
}

async function deleteShoppingList(req, res, next) {
    try {
        await db.deleteShoppingList(req.user.id);
        await db.removeIsOnMenuRecipes(req.user.id);
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
        const userId = req.user.id;
        await db.deleteShoppingList(userId);
        await db.clearGeneratedShoppingList(userId);
        await db.removeIsOnMenuRecipes(userId);
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

        await db.createCustomProduct(result.data.custom_product, req.user.id);
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

        await db.updateCustomProduct(result.data.custom_product_id, result.data.custom_product, req.user.id);
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

        await db.updateIngredient(result.data.ingredient_id, result.data.ingredient_name, req.user.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function deleteSingleShoppingListItem(req, res, next) {
    try {
        const result = shoppingListItemSchema.safeParse({ shoppingItemId: req.params.id });
        await db.removeSingleShoppingListItem(result.data.shoppingItemId, req.user.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function removeRecipeFromShoppingList(req, res, next) {
    try {
        await db.removeRecipeFromShoppingList(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function organiseShoppingList(req, res, next) {
    try {
        const userId = req.user.id;
        const shoppingList = await db.getShoppingListItems(userId);

        const formattedList = shoppingList.map((item) => ({
            name: item.ingredient_name || item.custom_product,
            recipe_count: item.recipe_count,
            is_custom_product: item.quantity === 0 || item.quantity === "0",
        }));

        const message = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4096,
            messages: [
                {
                    role: "user",
                    content: `You are a helpful shopping assistant.
                        Organise the following shopping list into UK supermarket aisles.
                        If the recipe's recipe_count is 0, mark is_custom_produt to true
                        Return ONLY valid raw JSON with no other text, or wrapping in markdown code fences or backticks. If the item has additional text such as 'x3' or 'x 4' etc, please use your initiative and add it to the quantity property. Use quantity of 1 if nothing is specified. If an item appears for both is_custom_product: true AND false, please just update the existing item.quantity by the relevant amount.
                        If an item is a herb plant, put it in the fresh produce supermarket aisle.
                        Please make sure the JSON response from Claude doesn't contain unescaped quotes or newlines in the product names.
                        Please use exactly this structure:
                        {
                            items: [
                                "product" : "string",
                                "quantity" : "string",
                                "aisle" : "string",
                                "recipe_count": number,
                                "is_custom_product" : boolean
                            ]
                        }
                        Shopping list: ${JSON.stringify(formattedList)}`,
                },
            ],
        });

        const rawText = message.content[0].text
            .replace(/^```json\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

        console.log("[organiseShoppingList] Raw Claude response:", rawText);

        let result;
        try {
            result = JSON.parse(rawText);
        } catch (parseError) {
            try {
                result = JSON.parse(jsonrepair(rawText));
            } catch (repairError) {
                console.error("[organiseShoppingList] JSON parse failed:", repairError.message);
                return res.status(400).json({
                    error: "Failed to parse Claude response as JSON",
                    details: repairError.message,
                });
            }
        }

        await db.createShoppingListByAisles(result, userId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function parseIngredientsWithAI(req, res, next) {
    try {
        const userId = req.user.id;
        const rawText = req.body.ingredients_text;
        if (!rawText || !rawText.trim()) {
            return res.status(400).json({ error: "No ingredients text provided" });
        }

        const message = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
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

        const responseText = message.content[0].text
            .replace(/^```json\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

        let items;
        try {
            items = JSON.parse(responseText);
        } catch {
            items = JSON.parse(jsonrepair(responseText));
        }

        if (!Array.isArray(items)) {
            return res.status(500).json({ error: "Unexpected response format from AI" });
        }

        const addedItems = [];
        for (const item of items) {
            const trimmed = item.trim();
            if (trimmed) {
                await db.createCustomProduct(trimmed, userId);
                const row = await db.getCustomProductByName(trimmed, userId);
                if (row) addedItems.push(row);
            }
        }

        res.json({ success: true, items: addedItems });
    } catch (error) {
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
