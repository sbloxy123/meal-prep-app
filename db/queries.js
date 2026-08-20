const pool = require("./pool");

// ========= HOUSEHOLD RESOLUTION ========= //
// Data is scoped by household, not by user. requireAuth resolves the caller's
// household id once per request and passes it to the queries below.

async function getHouseholdIdForUser(userId) {
    const { rows } = await pool.query(
        "SELECT household_id FROM household_member WHERE user_id = $1 LIMIT 1",
        [userId],
    );
    return rows[0]?.household_id ?? null;
}

// Resolve the user's household, creating one (with them as owner) on first use.
// New users have no household until their first authenticated request.
async function ensureHouseholdForUser(userId, displayName) {
    const existing = await getHouseholdIdForUser(userId);
    if (existing) return existing;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            "INSERT INTO household (name) VALUES ($1) RETURNING id",
            [displayName ? `${displayName}'s kitchen` : null],
        );
        const householdId = rows[0].id;
        const member = await client.query(
            `INSERT INTO household_member (household_id, user_id, role)
             VALUES ($1, $2, 'owner')
             ON CONFLICT (user_id) DO NOTHING`,
            [householdId, userId],
        );
        // If the membership insert was a no-op, a concurrent request already
        // created this user's household — roll back so we don't orphan the row.
        if (member.rowCount === 0) {
            await client.query("ROLLBACK");
        } else {
            await client.query("COMMIT");
        }
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
    return await getHouseholdIdForUser(userId);
}

// ========= RECIPES ========= //

async function getAllRecipes(householdId) {
    const { rows } = await pool.query(
        "SELECT * FROM recipes WHERE household_id = $1 ORDER BY id",
        [householdId],
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

async function createRecipe(data, householdId, userId) {
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
        image_url,
        image_public_id,
    } = data;

    const ingredientIds = await Promise.all(
        ingredient_name.map((ingredient) =>
            createSingleIngredient(ingredient.toLowerCase()),
        ),
    );

    const tagIds = await Promise.all(tags.map((tag) => createSingleTag(tag)));

    try {
        const { rows } = await pool.query(
            "INSERT INTO recipes (title, description, instructions, link_url, prep_time_minutes, cook_time_minutes, image_url, image_public_id, household_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
                image_url ?? null,
                image_public_id ?? null,
                householdId,
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

async function deleteRecipe(recipeId, householdId) {
    await pool.query("DELETE FROM recipes WHERE id = $1 AND household_id = $2", [
        recipeId,
        householdId,
    ]);
}

async function findOneRecipe(recipeId, householdId) {
    const { rows } = await pool.query(
        "SELECT * FROM recipes WHERE id = $1 AND household_id = $2",
        [recipeId, householdId],
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

// Collections available to a household = the distinct tags used by its recipes.
// Previously this returned every tag in the system (a cross-household leak).
async function getAllTags(householdId) {
    const { rows } = await pool.query(
        `SELECT DISTINCT tags.id, tags.name
         FROM tags
         INNER JOIN recipe_tags ON recipe_tags.tag_id = tags.id
         INNER JOIN recipes ON recipes.id = recipe_tags.recipe_id
         WHERE recipes.household_id = $1
         ORDER BY tags.name;`,
        [householdId],
    );
    return rows;
}

async function getSingleRecipeTags(householdId) {
    const { rows } = await pool.query(
        `SELECT recipes.title AS tag_recipe_title, tags.name
         FROM recipe_tags
         INNER JOIN recipes ON recipes.id = recipe_tags.recipe_id
         INNER JOIN tags ON tags.id = recipe_tags.tag_id
         WHERE recipes.household_id = $1;`,
        [householdId],
    );
    return rows;
}

async function getSingleRecipeIngredients(householdId) {
    const { rows } = await pool.query(
        `SELECT title AS recipe_title, ingredients.name AS ingredient, ingredients.id AS ingredient_id, recipe_ingredients.quantity, recipe_ingredients.unit
         FROM recipe_ingredients
         INNER JOIN recipes ON recipes.id = recipe_ingredients.recipe_id
         INNER JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
         WHERE recipes.household_id = $1;`,
        [householdId],
    );
    return rows;
}

async function updateRecipe(data, recipeId, householdId) {
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
            image_url,
            image_public_id,
        } = data;

        await pool.query(
            `UPDATE recipes
             SET title = $1, description = $2, instructions = $3,
                 link_url = $4, prep_time_minutes = $5, cook_time_minutes = $6,
                 image_url = $7, image_public_id = $8
             WHERE id = $9 AND household_id = $10`,
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
                image_url ?? null,
                image_public_id ?? null,
                recipeId,
                householdId,
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

async function getShoppingListIngredientsByRecipe(householdId) {
    const { rows } = await pool.query(
        `SELECT shopping_list_recipes.recipe_id, shopping_list.ingredient_name
         FROM shopping_list
         INNER JOIN shopping_list_recipes ON shopping_list.id = shopping_list_recipes.shopping_list_id
         WHERE shopping_list.ingredient_name IS NOT NULL AND shopping_list.household_id = $1`,
        [householdId],
    );
    return rows;
}

async function createSingleRecipeShoppingListItem(ingredientName, recipeId, householdId) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE ingredient_name = $1 AND household_id = $2",
        [ingredientName, householdId],
    );

    if (rows.length < 1) {
        const ingredient = await pool.query(
            "INSERT INTO shopping_list (custom_product, ingredient_name, household_id) VALUES (null, $1, $2) RETURNING id;",
            [ingredientName, householdId],
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

async function allRecipesOnMenu(householdId) {
    const { rows } = await pool.query(
        "SELECT * FROM recipes WHERE is_on_menu = true AND household_id = $1",
        [householdId],
    );
    return rows;
}

async function addRecipeToMenu(recipeId, householdId) {
    await pool.query(
        "UPDATE recipes SET is_on_menu = true WHERE recipes.id = $1 AND household_id = $2;",
        [recipeId, householdId],
    );
}

async function createShoppingList(recipeIngredientNames, householdId) {
    await Promise.all([
        ...recipeIngredientNames.ingredients.map((ingredientName) =>
            createSingleRecipeShoppingListItem(
                ingredientName,
                recipeIngredientNames.recipeId,
                householdId,
            ),
        ),
        addRecipeToMenu(recipeIngredientNames.recipeId, householdId),
    ]);
}

async function getShoppingListItems(householdId) {
    const { rows } = await pool.query(
        `SELECT shopping_list.*, COUNT(shopping_list_recipes.id) AS recipe_count
         FROM shopping_list
         LEFT JOIN shopping_list_recipes ON shopping_list.id = shopping_list_recipes.shopping_list_id
         WHERE shopping_list.household_id = $1
         GROUP BY shopping_list.id
         ORDER BY shopping_list.id;`,
        [householdId],
    );
    return rows;
}

async function deleteShoppingList(householdId) {
    await pool.query("DELETE FROM shopping_list WHERE household_id = $1", [householdId]);
}

async function removeIsOnMenuRecipes(householdId) {
    await pool.query("UPDATE recipes SET is_on_menu = false WHERE household_id = $1", [householdId]);
}

async function clearGeneratedShoppingList(householdId) {
    await pool.query("DELETE FROM generated_shopping_list WHERE household_id = $1", [householdId]);
}

async function createCustomProduct(customProduct, householdId) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE custom_product = $1 AND household_id = $2",
        [customProduct, householdId],
    );

    if (rows.length < 1) {
        await pool.query(
            "INSERT INTO shopping_list (custom_product, ingredient_name, household_id) VALUES ($1, null, $2);",
            [customProduct, householdId],
        );
    }
}

async function getCustomProductByName(customProduct, householdId) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE custom_product = $1 AND household_id = $2",
        [customProduct, householdId],
    );
    return rows[0] || null;
}

async function updateIngredient(shoppingItemId, newShoppingItemTitle, householdId) {
    await pool.query(
        "UPDATE shopping_list SET ingredient_name = $1 WHERE id = $2 AND household_id = $3",
        [newShoppingItemTitle, shoppingItemId, householdId],
    );
}

async function updateCustomProduct(customProductId, customProduct, householdId) {
    await pool.query(
        "UPDATE shopping_list SET custom_product = $1 WHERE id = $2 AND household_id = $3",
        [customProduct, customProductId, householdId],
    );
}

async function removeSingleShoppingListItem(shoppingListItemId, householdId) {
    await pool.query(
        "DELETE FROM shopping_list WHERE id = $1 AND household_id = $2",
        [shoppingListItemId, householdId],
    );
}

async function checkForDuplicateIngredients(recipeIngredient) {
    const ingredientCount = await pool.query(
        "SELECT COUNT(*) FROM shopping_list_recipes WHERE shopping_list_id = $1",
        [recipeIngredient],
    );
    return parseInt(ingredientCount.rows[0].count);
}

async function removeRecipeFromShoppingList(recipeId, householdId) {
    try {
        await pool.query(
            "UPDATE recipes SET is_on_menu = false WHERE id = $1 AND household_id = $2",
            [recipeId, householdId],
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
                    "DELETE FROM shopping_list WHERE id = $1 AND household_id = $2",
                    [row.shopping_list_id, householdId],
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

async function addSingleItemToGeneratedList(product, householdId) {
    await pool.query(
        "INSERT INTO generated_shopping_list (product_name, aisle_name, recipe_count, is_custom_product, quantity, household_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
            product.product,
            product.aisle,
            product.recipe_count,
            product.is_custom_product,
            product.quantity,
            householdId,
        ],
    );
}

// §8.2a — append a single "forgot something" item to the generated list
// without regenerating. Dropped in an "Other" aisle. The households migration
// drops the global unique(product_name), so ON CONFLICT no longer applies —
// guard against a duplicate within this household with WHERE NOT EXISTS.
async function addForgottenItemToGeneratedList(productName, householdId) {
    await pool.query(
        `INSERT INTO generated_shopping_list
             (product_name, aisle_name, recipe_count, is_custom_product, quantity, household_id)
         SELECT $1, 'Other', '0', true, '1', $2
         WHERE NOT EXISTS (
             SELECT 1 FROM generated_shopping_list
             WHERE product_name = $1 AND household_id = $2
         )`,
        [productName, householdId],
    );
}

async function createShoppingListByAisles(generatedShoppingItems, householdId) {
    try {
        await pool.query(
            "DELETE FROM generated_shopping_list WHERE household_id = $1",
            [householdId],
        );
        await Promise.all(
            generatedShoppingItems.items.map((product) =>
                addSingleItemToGeneratedList(product, householdId),
            ),
        );
    } catch (error) {
        console.log(error);
        throw error;
    }
}

async function getGeneratedShoppingListItems(householdId) {
    const { rows } = await pool.query(
        "SELECT * FROM generated_shopping_list WHERE household_id = $1",
        [householdId],
    );
    return rows;
}

async function toggleCollected(productId, status, householdId) {
    await pool.query(
        "UPDATE generated_shopping_list SET is_collected = $2 WHERE id = $1 AND household_id = $3",
        [productId, status, householdId],
    );
}

async function setRecipeFavorite(recipeId, favorite, householdId) {
    await pool.query(
        "UPDATE recipes SET favorite = $2 WHERE id = $1 AND household_id = $3",
        [recipeId, favorite, householdId],
    );
}

async function deleteProductItemBoth(productId, productName, householdId) {
    await pool.query(
        "DELETE FROM generated_shopping_list WHERE id = $1 AND household_id = $2",
        [productId, householdId],
    );
    await pool.query(
        "DELETE FROM shopping_list WHERE (LOWER(custom_product) = LOWER($1) OR LOWER(ingredient_name) = LOWER($1)) AND household_id = $2",
        [productName, householdId],
    );
}

module.exports = {
    getHouseholdIdForUser,
    ensureHouseholdForUser,
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
