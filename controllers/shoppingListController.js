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
        const allRecipes = await db.getAllRecipes();
        const allTags = await db.getAllTags();
        const singleRecipeTags = await db.getSingleRecipeTags();
        const singleRecipeIngredients = await db.getSingleRecipeIngredients();

        // move this to a middleware later - /middleware/validate.js
        // console.log("req.body: ", req.body);

        const formData = {
            ingredients: [].concat(req.body.ingredients || []),
            recipeId: req.body.recipeId,
        };
        const result = recipeShoppingListSchema.safeParse(formData);
        // console.log("parsed schema result: ", result);

        if (!result.success) {
            return res.status(400).render("index", {
                errors: result.error.flatten().fieldErrors,
                oldData: req.body,
                recipesPageTitle: "Our recipes",
                recipeItems: allRecipes,
                allTags,
                singleRecipeTags,
                singleRecipeIngredients,
            });
        }

        const data = result.data;
        // console.log("shopping list ingredients data", data);
        await db.createShoppingList(data);

        res.redirect("/");
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function getShoppingList(req, res, next) {
    const allRecipesOnMenu = await db.allRecipesOnMenu();
    const singleRecipeIngredients = await db.getSingleRecipeIngredients();
    const singleRecipeTags = await db.getSingleRecipeTags();
    const allTags = await db.getAllTags();
    const shoppingList = await db.getShoppingListItems();
    const shoppingListIngredientsByRecipe =
        await db.getShoppingListIngredientsByRecipe();

    // todo - set up api to pull in data from google keep?

    try {
        res.render("shoppingList", {
            shoppingListPageTitle: "Shopping Items",
            shoppingList: shoppingList,
            allRecipesOnMenu: allRecipesOnMenu,
            singleRecipeIngredients: singleRecipeIngredients,
            singleRecipeTags: singleRecipeTags,
            allTags,
            shoppingListIngredientsByRecipe,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function deleteShoppingList(req, res, next) {
    try {
        await db.deleteShoppingList();
        await db.removeIsOnMenuRecipes();
        res.redirect("/");
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function createCustomProduct(req, res, next) {
    try {
        const allRecipes = await db.getAllRecipes();
        const allTags = await db.getAllTags();
        const singleRecipeTags = await db.getSingleRecipeTags();
        const singleRecipeIngredients = await db.getSingleRecipeIngredients();

        const formData = {
            custom_product: req.body.custom_product,
        };
        const result = customProductSchema.safeParse(formData);

        if (!result.success) {
            return res.status(400).render("index", {
                errors: result.error.flatten().fieldErrors,
                oldData: req.body,
                recipesPageTitle: "Our recipes",
                recipeItems: allRecipes,
                allTags,
                singleRecipeTags,
                singleRecipeIngredients,
            });
        }
        const data = result.data;

        await db.createCustomProduct(data.custom_product);
        res.redirect("/shopping-list");
    } catch (error) {
        console.error(error);
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

        const data = result.data;
        await db.updateCustomProduct(
            data.custom_product_id,
            data.custom_product,
        );
        res.redirect("/shopping-list");
    } catch (error) {
        console.error(error);
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

        const data = result.data;
        await db.updateIngredient(data.ingredient_id, data.ingredient_name);
        res.redirect("/shopping-list");
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function deleteSingleShoppingListItem(req, res, next) {
    try {
        const formData = {
            shoppingItemId: req.params.id,
        };
        const result = shoppingListItemSchema.safeParse(formData);
        const data = result.data;
        // console.log(data);
        await db.removeSingleShoppingListItem(data.shoppingItemId);
        res.redirect("/shopping-list");
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function removeRecipeFromShoppingList(req, res, next) {
    try {
        const recipeId = req.params.id;
        await db.removeRecipeFromShoppingList(recipeId);
        res.redirect("/");
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function organiseShoppingList(req, res, next) {
    try {
        const shoppingList = await db.getShoppingListItems();

        const formattedList = shoppingList.map((item) => ({
            name: item.ingredient_name || item.custom_product,
            recipe_count: item.recipe_count,
            is_custom_product: item.quantity === 0 || item.quantity === "0",
        }));

        // todo: pull this data into database so it can be stored
        // ~ idea - add associated meals so user can see what the ingredient is for

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
        // res.json({ result: message.content[0].text });
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
                console.error(
                    "[organiseShoppingList] JSON parse failed:",
                    repairError.message,
                );
                console.error(
                    "[organiseShoppingList] Raw text that failed to parse:",
                    rawText,
                );
                return res.status(400).json({
                    error: "Failed to parse Claude response as JSON",
                    details: repairError.message,
                    rawResponse: rawText,
                });
            }
        }

        // result = {
        //     items: [
        //         {
        //             product: "eggs",
        //             quantity: "",
        //             aisle: "Dairy & Eggs",
        //             recipe_count: 2,
        //             is_custom_product: false,
        //         },
        //         {
        //             product: "chicken",
        //             quantity: "",
        //             aisle: "Fresh Meat & Poultry",
        //             recipe_count: 1,
        //             is_custom_product: false,
        //         },
        //         {
        //             product: "Peas",
        //             quantity: "",
        //             aisle: "Frozen Vegetables",
        //             recipe_count: 0,
        //             is_custom_product: true,
        //         },
        //         {
        //             product: "Pea",
        //             quantity: "",
        //             aisle: "Frozen Vegetables",
        //             recipe_count: 0,
        //             is_custom_product: true,
        //         },
        //         {
        //             product: "beef",
        //             quantity: "",
        //             aisle: "Fresh Meat & Poultry",
        //             recipe_count: 1,
        //             is_custom_product: false,
        //         },
        //         {
        //             product: "sausages",
        //             quantity: "",
        //             aisle: "Fresh Meat & Poultry",
        //             recipe_count: 0,
        //             is_custom_product: true,
        //         },
        //         {
        //             product: "cooking oil",
        //             quantity: "",
        //             aisle: "Oils & Condiments",
        //             recipe_count: 0,
        //             is_custom_product: true,
        //         },
        //     ],
        // };
        // console.log(result);

        await db.createShoppingListByAisles(result);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    createShoppingList,
    getShoppingList,
    deleteShoppingList,
    createCustomProduct,
    updateShoppingListItem,
    updateCustomProductItem,
    deleteSingleShoppingListItem,
    removeRecipeFromShoppingList,
    organiseShoppingList,
};
