-- Add user ownership to recipes, shopping list and generated shopping list.
-- Nullable so existing rows are preserved; assign them via:
--   UPDATE recipes SET user_id = '<your-user-id>' WHERE user_id IS NULL;
--   UPDATE shopping_list SET user_id = '<your-user-id>' WHERE user_id IS NULL;
--   UPDATE generated_shopping_list SET user_id = '<your-user-id>' WHERE user_id IS NULL;

ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE shopping_list
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE generated_shopping_list
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
