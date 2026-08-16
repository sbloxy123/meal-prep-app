# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the dev server (uses Node.js built-in --watch, no nodemon)
npm start

# Run database migrations
npm run migrate:up
npm run migrate:down

# Seed the database
npm run seed
```

There are no tests configured.

## Environment Variables

Copy `.env` and populate:

```
HOST=
USER=
DATABASE=
PASSWORD=
DATABASE_PORT=
ANTHROPIC_API_KEY=
PORT=3001       # optional, defaults to 3001
```

## Architecture

Express + EJS app with a PostgreSQL backend. No ORM — raw SQL via the `pg` driver.

**Entry point:** `app.js` — loads `.env`, mounts three routers, runs `db/init.js` at startup before binding the port. The database initializer reads `db/init.sql` and runs it in a transaction; it silently skips `42P07`/`42710` errors (schema already exists) and throws on everything else.

**Request flow:** `routes/` → `controllers/` → `db/queries.js` → `db/pool.js`

- All SQL is in `db/queries.js` (one file, no query-builder abstraction).
- Form validation uses Zod schemas defined in `schemas/recipe.schema.js`.
- HTML forms can submit PUT/DELETE via the `method-override` middleware (`?_method=DELETE`).

**Three feature areas and their routes:**

| Router | Mount | Purpose |
|---|---|---|
| `recipesRouter` | `/recipes` | CRUD for recipes |
| `shoppingListRouter` | `/shopping-list` | Raw shopping list built from recipe ingredients |
| `generatedShoppingListRouter` | `/generated-shopping-list` | AI-organised version of the shopping list |

**AI integration** (`@anthropic-ai/sdk`, model `claude-haiku-4-5-20251001`):
- `POST /shopping-list/organise` — sends the current shopping list to Claude and asks it to group items by UK supermarket aisle; result is stored in `generated_shopping_list`.
- `POST /shopping-list/parse-ingredients` — accepts raw pasted text and uses Claude to extract individual ingredient strings, then inserts them as custom products.
- Both endpoints use `jsonrepair` as a fallback when Claude returns slightly malformed JSON.

## Database Schema

Key tables and their relationships:

- `recipes` ↔ `ingredients` via `recipe_ingredients` (quantity, unit stored on the join row)
- `recipes` ↔ `tags` via `recipe_tags`
- `shopping_list` ↔ `recipes` via `shopping_list_recipes` (tracks which recipes contributed each item; used to avoid deleting an ingredient that's shared across multiple on-menu recipes)
- `generated_shopping_list` — independent table populated by the AI organise step; cleared and rebuilt each time

`recipes.is_on_menu` marks which recipes are currently on the menu. `recipes.favorite` was added via `db/migrations/001_add_favorite_to_recipes.sql`.

Ingredient names are normalised to lowercase on insert (`ingredient.toLowerCase()` in `createSingleIngredient`). `ingredients` has a unique constraint on `name`, so upserts use `ON CONFLICT (name) DO UPDATE`.

## Client-Side JS

- `public/js/script.js` — handles the recipe list page: add-to-menu forms, recipe search/filter, new recipe popout, inline edit popout, favorite toggle.
- `public/js/updateRecipeForm.js` — handles the update recipe form: dynamic ingredient/tag row management and AJAX save that patches the displayed card without a full page reload.
