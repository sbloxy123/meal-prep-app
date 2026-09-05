# Fornetto monetisation — the strategy in one place

As of 4 September 2026. This is the reference for how Fornetto makes money and why. When a rule here changes, change it here first; `CLAUDE.md` in both repos points at this file.

## The model in one paragraph

Fornetto is free to use forever: recipes, the weekly menu, the shopping list and shopping mode never cost anything, and nothing a person creates is ever taken away. What is metered is new AI work, in **credits** that top up monthly on each household's signup anniversary. Every new account gets **14 days of full Premium with no card**, then drops to the free plan. Premium is **£3.99 a month or £29.99 a year**, per household: six times the AI credits and a household of any size. The paywall has two moments: credits bite heavy AI users early; household seats bite later, when someone wants to bring a third person in.

## Plans

| Plan | Price | AI credits / month | Household size |
|---|---|---|---|
| Free | £0 | 50 | 2 people |
| Trial (first 14 days) | £0, no card | 300 | unlimited |
| Premium | £3.99 / month or £29.99 / year | 300 (soft cap) | unlimited |
| Comp (friends & family, set in Back of house) | £0 | unlimited | unlimited |

"Soft cap" means Premium is sold as "six times the AI", not "unlimited"; the cap exists to bound the worst-case bill and the per-action 6-hour burst limits still apply to everyone.

## What costs what

| Action | Credits |
|---|---|
| Photo scan of a cookbook page (up to 4 photos) | 3 |
| Website import (charged even when no AI was needed) | 1 |
| Social import (Instagram / TikTok / YouTube) | 1 |
| Recipe from a title | 1 |
| Improve recipe | 1 |
| Estimate macros | 1 |
| Give me inspiration | 1 |
| Generate list by aisle | 0 |
| Paste text into the shopping list | 0 |
| "My usuals" during onboarding | 0 |

A failed call never charges. A completed call that produced nothing usable (page wasn't a recipe, photo unreadable) is refunded. In-flight work counts against the balance until it settles.

## Periods and resets

Each household's credit period runs from its signup anniversary, on the same day each month (31 January → 28 February → 31 March, never drifting), Europe/London time. Nothing is reset or stored: usage is the sum of credits spent since the period started. Copy says "tops up on the 14th".

## Grandfathering

Every household carries a snapshot of the plan rules taken when it was created: free credits, premium credits, credit weights, household size. Changing a rule in **Back of house → Plan settings** affects households created afterwards only. Early users keep what they signed up with, permanently, without any migration.

## The trial

- Starts at signup, dated from the user's account (leaving a household and getting a new one cannot restart it).
- Full Premium for 14 days: 300 credits, unlimited household.
- Exactly two prompts: an email and an in-app card four days before the end, and again on the last day. A third in-app card appears once after the trial ends. Nothing else nags.
- Converting mid-trial keeps the free days: billing starts when the trial would have ended anyway.
- Trial length is a Plan settings value (14 today; 21 if the data says people convert on their third weekly shop).

## Household seats

- Free households can have 2 people (the owner plus one). Pending invites hold a seat.
- Trial and Premium households have no limit.
- The upgrade prompt sits in the invite form, at the moment someone tries to add a person.
- If a Premium household lapses to free with more than 2 people, **nobody is removed**. Only new invites are blocked.
- The limit can be lowered to 1 for new signups later; existing households keep 2.

## Annual plan and the founders' offer

- Yearly is £29.99, two months free against monthly. It is sold as an equal choice on the upgrade page with a "Best value" badge; monthly stays preselected.
- **Founders' offer (built, switched off):** £19.99 a year locked in for the first 200 households to go yearly, implemented as a capped Stripe coupon. It turns on when the coupon id is pasted into Plan settings. Before enabling: decide the depth and the cap, tie it to a launch moment, and restrict plan-switching in the Stripe customer portal (a forever coupon would otherwise follow a subscription onto the £3.99 monthly price). Steps in `STRIPE-SETUP.md`.

## Where each knob lives

| Knob | Where |
|---|---|
| Trial length, free credits, premium credits, credit weights, free household size, founders' coupon id / cap | Back of house → Plan settings (applies to new signups) |
| Monthly and yearly prices | Stripe Dashboard prices + `STRIPE_PREMIUM_PRICE_ID` / `STRIPE_PREMIUM_ANNUAL_PRICE_ID` on Railway |
| Per-action 6-hour burst limits | Code (`controllers/recipeImportController.js`, `shoppingListController.js`) |
| Comps | Back of house → Premium grants |
| AI model prices and the USD→GBP rate for cost reporting | Code (`lib/aiCost.js`; `AI_USD_TO_GBP` env) |

## What the dashboard tells you

Back of house (`/back-of-house`, linked from the rail and Account for admin accounts) is organised in tabs:

- **Overview** — users, active 7 days, day-7 retention, paying households + MRR, AI cost per paying household, trial-to-paid; alerts; and the **month-by-month table** from nightly snapshots (CSV download). Stocks are the month's last day, everything else is the month's total; greyed cells were reconstructed after the fact.
- **Users** — one person at a time: search, segments, sort. Tap a row for their plan, credits, household, activity and **recipe list (titles and metadata only)**. "Open" shows a full recipe, asks for a one-line reason, and is logged.
- **Engagement** — active users, signups, retention, household sizes, devices, the install funnel, and **What people add**: anonymous recipe stats (source mix, photos, links, on-the-week rate, dishes recurring across households, latest titles).
- **Installs** — who has put Fornetto on a home screen (the app records whether each day's use came from the installed app or a browser tab): install rate by signup month, platform split, installed vs browser usage and retention, week-by-week split, recent installs. Installed people are self-selected, so read the comparison as a description of the two groups, not as proof that installing causes the difference.
- **Onboarding** — the questionnaire step by step: where people skip, dietary answers, starters vs their own meals, and what completers did in the week after.
- **AI & cost** — per action, model and household: cost, tokens, latency, refunds, failures, refusals; aisle-sort model calls.
- **Credits & revenue** — credits used per plan with percentiles and ceiling hits; the trial funnel; invites blocked by seats; paying monthly / yearly / founders.
- **Aisle cache** — the review queue.
- **Settings** — Plan settings, Premium grants, and the **access log** (who opened whose profile or recipe, and why).

Looking at what people add is a legitimate interest, and the app says so on `/privacy` (linked from the homepage footer, sign-up and Account). Keep it proportionate: the aggregate panel first, a person's titles when you need them, a full recipe only with a reason.

A **Monday email** to the admin addresses carries last week's key numbers with the week-on-week change. MRR everywhere is at the GBP list price (USD/EUR subscribers count as £3.99 / £29.99); Stripe is the source of truth for actual money.

## The 60-day review

Look at these before touching price or limits:

1. **Retention first.** Day-7 and day-30 retention gate everything else. If people don't come back for a second and third shop, pricing is not the problem.
2. **Ceiling hits.** What share of free households reach 50 credits in a period, and where the 90th percentile sits. If almost nobody hits it, the free tier is too generous to convert; if most do in week one, too tight.
3. **Trial conversion.** Trials started → converted, and whether conversions cluster after the day-4 or last-day prompt.
4. **Seat hits.** How often free households try to invite a third person. This is the household paywall firing.
5. **Annual share.** Fraction of paying households on yearly.

Levers deliberately left for later: the founders' offer; one-off credit packs (e.g. £1.99 for 30) for "digitise one cookbook" people; a 21-day trial; free household size of 1; a logged-out "paste a link" demo on the homepage for social traffic; the price itself (revisit with data, not before).
