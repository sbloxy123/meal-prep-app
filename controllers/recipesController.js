const db = require("../db/queries");
const { recipeSchema } = require("../schemas/recipe.schema.js");

// get all recipes
async function getRecipes(req, res, next) {
    try {
        const allRecipes = await db.getAllRecipes();
        const allTags = await db.getAllTags();
        const singleRecipeTags = await db.getSingleRecipeTags();
        const singleRecipeIngredients = await db.getSingleRecipeIngredients();
        const shoppingListIngredientsByRecipe =
            await db.getShoppingListIngredientsByRecipe();

        // console.log(shoppingListIngredientsByRecipe);
        // console.log(singleRecipeIngredients);

        console.log(allRecipes[0]);

        res.render("index", {
            recipesPageTitle: "Our recipes",
            recipeItems: allRecipes,
            allTags,
            singleRecipeTags,
            singleRecipeIngredients,
            shoppingListIngredientsByRecipe,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
}

// create recipe
async function createRecipe(req, res, next) {
    try {
        const allRecipes = await db.getAllRecipes();
        const allTags = await db.getAllTags();
        const singleRecipeTags = await db.getSingleRecipeTags();
        const singleRecipeIngredients = await db.getSingleRecipeIngredients();

        const formData = {
            ...req.body,
            ingredient_name: [].concat(req.body.ingredient_name || []),
            ingredient_quantity: [].concat(req.body.ingredient_quantity || []),
            ingredient_unit: [].concat(req.body.ingredient_unit || []),
            tags: [].concat(req.body.tags || []),
        };

        const result = recipeSchema.safeParse(formData);
        // console.log("parsed schema result: ", result);

        if (!result.success) {
            return res.status(400).render("index", {
                errors: result.error.flatten().fieldErrors,
                oldData: req.body,
                recipeItems: allRecipes,
                allTags,
                singleRecipeTags,
                singleRecipeIngredients,
            });
        }

        const data = result.data;
        if (data.recipe_link_url) {
            data.recipe_link_url =
                "https://" + data.recipe_link_url.replace(/^https?:\/\//, "");
        }

        await db.createRecipe(data);

        res.redirect("/");
    } catch (error) {
        console.error(error);
        next(error);
    }
}
async function deleteRecipe(req, res, next) {
    try {
        const recipeId = req.params.id;
        await db.deleteRecipe(recipeId);
        if (req.headers.accept?.includes("application/json")) {
            return res.sendStatus(200);
        }
        res.redirect("/");
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function showSingleRecipe(req, res, next) {
    try {
        const recipeId = req.params.id;
        const selectedRecipe = await db.findOneRecipe(recipeId);
        const recipeIngredients = await db.getRecipeIngredients(recipeId);
        const recipeTags = await db.getRecipeTags(recipeId);

        const fullRecipe = {
            ...selectedRecipe,
            recipe_ingredients: recipeIngredients,
            recipe_tags: recipeTags,
        };

        res.render("singleRecipe", {
            editRecipesTitle: "Edit recipe",
            selectedRecipe: fullRecipe,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function getUpdateRecipeForm(req, res, next) {
    try {
        const recipeId = req.params.id;
        const selectedRecipe = await db.findOneRecipe(recipeId);
        const recipeIngredients = await db.getRecipeIngredients(recipeId);
        const recipeTags = await db.getRecipeTags(recipeId);
        const allTags = await db.getAllTags();
        // console.log(recipeTags);

        res.render("updateRecipe", {
            selectedRecipe,
            recipeIngredients,
            recipeTags,
            allTags,
        });
    } catch (error) {
        console.error(error);
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
            return res.status(400).render("index", {
                errors: result.error.flatten().fieldErrors,
                oldData: req.body,
                recipeItems: allRecipes,
                allTags,
                singleRecipeTags,
                singleRecipeIngredients,
            });
        }

        const data = result.data;
        if (data.recipe_link_url) {
            data.recipe_link_url =
                "https://" + data.recipe_link_url.replace(/^https?:\/\//, "");
        }

        await db.updateRecipe(data, recipeId);

        if (req.headers.accept?.includes("application/json")) {
            const [updatedIngredients, updatedTags] = await Promise.all([
                db.getRecipeIngredients(recipeId),
                db.getRecipeTags(recipeId),
            ]);
            return res.json({
                ok: true,
                title: data.recipe_title,
                description: data.recipe_description,
                ingredients: updatedIngredients,
                tags: updatedTags,
            });
        }

        res.redirect(`/recipes/${recipeId}`);
    } catch (error) {
        console.error(error);
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
    getUpdateRecipeForm,
    updateRecipe,
    markRecipeAsFavorite,
};
