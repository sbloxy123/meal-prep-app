# Stripe setup for the credits launch

What the code expects from the Stripe Dashboard, in the order the phases need it. Do everything in **live** mode, then repeat in **test** mode for local / preview checkout (live and test ids are not interchangeable — a test price id under a live key fails with "No such price"). Every price must have the **same tax behaviour** as the current £2.99 price (Products → the price → "Include tax in price" = automatic, tax code `txcd_10105001`).

Env vars live on Railway (service **meal-prep-app**); the founders' coupon id is set in the app itself (`/back-of-house` → Plan settings), not as an env var.

## 1. Monthly price £3.99 — needed by phase 2 (`feat/credits`, backend PR #27)

1. Dashboard → Products → **Fornetto Premium** → **Add another price**.
2. Recurring, **monthly**, £3.99 GBP. Add the other currencies the current price has (USD, EUR) — one multi-currency price, exactly like the £2.99 one.
3. Copy the new price id (`price_…`).
4. Railway → meal-prep-app → Variables → `STRIPE_PREMIUM_PRICE_ID` = the new id. Redeploy.
5. **Archive** the £2.99 price (don't delete it). There are no live subscriptions on it.
6. Verify: on the deployed app, `/premium` → Go Premium → Checkout shows £3.99/month. Complete one with a test card in test mode, or cancel.

## 2. Annual price £29.99 — needed by phase 6 (`feat/annual-plan`)

1. Same product → **Add another price**: recurring, **yearly**, £29.99 GBP, plus USD/EUR amounts.
2. Railway → `STRIPE_PREMIUM_ANNUAL_PRICE_ID` = the new price id. Redeploy.
3. Verify: `/premium` now shows the Monthly / Yearly toggle; Yearly → Checkout shows £29.99/year.

## 3. Founders' coupon — phase 6, optional, switch on when you want the launch offer live

The offer is "£19.99 a year, locked in, for the first 200". It is a coupon so Stripe polices the cap.

1. Dashboard → Products → **Coupons** → **New**.
2. Type: **Fixed amount**, £10.00 off GBP. Under currency options add USD and EUR amounts that land the yearly price on a round number in each currency.
3. Duration: **Forever** (so it applies to every renewal — that is what "locked in" means).
4. **Max redemptions: 200**. Apply to specific products: Fornetto Premium.
5. Copy the coupon **id** (Stripe shows it in the URL / the coupon page, e.g. `Z4kd8xyz`).
6. In the app: `/back-of-house` → Plan settings → **Founders' coupon id** = that id, **Founders' cap** = 200 → Save.
7. Verify: `/premium` shows the founders' card on the Yearly option with "200 left"; Checkout shows £19.99 with the discount line. After one redemption the card reads "199 left" (within a minute — the count is cached).
8. To end the offer early: set the coupon id blank in Plan settings, or delete the coupon in Stripe. Existing founders keep the discount on their subscription.

## 4. Webhook — already configured (`/api/auth/stripe/webhook`); nothing to change

The plugin's webhook handles `customer.subscription.*` for both prices and the coupon. If you ever recreate the endpoint, set `STRIPE_WEBHOOK_SECRET` again.

## Test mode

Repeat 1–3 with test-mode prices/coupon and put the test ids in the local `.env` (`STRIPE_SECRET_KEY` test key, `STRIPE_PREMIUM_PRICE_ID`, `STRIPE_PREMIUM_ANNUAL_PRICE_ID`) and the test coupon id in the local database's Plan settings. Test cards: `4242 4242 4242 4242`, any future expiry, any CVC.

## What to check after each deploy

| After | Check |
|---|---|
| Phase 2 | `/premium` shows £3.99; a checkout completes; Account shows "Your household is on Premium — 300 of 300 credits". |
| Phase 6 | Yearly toggle appears; a yearly checkout completes; Account says "Billed yearly". Founders' card appears once the coupon id is saved; a founders' checkout shows the discount and the household gets the badge. |
