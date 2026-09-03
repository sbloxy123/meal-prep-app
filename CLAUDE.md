# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Branch note:** `main` holds the original server-rendered EJS app (no longer deployed).
> `api-refactor` (this branch) is a pure JSON REST API and is the live deployed version on Railway.
> The Next.js frontend lives at `github.com/sbloxy123/meal-prep-frontend`, deployed on Vercel and live at **`fornetto.app`** (the app is branded **Fornetto**).

## Commands

```bash
# Start the dev server (uses Node.js built-in --watch, no nodemon)
npm start

# Run database migrations
npm run migrate:up
npm run migrate:down

# Seed the database
npm run seed

# Unit tests (node --test) — currently test/steps.test.js
npm test
```

## Environment Variables

```
HOST=
USER=
DATABASE=
PASSWORD=
DATABASE_PORT=
ANTHROPIC_API_KEY=

# Optional — used by POST /recipes/import-social for the YouTube path (Data API,
# reads video title + description). If unset, YouTube falls back to og:description
# scraping (truncated).
YOUTUBE_API_KEY=

# Optional — enables the Instagram path of POST /recipes/import-social via an Apify
# actor (IG login-walls server requests, so there's no free caption source). If
# unset, Instagram falls back to the "paste the caption" flow. TikTok needs no key
# (free public oEmbed). APIFY_IG_ACTOR overrides the default actor id.
APIFY_TOKEN=
APIFY_IG_ACTOR=apify~instagram-scraper

# Assembled connection string — required by node-pg-migrate and used on Railway
# (Railway Postgres internal host: postgres.railway.internal)
DATABASE_URL=postgresql://user:password@host:port/database

# Optional — defaults to 3001
PORT=3001

# Comma-separated frontend origins. No trailing slashes. The FIRST entry is used
# to build email links (verification/invite), so keep the primary domain first.
# Production: https://fornetto.app,https://www.fornetto.app,https://meal-prep-frontend.vercel.app
ALLOWED_ORIGINS=http://localhost:3000

# BetterAuth — generate secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=
# The URL of this API itself (used by BetterAuth internally)
BETTER_AUTH_URL=http://localhost:3001

# Resend — transactional email (password reset, email verification)
RESEND_API_KEY=
# Verified sender on a Resend-verified domain (send.fornetto.app). Falls back to
# Resend's test sender (own-account only) if unset.
EMAIL_FROM=Fornetto <noreply@send.fornetto.app>
```

When deploying to Railway, set all of the above as environment variables in the Railway dashboard. `ALLOWED_ORIGINS` must point to the deployed Next.js Vercel URL.

## Architecture

Pure JSON REST API — Express + PostgreSQL. No ORM, no templating engine.

**Entry point:** `app.js` — middleware order matters here (see CORS / BetterAuth note below), mounts four feature routers, runs `db/init.js` at startup before binding the port. The error handler honours an `err.status` set by controllers/queries (e.g. an expired invite → 410), falling back to 500.

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
| `shoppingListRouter` | `/shopping-list` | Draft list from recipe ingredients + own items; `POST /shopping-list/finish` closes the weekly loop (clears draft + generated + takes recipes off the menu) |
| `generatedShoppingListRouter` | `/generated-shopping-list` | AI aisle-organised list; `POST /generated-shopping-list` appends a single "forgot" item |
| `householdRouter` | `/household` | household + members + pending invites (`GET`), `POST /invite` `/accept` `/leave`, `DELETE /invite/:id` `/member/:id`, `PUT /` (rename) |
| `installRouter` | `/install` | `POST /email` — resend the install-guide email (3/user/24h) |

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
- **Account deletion** (`user.deleteUser` enabled) — `POST /api/auth/delete-user { password }`. The `beforeDelete` hook (`lib/auth.js`) is household-aware: a **sole** member deleting their account purges their Cloudinary photos and deletes the whole household (cascading recipes/lists); a **shared** member's deletion leaves the shared data intact — `recipes.user_id` is `ON DELETE SET NULL` (migration `007`), so recipes stay with attribution nulled.
- The frontend auth pages (`/reset-password`, `/verify-email`, unverified sign-in state) and the household-management UI are all built.
- **Install email** (`lib/install.js`): `emailVerification.afterEmailVerification` sends "Put Fornetto on your home screen" (link to `FRONTEND_URL/install?from=email`) once per account — fire-and-forget, because BetterAuth awaits the hook before it sets the session cookie, and `sendEmail` throws on a Resend failure. The send record is the `install_email_sent` row in `app_events` (keyed by `user_id`: no household exists yet at that point). `POST /install/email` (auth-guarded, `installRouter`) resends it on demand from the Account page, capped at 3/user/24h (429 `INSTALL_EMAIL_LIMIT`, show the `message`). iPhones have no install prompt, so this email is how the link reaches the phone.

All API routes (`/recipes`, `/shopping-list`, `/generated-shopping-list`) are protected by `middleware/requireAuth.js`, which reads the session from the BetterAuth cookie, sets `req.user`, and resolves the caller's household into `req.householdId` (lazily creating one on first use — see Households below).

### Households (tenancy)

Data is scoped by **household**, not by individual user, so family members can share one pool of recipes, menus and shopping lists. Added by `db/migrations/005_households.sql`.

- `household` (`id`, `name`, `created_at`) and `household_member` (`household_id`, `user_id`, `role` = `owner`|`member`) — a user belongs to exactly one household (enforced by a unique index on `household_member.user_id`; relax later for multi-household).
- `recipes`, `shopping_list`, `generated_shopping_list` each carry a `household_id` (the scope key every query filters on). `recipes.user_id` is retained as "added by" attribution; `createRecipe(data, householdId, userId)` sets both.
- `requireAuth` calls `db.ensureHouseholdForUser(userId, name)`; new users get a household (them as `owner`) on their first authenticated request. Controllers pass `req.householdId` to queries.
- **Collections/tags** are scoped to the household via `getAllTags(householdId)` (distinct tags used by the household's recipes) — the `tags`/`ingredients` tables themselves remain a global deduped vocabulary.
- Migration 005 also drops the global `UNIQUE(product_name)` on `generated_shopping_list` (it previously prevented two households from having the same product) — so `addForgottenItemToGeneratedList` guards dups with `WHERE NOT EXISTS` instead of `ON CONFLICT`.
- **Invites are built** (`householdController.js` + `db/migrations/006_household_invites.sql`): the owner invites by email → tokenised link emailed via Resend → `POST /household/accept` joins the invitee transactionally. Joining from a **solo** household merges their recipes/lists into the target household, then deletes the empty one; joining from a **shared** household just moves membership. `leave` / `remove-member` move a user to a fresh solo household (shared data stays behind); owner-leave hands ownership to the earliest-joined member first.

### AI integration

`shoppingListController.js` calls the Anthropic API directly (model `claude-haiku-4-5-20251001`):
- `POST /shopping-list/organise` — groups the shopping list into UK supermarket aisles; saves result to `generated_shopping_list`.
- `POST /shopping-list/parse-ingredients` — parses raw pasted text into individual ingredient items.
- Both use `jsonrepair` as a fallback when Claude returns slightly malformed JSON.

**Method steps — `lib/steps.js`.** Every AI path that writes `recipes.instructions` (import, social, generate-from-title, improve, photo, My usuals) passes the model's answer through `normaliseSteps`, which turns an array, a newline string, or one paragraph of prose into one step per line. The prompts ask for an array of steps; normalisation is the safety net, not the mechanism. `validateDraft` normalises too — before that it read the field as a string, so an array counted as an empty method and forced the paid Sonnet escalation. `splitSentences` is a byte-for-byte twin of the frontend's display fallback in `src/lib/instructions.ts`; change them together.

## Database Schema

Key tables:
- `recipes` ↔ `ingredients` via `recipe_ingredients` (quantity, unit on the join row)
- `recipes` ↔ `tags` via `recipe_tags`
- `shopping_list` ↔ `recipes` via `shopping_list_recipes` (shared-ingredient dedup logic: only delete a shopping list item if no other recipe on the menu uses it)
- `generated_shopping_list` — AI-organised list; cleared and rebuilt on each organise call
- `user`, `session`, `account`, `verification` — BetterAuth tables
- `household`, `household_member`, `household_invite` — tenancy + email invites; `recipes`/`shopping_list`/`generated_shopping_list` carry `household_id` (see Households above)

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

Repo: `github.com/sbloxy123/meal-prep-frontend` — deployed on Vercel, live at **`fornetto.app`** (Cloudflare DNS → Vercel → this Railway API).

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

`ALLOWED_ORIGINS` on Railway must include every frontend origin. Currently `https://fornetto.app,https://www.fornetto.app,https://meal-prep-frontend.vercel.app` (first entry also builds email links). `lib/auth.js` reads the same var for BetterAuth `trustedOrigins`.
