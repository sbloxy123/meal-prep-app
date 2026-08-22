const db = require("../db/queries");
const { uploadFromUrl } = require("../lib/cloudinary");

// POST /recipes/:id/share — return (creating if needed) the share token for a
// recipe the caller's household owns. Idempotent: same recipe → same token.
async function shareRecipe(req, res, next) {
    try {
        const recipe = await db.findOneRecipe(req.params.id, req.householdId);
        if (!recipe) return res.status(404).json({ error: "Recipe not found" });

        const token = await db.getOrCreateShareToken(recipe.id, req.user.id);
        res.json({ token });
    } catch (error) {
        next(error);
    }
}

// GET /shared-recipe/:token — preview payload for a shared recipe. Any signed-in
// user may view it. 404 for an unknown token.
async function getSharedRecipe(req, res, next) {
    try {
        const recipe = await db.getSharedRecipeByToken(req.params.token);
        if (!recipe) return res.status(404).json({ error: "Shared recipe not found" });

        const ingredients = await db.getRecipeIngredients(recipe.id);

        res.json({
            title: recipe.title,
            description: recipe.description,
            instructions: recipe.instructions,
            ingredients: ingredients.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                unit: i.unit,
            })),
            prep_time_minutes: recipe.prep_time_minutes,
            cook_time_minutes: recipe.cook_time_minutes,
            servings: recipe.servings,
            calories: recipe.calories,
        });
    } catch (error) {
        next(error);
    }
}

// POST /shared-recipe/:token/save — copy a shared recipe into the caller's own
// household (tags + macros + image carried over, plus a "Shared" tag). Returns
// the new recipe id. 404 for an unknown token.
async function saveSharedRecipe(req, res, next) {
    try {
        const source = await db.getSharedRecipeByToken(req.params.token);
        if (!source) return res.status(404).json({ error: "Shared recipe not found" });

        const [ingredients, tags] = await Promise.all([
            db.getRecipeIngredients(source.id),
            db.getRecipeTags(source.id),
        ]);

        // Give the copy its own Cloudinary asset so deleting either recipe can't
        // remove the other's image. Falls back to the source refs when Cloudinary
        // isn't configured (deleteAsset is a no-op in that case anyway).
        let image_url = source.image_url;
        let image_public_id = source.image_public_id;
        if (source.image_url) {
            const uploaded = await uploadFromUrl(source.image_url);
            if (uploaded) {
                image_url = uploaded.image_url;
                image_public_id = uploaded.image_public_id;
            }
        }

        const tagNames = tags.map((t) => t.tag_name);
        if (!tagNames.includes("Shared")) tagNames.push("Shared");

        const data = {
            recipe_title: source.title,
            recipe_description: source.description,
            recipe_instructions: source.instructions,
            recipe_link_url: source.link_url,
            prep_time_minutes: source.prep_time_minutes,
            cook_time_minutes: source.cook_time_minutes,
            ingredient_name: ingredients.map((i) => i.name),
            ingredient_quantity: ingredients.map((i) => i.quantity),
            ingredient_unit: ingredients.map((i) => i.unit),
            tags: tagNames,
            image_url,
            image_public_id,
            servings: source.servings,
            calories: source.calories,
            protein_g: source.protein_g,
            carb_g: source.carb_g,
            fat_g: source.fat_g,
            macros_source: source.macros_source,
        };

        const id = await db.createRecipe(data, req.householdId, req.user.id);
        res.status(201).json({ id });
    } catch (error) {
        next(error);
    }
}

module.exports = { shareRecipe, getSharedRecipe, saveSharedRecipe };
