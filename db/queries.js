const pool = require("./pool");

async function getAllRecipes(userId) {
    const { rows } = await pool.query(
        "SELECT * FROM recipes WHERE user_id = $1 ORDER BY id",
        [userId],
    );
    return rows;
}

async function createSingleTag(tagTitle) {
    const { rows } = await pool.query("SELECT * FROM tags WHERE name = $1", [
        tagTitle,
    ]);
    if (rows.length > 0) {
        return rows[0].id;
    } else {
        try {
            await pool.query("INSERT INTO tags (name) VALUES ($1)", [tagTitle]);
            const { rows } = await pool.query(
                "SELECT * FROM tags WHERE name = $1",
                [tagTitle],
            );
            return rows[0].id;
        } catch (error) {
            console.error(error);
        }
    }
}

async function createSingleIngredient(ingredient) {
    const { rows } = await pool.query(
        `INSERT INTO ingredients (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [ingredient],
    );
    return rows[0].id;
}

async function createRecipe(data, userId) {
    const {
        recipe_title,
        recipe_description,
        recipe_instructions,
        recipe_link_url,
        prep_time_minutes,
        cook_time_minutes,
        ingredient_name,
        ingredient_quantity,
        ingredient_unit,
        tags,
    } = data;

    const ingredientIds = await Promise.all(
        ingredient_name.map((ingredient) =>
            createSingleIngredient(ingredient.toLowerCase()),
        ),
    );

    const tagIds = await Promise.all(tags.map((tag) => createSingleTag(tag)));

    try {
        const { rows } = await pool.query(
            "INSERT INTO recipes (title, description, instructions, link_url, prep_time_minutes, cook_time_minutes, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
                userId,
            ],
        );
        const recipeId = rows[0].id;

        for (let i = 0; i < ingredientIds.length; i++) {
            await pool.query(
                "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
                [
                    recipeId,
                    ingredientIds[i],
                    ingredient_quantity[i],
                    ingredient_unit[i],
                ],
            );
        }
        for (let i = 0; i < tagIds.length; i++) {
            await pool.query(
                "INSERT INTO recipe_tags (tag_id, recipe_id) VALUES ($1, $2)",
                [tagIds[i], recipeId],
            );
        }
        return;
    } catch (error) {
        console.error(error);
    }
}

async function deleteRecipe(recipeId, userId) {
    await pool.query("DELETE FROM recipes WHERE id = $1 AND user_id = $2", [
        recipeId,
        userId,
    ]);
}

async function findOneRecipe(recipeId, userId) {
    const { rows } = await pool.query(
        "SELECT * FROM recipes WHERE id = $1 AND user_id = $2",
        [recipeId, userId],
    );
    return rows[0];
}

async function getRecipeIngredients(recipeId) {
    const { rows } = await pool.query(
        "SELECT recipes.title, ingredients.name, recipe_ingredients.quantity, recipe_ingredients.unit FROM ingredients INNER JOIN recipe_ingredients ON recipe_ingredients.ingredient_id = ingredients.id INNER JOIN recipes ON recipes.id = recipe_ingredients.recipe_id WHERE recipe_ingredients.recipe_id = $1;",
        [recipeId],
    );
    return rows;
}

async function getAllTags() {
    const { rows } = await pool.query("SELECT * FROM tags");
    return rows;
}

async function getSingleRecipeTags(userId) {
    const { rows } = await pool.query(
        `SELECT recipes.title AS tag_recipe_title, tags.name
         FROM recipe_tags
         INNER JOIN recipes ON recipes.id = recipe_tags.recipe_id
         INNER JOIN tags ON tags.id = recipe_tags.tag_id
         WHERE recipes.user_id = $1;`,
        [userId],
    );
    return rows;
}

async function getSingleRecipeIngredients(userId) {
    const { rows } = await pool.query(
        `SELECT title AS recipe_title, ingredients.name AS ingredient, ingredients.id AS ingredient_id, recipe_ingredients.quantity, recipe_ingredients.unit
         FROM recipe_ingredients
         INNER JOIN recipes ON recipes.id = recipe_ingredients.recipe_id
         INNER JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
         WHERE recipes.user_id = $1;`,
        [userId],
    );
    return rows;
}

async function updateRecipe(data, recipeId, userId) {
    try {
        const {
            recipe_title,
            recipe_description,
            recipe_instructions,
            recipe_link_url,
            prep_time_minutes,
            cook_time_minutes,
            ingredient_name,
            ingredient_quantity,
            ingredient_unit,
            tags,
        } = data;

        await pool.query(
            `UPDATE recipes
             SET title = $1, description = $2, instructions = $3,
                 link_url = $4, prep_time_minutes = $5, cook_time_minutes = $6
             WHERE id = $7 AND user_id = $8`,
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
                recipeId,
                userId,
            ],
        );
        await pool.query(
            "DELETE FROM recipe_ingredients WHERE recipe_id = $1",
            [recipeId],
        );
        await pool.query("DELETE FROM recipe_tags WHERE recipe_id = $1", [
            recipeId,
        ]);

        const ingredientIds = await Promise.all(
            ingredient_name.map((ingredient) =>
                createSingleIngredient(ingredient.toLowerCase()),
            ),
        );

        const tagIds = await Promise.all(
            tags.map((tag) => createSingleTag(tag)),
        );
        for (let i = 0; i < ingredientIds.length; i++) {
            await pool.query(
                "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
                [
                    recipeId,
                    ingredientIds[i],
                    ingredient_quantity[i],
                    ingredient_unit[i],
                ],
            );
        }
        for (let i = 0; i < tagIds.length; i++) {
            await pool.query(
                "INSERT INTO recipe_tags (tag_id, recipe_id) VALUES ($1, $2)",
                [tagIds[i], recipeId],
            );
        }
        return;
    } catch (error) {
        console.error(error);
    }
}

// ========= SINGLE RECIPE PAGE QUERIES ========= //

async function getRecipeTags(recipeId) {
    const { rows } = await pool.query(
        "SELECT tags.name AS tag_name, recipes.id AS recipe_id FROM recipe_tags INNER JOIN tags ON tags.id = recipe_tags.tag_id INNER JOIN recipes ON recipes.id = recipe_tags.recipe_id WHERE recipes.id = $1;",
        [recipeId],
    );
    return rows;
}

// ========= SHOPPING LIST & MENU QUERIES ========= //

async function getShoppingListIngredientsByRecipe(userId) {
    const { rows } = await pool.query(
        `SELECT shopping_list_recipes.recipe_id, shopping_list.ingredient_name
         FROM shopping_list
         INNER JOIN shopping_list_recipes ON shopping_list.id = shopping_list_recipes.shopping_list_id
         WHERE shopping_list.ingredient_name IS NOT NULL AND shopping_list.user_id = $1`,
        [userId],
    );
    return rows;
}

async function createSingleRecipeShoppingListItem(ingredientName, recipeId, userId) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE ingredient_name = $1 AND user_id = $2",
        [ingredientName, userId],
    );

    if (rows.length < 1) {
        const ingredient = await pool.query(
            "INSERT INTO shopping_list (custom_product, ingredient_name, user_id) VALUES (null, $1, $2) RETURNING id;",
            [ingredientName, userId],
        );
        await pool.query(
            "INSERT INTO shopping_list_recipes (shopping_list_id, recipe_id) VALUES ($1, $2)",
            [ingredient.rows[0].id, recipeId],
        );
    } else {
        await pool.query(
            "INSERT INTO shopping_list_recipes (shopping_list_id, recipe_id) VALUES ($1, $2)",
            [rows[0].id, recipeId],
        );
    }
}

async function allRecipesOnMenu(userId) {
    const { rows } = await pool.query(
        "SELECT * FROM recipes WHERE is_on_menu = true AND user_id = $1",
        [userId],
    );
    return rows;
}

async function addRecipeToMenu(recipeId, userId) {
    await pool.query(
        "UPDATE recipes SET is_on_menu = true WHERE recipes.id = $1 AND user_id = $2;",
        [recipeId, userId],
    );
}

async function createShoppingList(recipeIngredientNames, userId) {
    await Promise.all([
        ...recipeIngredientNames.ingredients.map((ingredientName) =>
            createSingleRecipeShoppingListItem(
                ingredientName,
                recipeIngredientNames.recipeId,
                userId,
            ),
        ),
        addRecipeToMenu(recipeIngredientNames.recipeId, userId),
    ]);
}

async function getShoppingListItems(userId) {
    const { rows } = await pool.query(
        `SELECT shopping_list.*, COUNT(shopping_list_recipes.id) AS recipe_count
         FROM shopping_list
         LEFT JOIN shopping_list_recipes ON shopping_list.id = shopping_list_recipes.shopping_list_id
         WHERE shopping_list.user_id = $1
         GROUP BY shopping_list.id
         ORDER BY shopping_list.id;`,
        [userId],
    );
    return rows;
}

async function deleteShoppingList(userId) {
    await pool.query("DELETE FROM shopping_list WHERE user_id = $1", [userId]);
}

async function removeIsOnMenuRecipes(userId) {
    await pool.query("UPDATE recipes SET is_on_menu = false WHERE user_id = $1", [userId]);
}

async function clearGeneratedShoppingList(userId) {
    await pool.query("DELETE FROM generated_shopping_list WHERE user_id = $1", [userId]);
}

async function createCustomProduct(customProduct, userId) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE custom_product = $1 AND user_id = $2",
        [customProduct, userId],
    );

    if (rows.length < 1) {
        await pool.query(
            "INSERT INTO shopping_list (custom_product, ingredient_name, user_id) VALUES ($1, null, $2);",
            [customProduct, userId],
        );
    }
}

async function getCustomProductByName(customProduct, userId) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE custom_product = $1 AND user_id = $2",
        [customProduct, userId],
    );
    return rows[0] || null;
}

async function updateIngredient(shoppingItemId, newShoppingItemTitle, userId) {
    await pool.query(
        "UPDATE shopping_list SET ingredient_name = $1 WHERE id = $2 AND user_id = $3",
        [newShoppingItemTitle, shoppingItemId, userId],
    );
}

async function updateCustomProduct(customProductId, customProduct, userId) {
    await pool.query(
        "UPDATE shopping_list SET custom_product = $1 WHERE id = $2 AND user_id = $3",
        [customProduct, customProductId, userId],
    );
}

async function removeSingleShoppingListItem(shoppingListItemId, userId) {
    await pool.query(
        "DELETE FROM shopping_list WHERE id = $1 AND user_id = $2",
        [shoppingListItemId, userId],
    );
}

async function checkForDuplicateIngredients(recipeIngredient) {
    const ingredientCount = await pool.query(
        "SELECT COUNT(*) FROM shopping_list_recipes WHERE shopping_list_id = $1",
        [recipeIngredient],
    );
    return parseInt(ingredientCount.rows[0].count);
}

async function removeRecipeFromShoppingList(recipeId, userId) {
    try {
        await pool.query(
            "UPDATE recipes SET is_on_menu = false WHERE id = $1 AND user_id = $2",
            [recipeId, userId],
        );

        const { rows: recipesShoppingListItemIdsRows } = await pool.query(
            "SELECT shopping_list_id FROM shopping_list_recipes WHERE recipe_id = $1",
            [recipeId],
        );
        for (const row of recipesShoppingListItemIdsRows) {
            const ingredientCount = await checkForDuplicateIngredients(
                row.shopping_list_id,
            );
            if (ingredientCount < 2) {
                await pool.query(
                    "DELETE FROM shopping_list WHERE id = $1 AND user_id = $2",
                    [row.shopping_list_id, userId],
                );
            }
        }

        await pool.query(
            "DELETE FROM shopping_list_recipes WHERE recipe_id = $1;",
            [recipeId],
        );
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function addSingleItemToGeneratedList(product, userId) {
    await pool.query(
        "INSERT INTO generated_shopping_list (product_name, aisle_name, recipe_count, is_custom_product, quantity, user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
            product.product,
            product.aisle,
            product.recipe_count,
            product.is_custom_product,
            product.quantity,
            userId,
        ],
    );
}

// §8.2a — append a single "forgot something" item to the generated list
// without regenerating. Dropped in an "Other" aisle. ON CONFLICT guards the
// global unique constraint on product_name.
async function addForgottenItemToGeneratedList(productName, userId) {
    await pool.query(
        `INSERT INTO generated_shopping_list
             (product_name, aisle_name, recipe_count, is_custom_product, quantity, user_id)
         VALUES ($1, 'Other', '0', true, '1', $2)
         ON CONFLICT (product_name) DO NOTHING`,
        [productName, userId],
    );
}

async function createShoppingListByAisles(generatedShoppingItems, userId) {
    try {
        await pool.query(
            "DELETE FROM generated_shopping_list WHERE user_id = $1",
            [userId],
        );
        await Promise.all(
            generatedShoppingItems.items.map((product) =>
                addSingleItemToGeneratedList(product, userId),
            ),
        );
    } catch (error) {
        console.log(error);
        throw error;
    }
}

async function getGeneratedShoppingListItems(userId) {
    const { rows } = await pool.query(
        "SELECT * FROM generated_shopping_list WHERE user_id = $1",
        [userId],
    );
    return rows;
}

async function toggleCollected(productId, status, userId) {
    await pool.query(
        "UPDATE generated_shopping_list SET is_collected = $2 WHERE id = $1 AND user_id = $3",
        [productId, status, userId],
    );
}

async function setRecipeFavorite(recipeId, favorite, userId) {
    await pool.query(
        "UPDATE recipes SET favorite = $2 WHERE id = $1 AND user_id = $3",
        [recipeId, favorite, userId],
    );
}

async function deleteProductItemBoth(productId, productName, userId) {
    await pool.query(
        "DELETE FROM generated_shopping_list WHERE id = $1 AND user_id = $2",
        [productId, userId],
    );
    await pool.query(
        "DELETE FROM shopping_list WHERE (LOWER(custom_product) = LOWER($1) OR LOWER(ingredient_name) = LOWER($1)) AND user_id = $2",
        [productName, userId],
    );
}

module.exports = {
    getAllRecipes,
    findOneRecipe,
    createRecipe,
    deleteRecipe,
    getRecipeIngredients,
    getAllTags,
    getSingleRecipeTags,
    getSingleRecipeIngredients,
    getShoppingListIngredientsByRecipe,
    createShoppingList,
    getShoppingListItems,
    deleteShoppingList,
    clearGeneratedShoppingList,
    allRecipesOnMenu,
    removeIsOnMenuRecipes,
    createCustomProduct,
    updateIngredient,
    updateCustomProduct,
    removeSingleShoppingListItem,
    removeRecipeFromShoppingList,
    getRecipeTags,
    updateRecipe,
    createShoppingListByAisles,
    addForgottenItemToGeneratedList,
    getGeneratedShoppingListItems,
    toggleCollected,
    setRecipeFavorite,
    deleteProductItemBoth,
    getCustomProductByName,
};
