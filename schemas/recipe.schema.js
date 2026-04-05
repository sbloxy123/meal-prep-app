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
    recipeShoppingListSchema,
    customProductSchema,
    recipeIngredientSchema,
    shoppingListItemSchema,
};
