-- Under households, recipes / shopping lists belong to the HOUSEHOLD and are
-- shared, so deleting a user must not delete them — it should only drop the
-- "added by" attribution (user_id becomes NULL). Switch the user_id foreign
-- keys from ON DELETE CASCADE to ON DELETE SET NULL.
--
-- Solo-account deletion (a user who is the only member of their household) is
-- handled in the app (lib/auth.js deleteUser.beforeDelete): it deletes the
-- whole household, which cascades the recipes/lists via household_id.

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_user_id_fkey;
ALTER TABLE recipes
    ADD CONSTRAINT recipes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL;

ALTER TABLE shopping_list DROP CONSTRAINT IF EXISTS shopping_list_user_id_fkey;
ALTER TABLE shopping_list
    ADD CONSTRAINT shopping_list_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL;

ALTER TABLE generated_shopping_list DROP CONSTRAINT IF EXISTS generated_shopping_list_user_id_fkey;
ALTER TABLE generated_shopping_list
    ADD CONSTRAINT generated_shopping_list_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL;
