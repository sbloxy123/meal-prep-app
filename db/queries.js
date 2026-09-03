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
        `SELECT recipes.*, cu.name AS created_by_name
         FROM recipes
         LEFT JOIN "user" cu ON cu.id = recipes.user_id
         WHERE recipes.household_id = $1
         ORDER BY recipes.id`,
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
        servings,
        calories,
        protein_g,
        carb_g,
        fat_g,
        macros_source,
    } = data;

    const ingredientIds = await Promise.all(
        ingredient_name.map((ingredient) =>
            createSingleIngredient(ingredient.toLowerCase()),
        ),
    );

    const tagIds = await Promise.all(tags.map((tag) => createSingleTag(tag)));

    try {
        const { rows } = await pool.query(
            "INSERT INTO recipes (title, description, instructions, link_url, prep_time_minutes, cook_time_minutes, image_url, image_public_id, servings, calories, protein_g, carb_g, fat_g, macros_source, household_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id",
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
                image_url ?? null,
                image_public_id ?? null,
                servings ?? null,
                calories ?? null,
                protein_g ?? null,
                carb_g ?? null,
                fat_g ?? null,
                macros_source ?? null,
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
        return recipeId;
    } catch (error) {
        console.error(error);
    }
}

async function deleteRecipe(recipeId, householdId) {
    // Clear the shopping list first. Deleting the recipe cascades its
    // shopping_list_recipes links away, but the shopping_list rows themselves
    // have no foreign key to cascade from — so without this they'd be stranded
    // on the list with no recipe behind them. Ordering matters: once the links
    // are gone there is no way to tell which items were this recipe's.
    await clearRecipeFromShoppingList(recipeId, householdId);

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
            servings,
            calories,
            protein_g,
            carb_g,
            fat_g,
            macros_source,
        } = data;

        await pool.query(
            `UPDATE recipes
             SET title = $1, description = $2, instructions = $3,
                 link_url = $4, prep_time_minutes = $5, cook_time_minutes = $6,
                 image_url = $7, image_public_id = $8,
                 servings = $9, calories = $10, protein_g = $11,
                 carb_g = $12, fat_g = $13, macros_source = $14
             WHERE id = $15 AND household_id = $16`,
            [
                recipe_title,
                recipe_description,
                recipe_instructions,
                recipe_link_url,
                prep_time_minutes,
                cook_time_minutes,
                image_url ?? null,
                image_public_id ?? null,
                servings ?? null,
                calories ?? null,
                protein_g ?? null,
                carb_g ?? null,
                fat_g ?? null,
                macros_source ?? null,
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
        `SELECT recipes.*, au.name AS added_by_name
         FROM recipes
         LEFT JOIN "user" au ON au.id = recipes.added_to_menu_by
         WHERE recipes.is_on_menu = true AND recipes.household_id = $1`,
        [householdId],
    );
    return rows;
}

async function addRecipeToMenu(recipeId, householdId, userId) {
    await pool.query(
        "UPDATE recipes SET is_on_menu = true, added_to_menu_by = $3 WHERE recipes.id = $1 AND household_id = $2;",
        [recipeId, householdId, userId],
    );
}

async function createShoppingList(recipeIngredientNames, householdId, userId) {
    await Promise.all([
        ...recipeIngredientNames.ingredients.map((ingredientName) =>
            createSingleRecipeShoppingListItem(
                ingredientName,
                recipeIngredientNames.recipeId,
                householdId,
            ),
        ),
        addRecipeToMenu(recipeIngredientNames.recipeId, householdId, userId),
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
    await pool.query("UPDATE recipes SET is_on_menu = false, added_to_menu_by = NULL WHERE household_id = $1", [householdId]);
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

// Drops a recipe's ingredients from the shopping list, keeping any item a
// second recipe still needs. Shared by "remove from this week" and by deleting
// the recipe outright: shopping_list rows carry no foreign key to the recipe
// (they're keyed by ingredient name), so nothing cascades and this is the only
// thing that clears them. Must run before the shopping_list_recipes links go,
// since the duplicate check counts them.
async function clearRecipeFromShoppingList(recipeId, householdId) {
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

    await pool.query("DELETE FROM shopping_list_recipes WHERE recipe_id = $1;", [
        recipeId,
    ]);
}

async function removeRecipeFromShoppingList(recipeId, householdId) {
    try {
        await pool.query(
            "UPDATE recipes SET is_on_menu = false, added_to_menu_by = NULL WHERE id = $1 AND household_id = $2",
            [recipeId, householdId],
        );

        await clearRecipeFromShoppingList(recipeId, householdId);
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

// ---- Household management (C2: invite / join / leave / remove) ----

function withStatus(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

async function getHouseholdById(householdId) {
    const { rows } = await pool.query("SELECT id, name FROM household WHERE id = $1", [householdId]);
    return rows[0];
}

async function getHouseholdMembers(householdId) {
    const { rows } = await pool.query(
        `SELECT hm.user_id, hm.role, hm.joined_at, u.name, u.email
         FROM household_member hm
         JOIN "user" u ON u.id = hm.user_id
         WHERE hm.household_id = $1
         ORDER BY hm.joined_at ASC`,
        [householdId],
    );
    return rows;
}

async function getMemberRole(householdId, userId) {
    const { rows } = await pool.query(
        "SELECT role FROM household_member WHERE household_id = $1 AND user_id = $2",
        [householdId, userId],
    );
    return rows[0]?.role ?? null;
}

async function getHouseholdMemberCount(householdId) {
    const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS n FROM household_member WHERE household_id = $1",
        [householdId],
    );
    return rows[0].n;
}

async function renameHousehold(householdId, name) {
    await pool.query("UPDATE household SET name = $1 WHERE id = $2", [name, householdId]);
}

// ========= ONBOARDING + FOOD PREFERENCES ========= //

// Everything GET /shopping-list needs to decide whether to show the
// questionnaire, in one round trip. has_recipes keeps the "empty account"
// check server-side, where it's a cheap indexed EXISTS.
async function getOnboardingState(householdId, userId) {
    const { rows } = await pool.query(
        `SELECT hm.onboarded_at, hm.onboarding_outcome, hm.food_prefs, h.dietary_rule,
                EXISTS (SELECT 1 FROM recipes r WHERE r.household_id = hm.household_id)
                    AS has_recipes
         FROM household_member hm
         JOIN household h ON h.id = hm.household_id
         WHERE hm.household_id = $1 AND hm.user_id = $2`,
        [householdId, userId],
    );
    return rows[0] ?? null;
}

// End of the questionnaire (completed or skipped). food_prefs is only
// overwritten when prefs were actually given — a skip must not wipe an
// answer saved earlier in the flow.
async function setMemberOnboarding(householdId, userId, { prefs, outcome }) {
    await pool.query(
        `UPDATE household_member
         SET food_prefs = COALESCE($3, food_prefs),
             onboarded_at = now(),
             onboarding_outcome = $4
         WHERE household_id = $1 AND user_id = $2`,
        [householdId, userId, prefs ? JSON.stringify(prefs) : null, outcome],
    );
}

// Account edits (and the wizard's step-3 save): preferences only, no
// onboarding side effects.
async function setMemberFoodPrefs(householdId, userId, prefs) {
    await pool.query(
        `UPDATE household_member SET food_prefs = $3
         WHERE household_id = $1 AND user_id = $2`,
        [householdId, userId, JSON.stringify(prefs)],
    );
}

// Set or clear the household-wide dietary rule. Authorisation is the caller's
// owner role, checked in the controller — deliberately NOT a "only whoever set
// it may change it" guard here, because ownership transfers when an owner
// leaves (see leaveHousehold), which would otherwise lock the new owner out of
// a rule the departed owner set.
async function setHouseholdDietaryRule(householdId, rule) {
    await pool.query("UPDATE household SET dietary_rule = $2 WHERE id = $1", [
        householdId,
        rule ? JSON.stringify(rule) : null,
    ]);
}

// What the AI suggestion endpoints personalise from: the household-wide rule
// plus every member's own answers — suggestions feed the whole kitchen, not
// just whoever tapped the button.
async function getSuggestContext(householdId) {
    const [householdRes, membersRes] = await Promise.all([
        pool.query("SELECT dietary_rule FROM household WHERE id = $1", [householdId]),
        pool.query(
            "SELECT user_id, food_prefs FROM household_member WHERE household_id = $1",
            [householdId],
        ),
    ]);
    return {
        dietaryRule: householdRes.rows[0]?.dietary_rule ?? null,
        memberPrefs: membersRes.rows.map((r) => r.food_prefs).filter(Boolean),
    };
}

async function getPendingInvites(householdId) {
    const { rows } = await pool.query(
        `SELECT id, invited_email, created_at, expires_at
         FROM household_invite
         WHERE household_id = $1 AND accepted_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC`,
        [householdId],
    );
    return rows;
}

async function createInvite(householdId, invitedEmail, invitedBy, token, expiresAt) {
    // Replace any existing pending invite for the same email + household.
    await pool.query(
        `DELETE FROM household_invite
         WHERE household_id = $1 AND lower(invited_email) = lower($2) AND accepted_at IS NULL`,
        [householdId, invitedEmail],
    );
    const { rows } = await pool.query(
        `INSERT INTO household_invite (household_id, invited_email, invited_by, token, expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [householdId, invitedEmail, invitedBy, token, expiresAt],
    );
    return rows[0].id;
}

async function revokeInvite(householdId, inviteId) {
    await pool.query(
        "DELETE FROM household_invite WHERE id = $1 AND household_id = $2",
        [inviteId, householdId],
    );
}

// Accept an invite (transactional). Moves the user into the invite's household.
// If they were the sole member of their old (solo) household, their recipes and
// lists are merged in and the empty household is removed; if they were in a
// shared household, they just move across and the shared data stays behind.
async function acceptInvite(userId, token) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { rows: invRows } = await client.query(
            `SELECT hi.*, h.name AS household_name
             FROM household_invite hi JOIN household h ON h.id = hi.household_id
             WHERE hi.token = $1 FOR UPDATE OF hi`,
            [token],
        );
        const invite = invRows[0];
        if (!invite) throw withStatus("This invite link isn't valid.", 404);
        if (invite.accepted_at) throw withStatus("This invite has already been used.", 410);
        if (new Date(invite.expires_at) < new Date()) throw withStatus("This invite has expired.", 410);

        const target = invite.household_id;
        const { rows: curRows } = await client.query(
            "SELECT household_id FROM household_member WHERE user_id = $1",
            [userId],
        );
        const current = curRows[0]?.household_id ?? null;

        if (current !== target) {
            let soleMember = false;
            if (current) {
                const { rows: cnt } = await client.query(
                    "SELECT COUNT(*)::int AS n FROM household_member WHERE household_id = $1",
                    [current],
                );
                soleMember = cnt[0].n === 1;
            }

            if (current && soleMember) {
                // Merge the joiner's solo data into the target household.
                await client.query("UPDATE recipes SET household_id = $1 WHERE household_id = $2", [target, current]);
                await client.query("UPDATE shopping_list SET household_id = $1 WHERE household_id = $2", [target, current]);
                await client.query("UPDATE generated_shopping_list SET household_id = $1 WHERE household_id = $2", [target, current]);
            }

            await client.query(
                `INSERT INTO household_member (household_id, user_id, role)
                 VALUES ($1, $2, 'member')
                 ON CONFLICT (user_id) DO UPDATE SET household_id = $1, role = 'member'`,
                [target, userId],
            );

            // The old solo household is now empty — remove it.
            if (current && soleMember) {
                await client.query("DELETE FROM household WHERE id = $1", [current]);
            }
        }

        await client.query("UPDATE household_invite SET accepted_at = now() WHERE id = $1", [invite.id]);
        await client.query("COMMIT");
        return { household_name: invite.household_name, alreadyMember: current === target };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// Move a user out of their current household into a fresh solo one they own.
// Shared data stays with the old household. Used by leave and remove-member.
async function moveUserToNewHousehold(client, userId, name) {
    const { rows } = await client.query(
        "INSERT INTO household (name) VALUES ($1) RETURNING id",
        [name || "My kitchen"],
    );
    const newId = rows[0].id;
    await client.query(
        `INSERT INTO household_member (household_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (user_id) DO UPDATE SET household_id = $1, role = 'owner'`,
        [newId, userId],
    );
    return newId;
}

async function leaveHousehold(userId, displayName) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            "SELECT household_id, role FROM household_member WHERE user_id = $1",
            [userId],
        );
        const membership = rows[0];
        if (!membership) throw withStatus("You're not in a household.", 400);
        const { household_id: hh, role } = membership;
        const { rows: cnt } = await client.query(
            "SELECT COUNT(*)::int AS n FROM household_member WHERE household_id = $1",
            [hh],
        );
        if (cnt[0].n <= 1) throw withStatus("You're the only member — there's nothing to leave.", 400);

        // Owner leaving hands ownership to the earliest-joined remaining member.
        if (role === "owner") {
            await client.query(
                `UPDATE household_member SET role = 'owner'
                 WHERE user_id = (
                     SELECT user_id FROM household_member
                     WHERE household_id = $1 AND user_id <> $2
                     ORDER BY joined_at ASC LIMIT 1
                 )`,
                [hh, userId],
            );
        }
        await moveUserToNewHousehold(client, userId, displayName ? `${displayName}'s kitchen` : "My kitchen");
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function removeMember(householdId, targetUserId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            "SELECT role FROM household_member WHERE household_id = $1 AND user_id = $2",
            [householdId, targetUserId],
        );
        if (!rows[0]) throw withStatus("That person isn't in your household.", 404);
        await moveUserToNewHousehold(client, targetUserId, "My kitchen");
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// ========= RECIPE IMPORT RATE LIMITING ========= //
// The import/estimate endpoints each incur a fetch + LLM cost per call, so we
// rate-limit by counting calls (not saved recipes) in a rolling 6-hour window,
// scoped per household. `action` keeps the two endpoints on independent windows.

async function countRecentImports(householdId, action) {
    const { rows } = await pool.query(
        `SELECT count(*)::int AS count
         FROM recipe_imports
         WHERE household_id = $1
           AND action = $2
           AND created_at > now() - interval '6 hours'`,
        [householdId, action],
    );
    return rows[0].count;
}

async function recordImport(householdId, action) {
    await pool.query(
        "INSERT INTO recipe_imports (household_id, action) VALUES ($1, $2)",
        [householdId, action],
    );
}

// ========= PREMIUM PLAN + WEEKLY AI ALLOWANCE ========= //
// Free households share ONE pool of AI actions per calendar week across every
// AI feature (all recorded into recipe_imports). Premium households skip the
// weekly pool entirely (the per-action 6h burst ceiling in the controllers
// still applies to everyone as a fair-use / abuse guard). The week boundary is
// Monday 00:00 Europe/London — a fixed app timezone, so we don't need each
// user's local zone to match the "resets Monday / this week" allowance copy.

const WEEKLY_AI_LIMIT = 15;

// Effective entitlement: 'premium' only while the plan is premium AND any
// premium_until (set on cancellation to the paid-through date) is in the future.
async function getHouseholdPlan(householdId) {
    const { rows } = await pool.query(
        `SELECT CASE
                    WHEN plan = 'premium'
                     AND (premium_until IS NULL OR premium_until > now())
                    THEN 'premium' ELSE 'free'
                END AS plan
         FROM household
         WHERE id = $1`,
        [householdId],
    );
    return rows[0]?.plan ?? "free";
}

// Count of AI actions used this week and when the window resets, in one query.
async function getWeeklyAiUsage(householdId) {
    const { rows } = await pool.query(
        `SELECT
             count(*)::int AS used,
             (date_trunc('week', now() AT TIME ZONE 'Europe/London') + interval '7 days')
                 AT TIME ZONE 'Europe/London' AS resets_at
         FROM recipe_imports
         WHERE household_id = $1
           AND created_at >= (date_trunc('week', now() AT TIME ZONE 'Europe/London'))
                                 AT TIME ZONE 'Europe/London'`,
        [householdId],
    );
    return { used: rows[0].used, resetsAt: rows[0].resets_at };
}

// One call for both enforcement (controllers) and display (GET /shopping-list).
// Premium → always ok, unlimited. Free → ok while under the weekly pool.
async function checkWeeklyAllowance(householdId) {
    const plan = await getHouseholdPlan(householdId);
    if (plan === "premium") {
        return { ok: true, plan, used: 0, limit: WEEKLY_AI_LIMIT, resetsAt: null };
    }
    const { used, resetsAt } = await getWeeklyAiUsage(householdId);
    return { ok: used < WEEKLY_AI_LIMIT, plan, used, limit: WEEKLY_AI_LIMIT, resetsAt };
}

// ========= PREMIUM SUBSCRIPTION → HOUSEHOLD ========= //
// The Stripe plugin keys subscriptions to the paying user; entitlement is
// household-scoped, so we mirror a subscription's state onto the payer's
// household (the single source of truth every allowance check reads).

async function setHouseholdPremiumFromSubscription({
    userId,
    isPremium,
    periodEnd = null,
    stripeCustomerId = null,
    stripeSubscriptionId = null,
}) {
    const { rows } = await pool.query(
        "SELECT household_id FROM household_member WHERE user_id = $1",
        [userId],
    );
    const householdId = rows[0]?.household_id;
    if (!householdId) return;

    await pool.query(
        `UPDATE household SET
             plan                   = $2,
             premium_until          = $3,
             stripe_customer_id     = COALESCE($4, stripe_customer_id),
             stripe_subscription_id = $5,
             premium_payer_user_id  = $6
         WHERE id = $1`,
        [
            householdId,
            isPremium ? "premium" : "free",
            periodEnd,
            stripeCustomerId,
            isPremium ? stripeSubscriptionId : null,
            isPremium ? userId : null,
        ],
    );
}

// Entitlement follows the payer: if they delete their account, their household
// drops back to free.
async function clearHouseholdPremiumByPayer(userId) {
    await pool.query(
        `UPDATE household SET
             plan = 'free', premium_until = NULL,
             stripe_subscription_id = NULL, premium_payer_user_id = NULL
         WHERE premium_payer_user_id = $1`,
        [userId],
    );
}

// ========= RECIPE SHARING ========= //
// A share link is a stable token per recipe. Anyone signed in can preview it and
// save a copy into their own household.

async function getOrCreateShareToken(recipeId, userId) {
    const existing = await pool.query(
        "SELECT token FROM recipe_shares WHERE recipe_id = $1",
        [recipeId],
    );
    if (existing.rows[0]) return existing.rows[0].token;

    // ON CONFLICT handles a concurrent share of the same recipe (recipe_id is
    // unique) — return whichever token won the race.
    const { rows } = await pool.query(
        `INSERT INTO recipe_shares (recipe_id, created_by)
         VALUES ($1, $2)
         ON CONFLICT (recipe_id) DO UPDATE SET recipe_id = EXCLUDED.recipe_id
         RETURNING token`,
        [recipeId, userId],
    );
    return rows[0].token;
}

// Resolve a token to its source recipe row (or null for an unknown token / a
// recipe that has since been deleted — the share row cascades away with it).
async function getSharedRecipeByToken(token) {
    const { rows } = await pool.query(
        `SELECT r.*
         FROM recipe_shares rs
         INNER JOIN recipes r ON r.id = rs.recipe_id
         WHERE rs.token = $1`,
        [token],
    );
    return rows[0] ?? null;
}

// ========= ADMIN ANALYTICS ========= //
// Append-only usage event. Fire-and-forget: analytics must never break or slow
// a write, so this swallows its own errors and callers do not await it.
async function recordEvent(type, { userId = null, householdId = null, meta = null } = {}) {
    try {
        await pool.query(
            `INSERT INTO app_events (type, user_id, household_id, meta)
             VALUES ($1, $2, $3, $4)`,
            [type, userId, householdId, meta ? JSON.stringify(meta) : null],
        );
    } catch (error) {
        console.error("recordEvent failed:", error.message);
    }
}

// How many of an event a household has logged recently. Used as a fair-use
// bound for work that deliberately isn't metered against the weekly AI pool
// (recipe_imports counts every row regardless of action, so recording there
// would charge the user).
async function countRecentEvents(type, householdId, interval = "24 hours") {
    const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM app_events
         WHERE type = $1 AND household_id = $2
           AND created_at >= now() - $3::interval`,
        [type, householdId, interval],
    );
    return rows[0].n;
}

// Per-user variants. Used by the install email: the verification hook runs
// before the user's household exists, so these key on user_id.
async function hasEvent(type, userId) {
    const { rows } = await pool.query(
        `SELECT 1 FROM app_events WHERE type = $1 AND user_id = $2 LIMIT 1`,
        [type, userId],
    );
    return rows.length > 0;
}

// Any row of this type whose meta[key] equals value (as text). Used to make
// once-ever alerts idempotent (install_layout_alerted per iOS major).
async function hasEventMeta(type, key, value) {
    const { rows } = await pool.query(
        `SELECT 1 FROM app_events WHERE type = $1 AND meta->>$2 = $3 LIMIT 1`,
        [type, key, value],
    );
    return rows.length > 0;
}

async function countRecentUserEvents(type, userId, interval = "24 hours") {
    const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM app_events
         WHERE type = $1 AND user_id = $2
           AND created_at >= now() - $3::interval`,
        [type, userId, interval],
    );
    return rows[0].n;
}

module.exports = {
    getHouseholdIdForUser,
    ensureHouseholdForUser,
    getHouseholdById,
    getHouseholdMembers,
    getMemberRole,
    getHouseholdMemberCount,
    renameHousehold,
    getOnboardingState,
    // Exported so callers writing several recipes that share a tag can create it
    // once up front — this function is read-then-insert, so concurrent callers
    // race on tags.name UNIQUE, swallow the violation and return undefined.
    createSingleTag,
    countRecentEvents,
    hasEvent,
    hasEventMeta,
    countRecentUserEvents,
    setMemberOnboarding,
    setMemberFoodPrefs,
    setHouseholdDietaryRule,
    getSuggestContext,
    getPendingInvites,
    createInvite,
    revokeInvite,
    acceptInvite,
    leaveHousehold,
    removeMember,
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
    countRecentImports,
    recordImport,
    WEEKLY_AI_LIMIT,
    getHouseholdPlan,
    getWeeklyAiUsage,
    checkWeeklyAllowance,
    setHouseholdPremiumFromSubscription,
    clearHouseholdPremiumByPayer,
    getOrCreateShareToken,
    getSharedRecipeByToken,
    recordEvent,
};
