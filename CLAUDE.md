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

# Unit tests (node --test) — pure modules only. Database-backed suites run with
# node -r dotenv/config --test test/credit-period.test.js test/organise.test.js
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

# Stripe (lib/stripe.js, lib/auth.js). Payments are disabled without the first two.
STRIPE_SECRET_KEY=
STRIPE_PREMIUM_PRICE_ID=          # £3.99/month Price (multi-currency)
STRIPE_PREMIUM_ANNUAL_PRICE_ID=   # £29.99/year Price — enables the annual toggle + founders' offer
STRIPE_WEBHOOK_SECRET=
# Founders' offer: app_config.founders_coupon (a Stripe Coupon id, duration
# forever, max_redemptions = the cap) — set from /back-of-house, not here.

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
| `shoppingListRouter` | `/shopping-list` | Draft list from recipe ingredients + own items. (`POST /shopping-list/finish` — which also wiped the week's menu — was removed 2026-09-06; the loop now closes with `POST /generated-shopping-list/clear-collected`.) |
| `generatedShoppingListRouter` | `/generated-shopping-list` | AI aisle-organised list; `POST /generated-shopping-list` appends a single "forgot" item |
| `householdRouter` | `/household` | household + members + pending invites (`GET`), `POST /invite` `/accept` `/leave`, `DELETE /invite/:id` `/member/:id`, `PUT /` (rename) |
| `installRouter` | `/install` | `POST /email` — resend the install-guide email (3/user/24h) |
| `premiumRouter` | `/premium` | `POST /cta` (upsell funnel taps), `GET /offers` (monthly / yearly / founders' availability) |
| `adminRouter` | `/admin` (ADMIN_EMAILS only) | `/overview`, `/users`, `/ai` (ledger), `/credits` (credit model + trial funnel + subscriptions), `/history` (daily snapshots by month, `?format=csv`), `/onboarding` (questionnaire funnel), `/recipes/overview` (what people add, anonymous), `/users/:id` (one person: plan, activity, recipe titles — logged as `admin_viewed_user`), `/recipes/:id?reason=` (the full recipe, reason required, logged as `admin_viewed_recipe`), `/access-log`, `/installs` (installed app vs browser: install rate by signup month, platforms, usage and retention comparison, weekly split, recent installs), `GET/PUT /config` (Plan settings), `/aisles*` (cache review), `/premium/*` (comps) |

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
- **Stale-layout alarm** (`lib/install.js` `alertNewIosMajor`): the frontend's Add to Home Screen walkthrough is verified up to a given iOS major; a phone on a newer one logs `install_layout_unverified { ios, verified }`, and the first sighting of each major emails `ADMIN_EMAILS` once (recorded as `install_layout_alerted`). `/admin/overview` returns `install.unverifiedIos` all-time so the dashboard notice persists until the frontend bumps its registry.

All API routes (`/recipes`, `/shopping-list`, `/generated-shopping-list`) are protected by `middleware/requireAuth.js`, which reads the session from the BetterAuth cookie, sets `req.user`, and resolves the caller's household into `req.householdId` (lazily creating one on first use — see Households below).

### Households (tenancy)

Data is scoped by **household**, not by individual user, so family members can share one pool of recipes, menus and shopping lists. Added by `db/migrations/005_households.sql`.

- `household` (`id`, `name`, `created_at`) and `household_member` (`household_id`, `user_id`, `role` = `owner`|`member`) — a user belongs to exactly one household (enforced by a unique index on `household_member.user_id`; relax later for multi-household).
- `recipes`, `shopping_list`, `generated_shopping_list` each carry a `household_id` (the scope key every query filters on). `recipes.user_id` is retained as "added by" attribution; `createRecipe(data, householdId, userId)` sets both.
- `requireAuth` calls `db.ensureHouseholdForUser(userId, name)`; new users get a household (them as `owner`) on their first authenticated request. Controllers pass `req.householdId` to queries.
- **Collections/tags** are scoped to the household via `getAllTags(householdId)` (distinct tags used by the household's recipes) — the `tags`/`ingredients` tables themselves remain a global deduped vocabulary.
- Migration 005 also drops the global `UNIQUE(product_name)` on `generated_shopping_list` (it previously prevented two households from having the same product) — so `addForgottenItemToGeneratedList` guards dups with `WHERE NOT EXISTS` instead of `ON CONFLICT`.
- **Free-tier household size (monetisation phase 5).** A free household has `member_limit` seats (its own snapshot, `app_config.member_limit_free` at signup — 2 at launch); premium and trial households have no limit. `householdController.seatCheck` counts members + unexpired pending invites; `POST /household/invite` answers **402 `HOUSEHOLD_LIMIT`** `{ message, limit, seats, plan }` (logged as `household_limit_hit`) and `GET /household` returns `{ plan, memberLimit, canInvite, reason }` so the Account card can swap the form for an upgrade. `db.acceptInvite` re-checks inside its transaction (target row `FOR UPDATE`, so two acceptors can't share the last seat; the invite may predate a trial ending) → 402 with a code. Members already present when a plan lapses are **never removed**. Two long-standing bugs are closed there too: a joiner who pays for their current household is refused with **409 `PREMIUM_MERGE`** (their subscription would otherwise keep billing a household they'd left, then re-sync onto the target), and a payer who leaves or is removed takes the subscription with them (`moveUserToNewHousehold`) — the household they left drops to free. A comped solo joiner carries the comp to a free target; a solo joiner's `ai_usage` rows move with them.
- **Invites are built** (`householdController.js` + `db/migrations/006_household_invites.sql`): the owner invites by email → tokenised link emailed via Resend → `POST /household/accept` joins the invitee transactionally. Joining from a **solo** household merges their recipes/lists into the target household, then deletes the empty one; joining from a **shared** household just moves membership. `leave` / `remove-member` move a user to a fresh solo household (shared data stays behind); owner-leave hands ownership to the earliest-joined member first.

### AI integration

**Strategy reference: `MONETISATION.md`** (plans, credits, trial, seats, what each knob does and where it lives — update it first when a rule changes). **Stripe Dashboard steps: `STRIPE-SETUP.md`.** The founders' offer is built but switched off until its coupon id is set in Plan settings.

Model calls (Haiku 4.5 everywhere; the photo path escalates once to Sonnet 4.6) live in `controllers/recipeImportController.js` (import, estimate-macros, improve, generate-from-title, suggest, parse-from-photo, import-social, usuals) and `controllers/shoppingListController.js`:
- `POST /shopping-list/organise` — groups the shopping list into UK supermarket aisles; saves result to `generated_shopping_list`.
- `POST /shopping-list/parse-ingredients` — parses raw pasted text into individual ingredient items.
- All use `jsonrepair` as a fallback when Claude returns slightly malformed JSON.

**Every model call goes through `lib/ai.js` `runModel(ledger, params, options)`** — the one place the Anthropic client is constructed. It times the call, captures `usage` (tokens) and cost (`lib/aiCost.js`, list prices → USD → pence at `AI_USD_TO_GBP`, default 0.78) onto the action's **ledger**. Never call `client.messages.create` directly; explicit `timeout`/`maxRetries` are the default here (the SDK's 10-minute default once hung parallel requests for minutes).

**The AI usage ledger — `ai_usage` (migration 015), `lib/ledger.js`, `lib/aiAllowance.js`.** One row per user-facing AI action, not per model call (a photo scan that escalates Haiku → Sonnet is one row, `calls = 2`, both costs summed). Every AI endpoint starts with

```js
ledger = await startAiAction(req, res, { action, credits, burstLimit, burstMessage });
if (!ledger) return;            // a 429 has been sent (credits → CREDIT_LIMIT, or the 6h burst cap)
… await runModel(ledger, params) …
await ledger.settle("ok");      // or "refund" / "failed"; catch blocks call ledger.fail(error)
```

`startAiAction` prices the action from the household's weight snapshot (photo 3, most things 1, the shopping list 0), checks the per-action 6h burst ceiling, then **reserves** the credits (`db.reserveCredits`: a per-household `pg_advisory_xact_lock`, re-reads the entitlement, inserts the row `pending` so in-flight work already counts, or writes a `rejected` row and the gate answers 429 `CREDIT_LIMIT` with `{ plan, allowance, used, remaining, cost, resetsAt, message }`). Outcomes: **ok** keeps the credits; **refund** (the model answered but the result is useless: not a recipe, unreadable photo) and **failed** (no completed answer: SDK threw, `fetchPage` failed, unparseable JSON) zero them — tokens/cost are kept either way, so spend is always measured. `settle` is idempotent. Free-by-design actions (`parse`, `usuals`, `aisle` by weight) open with 0 credits, so they are logged and burst-capped but never charge. Usage is **`SUM(credits)`** over `ok` + fresh `pending` rows (a `pending` older than ten minutes is a crashed request); `countRecentUsage` is the burst counter. `recipe_imports` was backfilled into `ai_usage` (`meta.legacy = true`) and dropped (migration 019).

**Entitlement — plan, trial, credits (`db.getEntitlement`, `lib/credits.js`, migration 016).** One read answers everything: `{ plan: 'premium'|'trial'|'free', trialEndsAt, credits: { used, allowance (null = unlimited), remaining, unlimited, exhausted, resetsAt, periodStart }, weights, memberLimit (null = unlimited), founder, billingInterval }`. The rules are pure and tested (`test/credits.test.js`): premium while `plan='premium'` and `premium_until` is null/ahead; **trial = free plan with `trial_ends_at` ahead** (no Stripe involvement — it is granted at signup with no card); else free. Every household row carries a **snapshot** of the launch knobs (`credit_allowance` 50, `premium_credit_allowance` 300 — also the trial's cap; NULL = unlimited, which is what a comp gets — `credit_weights`, `member_limit` 2) taken by `db.insertHousehold` from **`app_config`** (`lib/config.js`, cached 30 s, edited via `GET/PUT /admin/config`), so changing config affects new households only — early users are grandfathered. `trial_ends_at` is the **user's** `createdAt` + `trial_days`, so leave → fresh household can't mint a second trial. The credit period is the household's signup anniversary: `credit_period(anchor, at)` in SQL (the only implementation; `test/credit-period.test.js` runs it against a real database — `node -r dotenv/config --test test/credit-period.test.js`) adds whole months to the original anchor day (31 Jan → 28 Feb → 31 Mar), Europe/London, end exclusive; nothing is reset or stored per period. `GET /shopping-list` returns `entitlement`. Errors from `db.withStatus(msg, status, code)` reach the client as `{ error: code, message }` (`app.js`). **Annual plan + founders' offer (`lib/offers.js`, `lib/stripe.js`).** One Stripe plan, two prices: `STRIPE_PREMIUM_ANNUAL_PRICE_ID` becomes the plugin's `annualDiscountPriceId` and the client asks for it with `subscription.upgrade({ plan: "premium", annual: true })`; `billing_interval` is mirrored onto the household. The founders' offer is a **Stripe Coupon** (`duration: forever`, `amount_off` with per-currency amounts, `max_redemptions` = the cap) whose id lives in `app_config.founders_coupon`: `getCheckoutSessionParams` adds `discounts: [{ coupon }]` to annual checkouts while `GET /premium/offers` (coupon looked up live, cached 60 s) says places remain — Stripe enforces the cap, an exhausted coupon fails Checkout and the frontend says so. When a paid subscription syncs, `markFounderIfCouponUsed` reads the subscription's discounts once and sets `household.founder` + logs `founder_redeemed`. **Background jobs — `lib/jobs.js` + `lib/jobs-registry.js`.** One hourly tick runs every registered job in order, each in its own try/catch; `app.js` calls `registerAll()` then `startJobs()` after listen. Jobs are idempotent by claiming their work in the database, so restarts and a second instance are harmless. Registered today: `trial-prompts`, `snapshots`, `weekly-digest` (the two email jobs are disabled without `RESEND_API_KEY`). Add a job = one line in the registry.

**Daily metric snapshots (`lib/snapshots.js`, migration 020).** `computeDay(day)` builds one London day's numbers — stocks (users, paying, MRR at list price from `lib/pricing.js`, trials active…) and flows (signups, AI actions/cost, lists, shops, trials, cancellations, CTA taps, checkouts, onboarding, recipes by source) plus D1/D7/D30 for the cohorts that matured that day — and `writeMissingSnapshots()` (the job) writes every missing day back to 90, claiming each with `ON CONFLICT (day) DO NOTHING`. Flows are exact for any day; stocks written after the fact carry today's values and are listed in `metrics.reconstructed`. `scripts/backfill-snapshots.js [days]` is the one-off. `GET /admin/history?months=12` rolls them up (stocks = last day, flows summed, retention weighted; current month flagged partial), `&format=csv` streams a BOM-prefixed CSV. **The Monday digest (`lib/digest.js`)** emails `ADMIN_EMAILS` last week vs the week before from the same snapshots, claimed per ISO week in `app_events` (`admin_digest`, unique index).

**Events added for the dashboard:** `shop_finished { items, collected }` (end of the weekly loop — logged by `POST /generated-shopping-list/clear-collected`, the shop page's "Clear collected", whenever at least one item was collected; the activation funnel and shops-per-household read it), `subscription_cancelled` / `subscription_ended` (from the Stripe callbacks, with interval and days subscribed), `checkout_started { interval, founders, from }` (client-side, just before Checkout; `from` is the CTA that brought them to /premium), `trial_prompt_failed`, `recipe_created.meta.source` (`recipe_source` on `POST /recipes`: manual | import | photo | generate | social | share | starter | usuals) and `onboarding_completed.meta.ms`. `GET /admin/onboarding?days` computes the questionnaire funnel (step reach, where people skip, dietary answers, starters vs usuals, and what completers did in the following 7 days) from the events the wizard already logs. `GET /shopping-list` carries `isAdmin` so the app can show the Back of house link (the gate stays server-side), plus `householdMemberCount` and `householdPendingInvites`, which the frontend's "shop together" sheet (`household-nudge.tsx`, first open of the aisle list by a solo household) decides on. **Household events (2026-09-06):** server-side `invite_sent { seats, limit, plan }`, `invite_accepted` (household_id = the joined household; skipped when already a member), `invite_revoked`, `member_removed`, `member_left`; client-side (whitelisted) `household_nudge_shown { source }` and `household_nudge_outcome { source, outcome: invited | later | never | dismissed }`. Snapshots carry `invites_sent`, `invites_accepted`, `nudges_shown`, `nudges_invited`; `/admin/overview` returns `householdNudge` (funnel + invite flow + solo households active in the window).

**Inspiration pool (migration 022, `lib/suggestions/*`).** `POST /recipes/suggest` no longer runs the model on every tap. Ideas are pooled GLOBALLY in `suggestion_pool` by `suggestKey(hint)` (lower-cased, punctuation stripped, `'anything'` for none) and the household's `dietSignature()` (sorted diets from the kitchen-wide rule ∪ every member's answers — `db.getSuggestContext`, which now has a caller). A tap on a pool holding ≥ `POOL_SERVE_MIN` (12) ideas is served a random `SERVE_COUNT` (6) the household doesn't own (the client sends `exclude: titles[]`), `usage_count` bumps, no model runs — **it still costs 1 credit** (same value, cheaper for us). A miss runs Haiku with the diets in the prompt and the pool's titles as "don't repeat" (`lib/suggestions/prompt.js`, shared with the seed builder), merges the answer in (deduped by title, capped at 24 — oldest dropped so "Again" keeps moving) and serves it; a model failure with a non-empty pool falls back to the pool. Ledger meta carries `cached` / `pool` / `fallback`; `/admin/ai` returns `suggestPool { served, fromPool, pools, ideas }`. **Ideas become full recipes on add** (`POST /recipes/suggest/add { hint, titles[] }`, `lib/suggestions/write.js`): an idea whose `recipe` is already on the pool row (description, ingredient lines with quantities, method one step per line, times, servings, estimated macros) is created free; one without runs Haiku (`generate` action, 1 credit each, refunded per failure) and the result is stored back on the pool idea so every later household gets it free. The suggest response marks each idea `ready` so the client can price the Add button. Recipes land with `recipe_source: 'suggest'`. **Seed:** `lib/suggestions/terms.js` (50 terms × plain/vegetarian/vegan; TWIN of the frontend's `inspiration-terms.ts`) → `scripts/build-suggestion-seed.js` (run once locally; ~150 idea calls + ~1,800 full-recipe calls, 6 in flight, resumable, saves after every pool) writes `lib/suggestions/suggestion-seed.js`, which `scripts/seed-suggestions.js` loads on every deploy with `ON CONFLICT DO NOTHING` (railway.toml).

**Installed-app tracking (migration 021, `lib/clientHint.js`).** iOS never says "installed", so the frontend sends `X-Fornetto-Client: <standalone|browser>/<platform>` on every data request (`src/lib/client-hint.ts`; standalone = display-mode standalone or `navigator.standalone`). `requireAuth` parses it strictly (junk = no hint, tested in `test/client-hint.test.js`) and `db.recordUserActivity(userId, hint)` upserts the day's `user_activity` row with `standalone` / `platform` and, on a standalone request, stamps `user.installed_at` (first), `installed_platform` and `last_standalone_at`. The per-process memo in `requireAuth` remembers whether today has already been marked standalone, so a browser visit then a home-screen launch on the same day still writes once more. The migration backfills both from the `install_standalone_open` events. Snapshots carry `installed_users` (exact for any day), `standalone_active_users` / `_7d` / `_30d`; the digest reports installed users and "used the installed app this week"; `GET /admin/installs?days` is the tab. The comparison there is installed people vs everyone else — installed people are self-selected, so it describes the two groups rather than the effect of installing.

**Trial prompts (`lib/trial.js`, migration 017).** Exactly two emails — four days before the trial ends and on its last day — from an hourly in-process sweep started in `app.js` (skipped without `RESEND_API_KEY`). Each send is a database claim first (`db.claimTrialPrompt` inserts the `trial_prompt` event under a unique index on household × stage × channel and only sends when the insert won), so a restart or a second instance can't double-send; the in-app card (frontend `TrialPrompt`) logs the same event with channel `app`. Only the owner is emailed. `/admin/credits` reports the funnel. Stripe: `getCheckoutSessionParams` passes `subscription_data.trial_end` when a trialling household converts with ≥ 48 h left, so nobody pays for days already promised; the first sync that turns a trialling household premium logs `trial_converted`; `billing_interval` is mirrored onto the household.

`middleware/requireAuth.js` also upserts `user_activity (user_id, day)` once per user per London day (process-local memo) — the basis for the day-1/7/30 retention figures on `/admin/overview`. `GET /admin/ai?days=` slices the ledger per action/model/household (cost, tokens, p50/p95 latency, refund/fail/reject counts) for the back-of-house dashboard.

**Aisle cache — `lib/ingredients/` (migration 018).** "Generate list by aisle" places almost everything without a model. `normalise.js` turns a line ("2 large free-range eggs, beaten") into a key ("egg") plus a backoff chain; `organise.js` resolves every line against the **global** `ingredient_aisles` table (seeded with ~750 UK items by `scripts/seed-ingredient-aisles.js`, idempotent, run on every Railway start), refuses to guess from a bare ambiguous head ("pepper"), and sends only the deduplicated misses to Haiku in ONE call that may answer only with a slug from `aisles.js` (21 aisles + Other; `AISLES` = display labels, key order = UK walking order). Model answers are written back (`source='model'`, confidence 0.5 — the admin review queue), unplaceable keys go to `ingredient_aisle_misses`. Rows keep `product_name` **verbatim** (the delete endpoint matches on it), duplicates of one ingredient merge, and `createShoppingListByAisles` writes them in one transaction in walking order (`getGeneratedShoppingListItems` orders by id). The action is 0 credits but still burst-capped and logged (`meta.hits/misses/modelCalls`). Seed source of truth is `seed-source.js` → `node lib/ingredients/build-seed.js` regenerates `ingredient-aisles.seed.js` (fails on collisions / non-idempotent keys). Admin: `GET /admin/aisles` (queue, misses, stats), `PUT /admin/aisles/:id`, `DELETE /admin/aisles/:id`, `POST /admin/aisles`. Tests: `test/normalise-ingredient.test.js` (pure) and `test/organise.test.js` (database-backed: a 30-line list → zero model calls; a miss is asked once, written back, and hits next time).

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
