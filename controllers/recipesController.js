const db = require("../db/queries");
const { recipeSchema } = require("../schemas/recipe.schema.js");

async function getRecipes(req, res, next) {
    try {
        const [allRecipes, allTags, singleRecipeTags, singleRecipeIngredients, shoppingListIngredientsByRecipe] =
            await Promise.all([
                db.getAllRecipes(),
                db.getAllTags(),
                db.getSingleRecipeTags(),
                db.getSingleRecipeIngredients(),
                db.getShoppingListIngredientsByRecipe(),
            ]);

        res.json({
            recipes: allRecipes,
            tags: allTags,
            recipeTags: singleRecipeTags,
            recipeIngredients: singleRecipeIngredients,
            shoppingListIngredientsByRecipe,
        });
    } catch (error) {
        next(error);
    }
}

async function createRecipe(req, res, next) {
    try {
        const formData = {
            ...req.body,
            ingredient_name: [].concat(req.body.ingredient_name || []),
            ingredient_quantity: [].concat(req.body.ingredient_quantity || []),
            ingredient_unit: [].concat(req.body.ingredient_unit || []),
            tags: [].concat(req.body.tags || []),
        };

        const result = recipeSchema.safeParse(formData);

        if (!result.success) {
            return res.status(400).json({ errors: result.error.flatten().fieldErrors });
        }

        const data = result.data;
        if (data.recipe_link_url) {
            data.recipe_link_url =
                "https://" + data.recipe_link_url.replace(/^https?:\/\//, "");
        }

        await db.createRecipe(data);
        res.status(201).json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function deleteRecipe(req, res, next) {
    try {
        const recipeId = req.params.id;
        await db.deleteRecipe(recipeId);
        res.sendStatus(204);
    } catch (error) {
        next(error);
    }
}

async function showSingleRecipe(req, res, next) {
    try {
        const recipeId = req.params.id;
        const [selectedRecipe, recipeIngredients, recipeTags] = await Promise.all([
            db.findOneRecipe(recipeId),
            db.getRecipeIngredients(recipeId),
            db.getRecipeTags(recipeId),
        ]);

        if (!selectedRecipe) {
            return res.status(404).json({ error: "Recipe not found" });
        }

        res.json({
            ...selectedRecipe,
            recipe_ingredients: recipeIngredients,
            recipe_tags: recipeTags,
        });
    } catch (error) {
        next(error);
    }
}

async function updateRecipe(req, res, next) {
    try {
        const recipeId = req.params.id;
        const formData = {
            ...req.body,
            ingredient_name: [].concat(req.body.ingredient_name || []),
            ingredient_quantity: [].concat(req.body.ingredient_quantity || []),
            ingredient_unit: [].concat(req.body.ingredient_unit || []),
            tags: [].concat(req.body.tags || []),
        };

        const result = recipeSchema.safeParse(formData);

        if (!result.success) {
            return res.status(400).json({ errors: result.error.flatten().fieldErrors });
        }

        const data = result.data;
        if (data.recipe_link_url) {
            data.recipe_link_url =
                "https://" + data.recipe_link_url.replace(/^https?:\/\//, "");
        }

        await db.updateRecipe(data, recipeId);

        const [updatedIngredients, updatedTags] = await Promise.all([
            db.getRecipeIngredients(recipeId),
            db.getRecipeTags(recipeId),
        ]);

        res.json({
            ok: true,
            title: data.recipe_title,
            description: data.recipe_description,
            ingredients: updatedIngredients,
            tags: updatedTags,
        });
    } catch (error) {
        next(error);
    }
}

async function markRecipeAsFavorite(req, res, next) {
    try {
        const { id } = req.params;
        const { favorite } = req.body;
        await db.setRecipeFavorite(id, favorite);
        res.sendStatus(200);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getRecipes,
    showSingleRecipe,
    createRecipe,
    deleteRecipe,
    updateRecipe,
    markRecipeAsFavorite,
};
