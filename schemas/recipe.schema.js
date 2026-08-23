const { z } = require("zod");

const recipeSchema = z.object({
    recipe_title: z.string().min(1, "Title is required"),
    recipe_description: z.string().optional(),
    recipe_instructions: z.string().optional(),
    recipe_link_url: z.string().optional(),
    prep_time_minutes: z.coerce.number().optional(),
    cook_time_minutes: z.coerce.number().optional(),
    ingredient_name: z.array(z.string().optional()),
    ingredient_quantity: z.array(z.coerce.number().optional()),
    ingredient_unit: z.array(z.string().optional()),
    tags: z.array(z.string().optional()),
    // Cloudinary photo (§9) — set by the browser upload, both optional.
    image_url: z.string().optional(),
    image_public_id: z.string().optional(),
    // Nutrition macros (all optional, per serving unless noted). macros_source
    // records provenance: user-entered, scraped on import, or LLM-estimated.
    servings: z.coerce.number().int().optional(),
    calories: z.coerce.number().int().optional(),
    protein_g: z.coerce.number().optional(),
    carb_g: z.coerce.number().optional(),
    fat_g: z.coerce.number().optional(),
    macros_source: z.enum(["manual", "imported", "estimated"]).optional(),
});

// POST /recipes/import — the source URL to scrape.
const importUrlSchema = z.object({
    url: z.string().url(),
});

// POST /recipes/estimate-macros — a draft (unsaved) recipe to estimate from.
const estimateMacrosSchema = z.object({
    title: z.string().optional(),
    servings: z.coerce.number().int().optional(),
    ingredients: z.array(
        z.object({
            name: z.string(),
            quantity: z.string().optional(),
            unit: z.string().optional(),
        }),
    ),
});

// POST /recipes/improve — an AI pass over a draft recipe that fills in missing
// ingredient amounts, method and serving size, then re-estimates macros. Same
// ingredient shape as estimate-macros; title/instructions/description optional.
const improveRecipeSchema = z.object({
    title: z.string().optional(),
    servings: z.coerce.number().int().optional(),
    description: z.string().optional(),
    instructions: z.string().optional(),
    ingredients: z.array(
        z.object({
            name: z.string(),
            quantity: z.string().optional(),
            unit: z.string().optional(),
        }),
    ),
});

// POST /recipes/import-social — a social post URL (Instagram/TikTok/YouTube) or
// a pasted caption. At least one must be present.
const importSocialSchema = z
    .object({
        url: z.string().url().optional(),
        text: z.string().optional(),
    })
    .refine((d) => (d.url && d.url.trim()) || (d.text && d.text.trim()), {
        message: "A URL or caption text is required",
    });

// POST /recipes/parse-from-photo — 1–4 base64-encoded photos of a recipe.
// Images are read by Claude vision and discarded; nothing is persisted.
const parsePhotoSchema = z.object({
    images: z
        .array(
            z.object({
                media_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
                data: z.string().min(1),
            }),
        )
        .min(1)
        .max(4),
});

const recipeShoppingListSchema = z.object({
    ingredients: z.array(z.string().optional()),
    recipeId: z.coerce.number().optional(),
});
const shoppingListItemSchema = z.object({
    shoppingItemId: z.coerce.number().optional(),
    shoppingItemTitle: z.string().optional(),
});

const customProductSchema = z.object({
    custom_product_id: z.coerce.number().optional(),
    custom_product: z.string().optional(),
});
const recipeIngredientSchema = z.object({
    ingredient_id: z.coerce.number().optional(),
    ingredient_name: z.string().optional(),
});

module.exports = {
    recipeSchema,
    importUrlSchema,
    estimateMacrosSchema,
    improveRecipeSchema,
    importSocialSchema,
    parsePhotoSchema,
    recipeShoppingListSchema,
    customProductSchema,
    recipeIngredientSchema,
    shoppingListItemSchema,
};
