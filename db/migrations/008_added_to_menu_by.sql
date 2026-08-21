-- E (attribution): track which household member put a recipe on the week's
-- menu, so shared households can see who added what. "Created by" is already
-- recipes.user_id. SET NULL on user deletion, matching the other user_id FKs.

ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS added_to_menu_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
