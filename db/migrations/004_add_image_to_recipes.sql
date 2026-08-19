-- 004_add_image_to_recipes.sql
-- Recipe photos stored in Cloudinary (§9). Both columns are nullable — no
-- image is the normal case. image_public_id is retained so the API can delete
-- the Cloudinary asset when a recipe is deleted.

ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS image_public_id TEXT;
