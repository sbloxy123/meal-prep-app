const pool = require("./pool");

async function getAllRecipes() {
    const { rows } = await pool.query("SELECT * FROM recipes ORDER BY id");
    return rows;
}

async function createSingleTag(tagTitle) {
    // console.log("running createSingleTag for: ", tagTitle);

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
        "SELECT * FROM ingredients WHERE name = $1",
        [ingredient],
    );
    if (rows.length > 0) {
        return rows[0].id;
    } else {
        try {
            await pool.query("INSERT INTO ingredients (name) VALUES ($1)", [
                ingredient,
            ]);

            const { rows } = await pool.query(
                "SELECT * FROM ingredients WHERE name = $1",
                [ingredient],
            );
            return rows[0].id;
        } catch (error) {
            console.error(error);
        }
    }
}

async function createRecipe(data) {
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
            "INSERT INTO recipes (title, description, instructions, link_url, prep_time_minutes, cook_time_minutes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
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

async function deleteRecipe(recipeId) {
    await pool.query("DELETE FROM recipes WHERE id = $1", [recipeId]);
}

async function findOneRecipe(recipeId) {
    const { rows } = await pool.query("SELECT * FROM recipes WHERE id = $1", [
        recipeId,
    ]);
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
async function getSingleRecipeTags() {
    const { rows } = await pool.query(
        "SELECT recipes.title AS tag_recipe_title, tags.name FROM recipe_tags INNER JOIN recipes ON recipes.id = recipe_tags.recipe_id INNER JOIN tags ON tags.id = recipe_tags.tag_id;",
    );
    return rows;
}
async function getSingleRecipeIngredients() {
    const { rows } = await pool.query(
        "SELECT title AS recipe_title, ingredients.name AS ingredient, ingredients.id AS ingredient_id FROM recipe_ingredients INNER JOIN recipes ON recipes.id = recipe_ingredients.recipe_id INNER JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id;",
    );
    return rows;
}

async function updateRecipe(data, recipeId) {
    console.log("updating recipe .....");

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
     WHERE id = $7`,
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
                recipeId,
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

async function getShoppingListIngredientsByRecipe() {
    const { rows } = await pool.query(
        "SELECT shopping_list_recipes.recipe_id, shopping_list.ingredient_name FROM shopping_list INNER JOIN shopping_list_recipes ON shopping_list.id = shopping_list_recipes.shopping_list_id WHERE shopping_list.ingredient_name IS NOT NULL",
    );
    return rows;
}

async function createSingleRecipeShoppingListItem(ingredientName, recipeId) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE ingredient_name = $1",
        [ingredientName],
    );

    if (rows.length < 1) {
        const ingredient = await pool.query(
            "INSERT INTO shopping_list (custom_product, ingredient_name) VALUES (null, $1) RETURNING id;",
            [ingredientName],
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

async function allRecipesOnMenu() {
    const { rows } = await pool.query(
        "SELECT * FROM recipes WHERE is_on_menu = true",
    );
    return rows;
}

async function addRecipeToMenu(recipeId) {
    await pool.query(
        "UPDATE recipes SET is_on_menu = true WHERE recipes.id = $1;",
        [recipeId],
    );
}

async function createShoppingList(recipeIngredientNames) {
    await Promise.all(
        recipeIngredientNames.ingredients.map((ingredientName) =>
            createSingleRecipeShoppingListItem(
                ingredientName,
                recipeIngredientNames.recipeId,
            ),
        ),
        addRecipeToMenu(recipeIngredientNames.recipeId),
    );
}

async function getShoppingListItems() {
    const { rows } = await pool.query(
        "SELECT shopping_list.*, COUNT(shopping_list_recipes.id) AS recipe_count FROM shopping_list LEFT JOIN shopping_list_recipes ON shopping_list.id = shopping_list_recipes.shopping_list_id GROUP BY shopping_list.id ORDER BY shopping_list.id;",
    );
    return rows;
}

async function deleteShoppingList() {
    await pool.query("DELETE FROM shopping_list");
}

async function removeIsOnMenuRecipes() {
    await pool.query("UPDATE recipes SET is_on_menu = false");
}
async function createCustomProduct(customProduct) {
    const { rows } = await pool.query(
        "SELECT * FROM shopping_list WHERE custom_product = $1",
        [customProduct],
    );

    if (rows.length < 1) {
        await pool.query(
            "INSERT INTO shopping_list (custom_product, ingredient_name) VALUES ($1, null);",
            [customProduct],
        );
    }
}

async function updateIngredient(shoppingItemId, newShoppingItemTitle) {
    await pool.query(
        "UPDATE shopping_list SET ingredient_name = $1 WHERE id = $2",
        [newShoppingItemTitle, shoppingItemId],
    );
}
async function updateCustomProduct(customProductId, customProduct) {
    await pool.query(
        "UPDATE shopping_list SET custom_product = $1 WHERE id = $2",
        [customProduct, customProductId],
    );
}

async function removeSingleShoppingListItem(shoppingListItemId) {
    await pool.query("DELETE FROM shopping_list WHERE id = $1", [
        shoppingListItemId,
    ]);
}

async function checkForDuplicateIngredients(recipeIngredient) {
    const ingredientCount = await pool.query(
        "SELECT COUNT(*) FROM shopping_list_recipes WHERE shopping_list_id = $1",
        [recipeIngredient],
    );
    return parseInt(ingredientCount.rows[0].count);
}

async function removeRecipeFromShoppingList(recipeId) {
    try {
        await pool.query(
            "UPDATE recipes SET is_on_menu = false WHERE id = $1 ",
            [recipeId],
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
                await removeSingleShoppingListItem(row.shopping_list_id);
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

async function addSingleItemToGeneratedList(product) {
    console.log(product);

    await pool.query(
        "INSERT INTO generated_shopping_list (product_name, aisle_name, recipe_count, is_custom_product, quantity) VALUES ($1, $2, $3, $4, $5)",
        [
            product.product,
            product.aisle,
            product.recipe_count,
            product.is_custom_product,
            product.quantity,
        ],
    );
}

async function createShoppingListByAisles(generatedShoppingItems) {
    try {
        console.log(generatedShoppingItems);
        await pool.query("DELETE FROM generated_shopping_list");
        await Promise.all(
            generatedShoppingItems.items.map((product) =>
                addSingleItemToGeneratedList(product),
            ),
        );
    } catch (error) {
        console.log(error);
        throw error;
    }
}

async function getGeneratedShoppingListItems() {
    const { rows } = await pool.query("SELECT * FROM generated_shopping_list");
    return rows;
}

async function toggleCollected(productId, status) {
    await pool.query(
        "UPDATE generated_shopping_list SET is_collected = $2 WHERE id = $1",
        [productId, status],
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
    getGeneratedShoppingListItems,
    toggleCollected,
};
