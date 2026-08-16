# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Branch note:** `main` holds the original server-rendered EJS app (deployed to Railway).
> `api-refactor` (this branch) is a pure JSON REST API — EJS and static file serving have been removed.
> The Next.js frontend is a separate repository that calls this API.

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

# Optional — defaults to 3001
PORT=3001

# Comma-separated frontend origins. No trailing slashes.
# Production example: https://my-app.vercel.app
ALLOWED_ORIGINS=http://localhost:3000

# BetterAuth — generate secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=
# The URL of this API itself (used by BetterAuth internally)
BETTER_AUTH_URL=http://localhost:3001
```

When deploying to Railway, set all of the above as environment variables in the Railway dashboard. `ALLOWED_ORIGINS` must point to the deployed Next.js URL.

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

**The API routes are not yet protected by auth middleware.** Adding a session check to protected routes is the next step (see below).

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

`recipes.is_on_menu` — whether the recipe is on the current week's menu.
`recipes.favorite` — added via `db/migrations/001_add_favorite_to_recipes.sql`.
Ingredient names are normalised to lowercase on insert.

## Connecting a Next.js Frontend

### Setup

Install the BetterAuth client in the Next.js project:

```bash
npm install better-auth
```

Create `lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL, // e.g. http://localhost:3001
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

Set in `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Making authenticated API calls

BetterAuth sets a `better-auth.session_token` cookie on sign-in. For the browser to send this cookie to the Express API (a different origin), both sides need:

- Express: `cors({ credentials: true })` ✅ already done
- Next.js fetch calls: `credentials: "include"` on every request

Example fetch wrapper:

```ts
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",    // sends the session cookie cross-origin
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### Protecting API routes (not yet done)

The Express routes currently have no auth guard. To protect them, create a middleware in `middleware/requireAuth.js`:

```js
const { auth } = require("../lib/auth");
const { fromNodeHeaders } = require("better-auth/node");

async function requireAuth(req, res, next) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) return res.status(401).json({ error: "Unauthorised" });
  req.user = session.user;
  next();
}

module.exports = { requireAuth };
```

Then apply it to any router or individual route:

```js
const { requireAuth } = require("../middleware/requireAuth");

recipesRouter.get("/", requireAuth, recipesController.getRecipes);
```

### CORS in production

When the Next.js app is deployed (e.g. Vercel), update `ALLOWED_ORIGINS` on the Railway Express service to include the production URL:

```
ALLOWED_ORIGINS=https://your-app.vercel.app
```

BetterAuth also needs `trustedOrigins` to match — this is read from `ALLOWED_ORIGINS` in `lib/auth.js`, so the single env var covers both.
