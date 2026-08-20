# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Branch note:** `main` holds the original server-rendered EJS app (no longer deployed).
> `api-refactor` (this branch) is a pure JSON REST API and is the live deployed version on Railway.
> The Next.js frontend lives at `github.com/sbloxy123/meal-prep-frontend` and is deployed on Vercel.

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

```
HOST=
USER=
DATABASE=
PASSWORD=
DATABASE_PORT=
ANTHROPIC_API_KEY=

# Assembled connection string — required by node-pg-migrate and used on Railway
# (Railway Postgres internal host: postgres.railway.internal)
DATABASE_URL=postgresql://user:password@host:port/database

# Optional — defaults to 3001
PORT=3001

# Comma-separated frontend origins. No trailing slashes.
# Production: https://meal-prep-frontend.vercel.app
ALLOWED_ORIGINS=http://localhost:3000

# BetterAuth — generate secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=
# The URL of this API itself (used by BetterAuth internally)
BETTER_AUTH_URL=http://localhost:3001

# Resend — transactional email (password reset, email verification)
RESEND_API_KEY=
# Verified sender. Falls back to Resend's test sender (own-account only) if unset.
EMAIL_FROM=Mise en Place <noreply@yourdomain.com>
```

When deploying to Railway, set all of the above as environment variables in the Railway dashboard. `ALLOWED_ORIGINS` must point to the deployed Next.js Vercel URL.

## Architecture

Pure JSON REST API — Express + PostgreSQL. No ORM, no templating engine.

**Entry point:** `app.js` — middleware order matters here (see CORS / BetterAuth note below), mounts three feature routers, runs `db/init.js` at startup before binding the port.

**Request flow:** `routes/` → `controllers/` → `db/queries.js` → `db/pool.js`

- All SQL is in `db/queries.js` (one file, no query-builder abstraction).
- Input validation uses Zod schemas in `schemas/recipe.schema.js`.

### Middleware order in app.js (important)

```
cors()                ← runs for ALL routes (OPTIONS preflight + CORS headers on auth responses)
BetterAuth intercept  ← /api/auth/* only: reads raw body before express.json() can consume it
express.json()        ← body parsing for API routes
routers
error handler
```

Two constraints drive this order:
1. **BetterAuth returns 404 for OPTIONS** — `cors()` must run before BetterAuth so preflight requests are handled correctly. `cors()` also sets `Access-Control-Allow-Origin` on BetterAuth responses (BetterAuth does not set CORS headers itself — `trustedOrigins` is for CSRF/cookie trust only, not CORS).
2. **`express.json()` consumes the body stream** — BetterAuth reads the raw stream itself, so it must run before `express.json()`.

### Feature routers

| Router | Mount | Purpose |
|---|---|---|
| `recipesRouter` | `/recipes` | CRUD for recipes |
| `shoppingListRouter` | `/shopping-list` | Raw shopping list built from recipe ingredients |
| `generatedShoppingListRouter` | `/generated-shopping-list` | AI-organised version of the shopping list |

### Authentication

BetterAuth (`lib/auth.js`) handles all `/api/auth/*` routes. Enabled plugin: `emailAndPassword`.

Key endpoints (all under `/api/auth`):
- `POST /sign-up/email` — `{ email, password, name }`
- `POST /sign-in/email` — `{ email, password }` → sets a `better-auth.session_token` cookie
- `GET /get-session` — returns `{ session, user }` for the current cookie
- `POST /sign-out` — clears the session cookie

BetterAuth manages four tables: `user`, `session`, `account`, `verification` — created by `db/migrations/002_better_auth_schema.sql`.

**Auth hardening** (`lib/auth.js`, `lib/email.js`):
- **Email verification required** (`requireEmailVerification: true`) — new sign-ups must confirm their email before signing in; verification is sent on sign-up and re-sent on a sign-in attempt by an unverified user. **Existing users have `emailVerified = false`** and will be prompted to verify on next sign-in — to pre-verify them run `UPDATE "user" SET "emailVerified" = true;`.
- **Password reset** via `POST /api/auth/request-password-reset` → email link.
- **Rate limiting** on `/sign-in/email`, `/sign-up/email`, `/request-password-reset`, `/send-verification-email`.
- Email is sent through **Resend** (`lib/email.js`). Reset/verification links are rewritten to the frontend origin so the Next proxy keeps the session cookie same-origin.
- Frontend still needs: a `/reset-password` page (calls `authClient.resetPassword`), a verification landing/"check your email" state, and to pass `redirectTo` (a frontend path) when requesting a reset. See design brief §6.1.

All API routes (`/recipes`, `/shopping-list`, `/generated-shopping-list`) are protected by `middleware/requireAuth.js`, which reads the session from the BetterAuth cookie, sets `req.user`, and resolves the caller's household into `req.householdId` (lazily creating one on first use — see Households below).

### Households (tenancy)

Data is scoped by **household**, not by individual user, so family members can share one pool of recipes, menus and shopping lists. Added by `db/migrations/004_households.sql`.

- `household` (`id`, `name`, `created_at`) and `household_member` (`household_id`, `user_id`, `role` = `owner`|`member`) — a user belongs to exactly one household (enforced by a unique index on `household_member.user_id`; relax later for multi-household).
- `recipes`, `shopping_list`, `generated_shopping_list` each carry a `household_id` (the scope key every query filters on). `recipes.user_id` is retained as "added by" attribution; `createRecipe(data, householdId, userId)` sets both.
- `requireAuth` calls `db.ensureHouseholdForUser(userId, name)`; new users get a household (them as `owner`) on their first authenticated request. Controllers pass `req.householdId` to queries.
- **Collections/tags** are scoped to the household via `getAllTags(householdId)` (distinct tags used by the household's recipes) — the `tags`/`ingredients` tables themselves remain a global deduped vocabulary.
- Migration 004 also drops the global `UNIQUE(product_name)` on `generated_shopping_list` (it previously prevented two households from having the same product).
- Household-management UI (invite/remove members, share) is not built yet — the model is in place for it.

### AI integration

`shoppingListController.js` calls the Anthropic API directly (model `claude-haiku-4-5-20251001`):
- `POST /shopping-list/organise` — groups the shopping list into UK supermarket aisles; saves result to `generated_shopping_list`.
- `POST /shopping-list/parse-ingredients` — parses raw pasted text into individual ingredient items.
- Both use `jsonrepair` as a fallback when Claude returns slightly malformed JSON.

## Database Schema

Key tables:
- `recipes` ↔ `ingredients` via `recipe_ingredients` (quantity, unit on the join row)
- `recipes` ↔ `tags` via `recipe_tags`
- `shopping_list` ↔ `recipes` via `shopping_list_recipes` (shared-ingredient dedup logic: only delete a shopping list item if no other recipe on the menu uses it)
- `generated_shopping_list` — AI-organised list; cleared and rebuilt on each organise call
- `user`, `session`, `account`, `verification` — BetterAuth tables
- `household`, `household_member` — tenancy; `recipes`/`shopping_list`/`generated_shopping_list` carry `household_id` (see Households above)

`recipes.is_on_menu` — whether the recipe is on the current week's menu.
`recipes.favorite` — added via `db/migrations/001_add_favorite_to_recipes.sql`.
`recipes.image_url` / `recipes.image_public_id` — Cloudinary photo (see below),
added via `db/migrations/004_add_image_to_recipes.sql`. Both nullable; no image
is the normal case.
Ingredient names are normalised to lowercase on insert.

### Recipe images (Cloudinary)

Photos live in Cloudinary, not this API. The browser uploads directly to
Cloudinary with an **unsigned upload preset** (frontend env
`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` / `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`);
the API never proxies the file. On success the frontend PUTs `secure_url` +
`public_id` onto the recipe, stored in `image_url` / `image_public_id`.
Deleting a recipe deletes its Cloudinary asset via `image_public_id`
(`lib/cloudinary.js` → `deleteAsset`, called from `deleteRecipe`). Configure the
backend with `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` +
`CLOUDINARY_API_SECRET` (or a single `CLOUDINARY_URL`); if unset, deleteAsset is
a safe no-op. `recipeSchema` accepts both fields as optional strings.

## Frontend (Next.js)

Repo: `github.com/sbloxy123/meal-prep-frontend` — deployed to `meal-prep-frontend.vercel.app`.

### How the frontend connects to this API

The frontend proxies all API traffic through Next.js rewrites (in `next.config.ts`) to avoid cross-domain cookie issues with `SameSite=Lax`:

| Frontend path | Proxied to |
|---|---|
| `/api/auth/*` | `<RAILWAY_URL>/api/auth/*` |
| `/backend/*` | `<RAILWAY_URL>/*` |

- BetterAuth client uses no `baseURL` — it hits `/api/auth/*` via the proxy
- `apiFetch` uses `/backend` as base — e.g. `apiFetch('/recipes')` → `/backend/recipes` → Railway `/recipes`
- Cookies are set on the Vercel domain (same-origin), so they're sent with every request

### Environment variables (frontend)

| Variable | Local | Vercel |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | `https://meal-prep-app-production-7120.up.railway.app` |

`NEXT_PUBLIC_API_URL` is the proxy **destination** — it's used in `next.config.ts` rewrites, not directly in frontend code.

### CORS

`ALLOWED_ORIGINS` on Railway must include the Vercel URL. Currently set to `https://meal-prep-frontend.vercel.app`. `lib/auth.js` reads the same var for BetterAuth `trustedOrigins`.
