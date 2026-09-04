const { betterAuth } = require("better-auth");
const { Pool } = require("pg");
const { deleteAsset } = require("./cloudinary");
const { sendEmail, actionEmail } = require("./email");
const { sendInstallEmailAfterVerification } = require("./install");
const db = require("../db/queries");
const { stripeClient } = require("./stripe");
const { getOffers, invalidateOffers } = require("./offers");

const pool = new Pool({
    host: process.env.HOST,
    user: process.env.USER,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.DATABASE_PORT,
});

// The frontend origin (first ALLOWED_ORIGINS entry). BetterAuth builds
// reset/verification links against this API's own URL, but the browser must
// hit them through the Next.js proxy so the session cookie is set same-origin
// with the app (the whole reason the /api/auth proxy exists). Rewrite the link
// origin to the frontend; the proxy forwards /api/auth/* back here.
const FRONTEND_URL = (
    process.env.ALLOWED_ORIGINS?.split(",")[0] || "http://localhost:3000"
).trim();

function throughFrontend(url) {
    try {
        const link = new URL(url);
        const front = new URL(FRONTEND_URL);
        link.protocol = front.protocol;
        link.host = front.host;
        return link.toString();
    } catch {
        return url;
    }
}

// Mirror a Stripe subscription's state onto the payer's household. The plugin
// keys subscriptions to the user (referenceId = user.id); household.plan is our
// entitlement source of truth. active/trialing → premium, anything else → free.
async function syncSubscriptionToHousehold(subscription) {
    if (!subscription?.referenceId) return;
    const isPremium = ["active", "trialing"].includes(subscription.status);
    try {
        const before = await db.getHouseholdIdForUser(subscription.referenceId);
        const wasTrial = before ? (await db.getEntitlement(before)).plan === "trial" : false;
        await db.setHouseholdPremiumFromSubscription({
            userId: subscription.referenceId,
            isPremium,
            periodEnd: subscription.periodEnd ?? null,
            stripeCustomerId: subscription.stripeCustomerId ?? null,
            stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
            billingInterval: subscription.billingInterval ?? null,
        });
        if (isPremium && before) await markFounderIfCouponUsed(subscription, before);
        // Trial → paid is the conversion the funnel is built around. Logged once,
        // on the first sync that turns a trialling household premium.
        if (isPremium && wasTrial && before) {
            const already = await db.hasEventMeta("trial_converted", "household_id", before);
            if (!already) {
                db.recordEvent("trial_converted", {
                    userId: subscription.referenceId,
                    householdId: before,
                    meta: { household_id: before, interval: subscription.billingInterval ?? null },
                });
            }
        }
    } catch (error) {
        console.error("[stripe] household sync failed:", error.message);
    }
}

// The founders' offer is a Stripe coupon on the subscription. When a paid
// subscription syncs, look at its discounts once and flag the household, so
// the Account page can show the badge and the dashboard can count them.
async function markFounderIfCouponUsed(subscription, householdId) {
    try {
        if (!stripeClient || !subscription.stripeSubscriptionId) return;
        const { getConfig } = require("./config");
        const cfg = await getConfig();
        if (!cfg.founders_coupon) return;
        const already = await db.hasEventMeta("founder_redeemed", "household_id", householdId);
        if (already) return;
        const sub = await stripeClient.subscriptions.retrieve(subscription.stripeSubscriptionId, {
            expand: ["discounts"],
        });
        const couponIds = [
            ...(Array.isArray(sub.discounts) ? sub.discounts : []).map((d) =>
                typeof d === "string" ? null : d?.coupon?.id ?? null,
            ),
            sub.discount?.coupon?.id ?? null,
        ].filter(Boolean);
        if (!couponIds.includes(cfg.founders_coupon)) return;
        await db.setHouseholdFounder(householdId, true);
        db.recordEvent("founder_redeemed", {
            userId: subscription.referenceId,
            householdId,
            meta: { household_id: householdId, coupon: cfg.founders_coupon },
        });
        invalidateOffers();
    } catch (error) {
        console.error("[stripe] founder check failed:", error.message);
    }
}

// Converting during the trial should not cost the days already promised:
// pass the household's trial end to Checkout so billing starts then. Stripe
// needs the trial end at least 48 hours out; nearer than that (or after it)
// billing simply starts now.
// …and an annual checkout while the founders' offer has places left carries
// the founders' coupon (Stripe enforces max_redemptions; an exhausted coupon
// makes Checkout fail, which the frontend turns into "places are gone").
const STRIPE_MIN_TRIAL_MS = 48 * 60 * 60 * 1000;
async function checkoutParamsFor({ user }, _req, ctx) {
    const params = {};
    try {
        const householdId = await db.getHouseholdIdForUser(user.id);
        if (householdId) {
            const ent = await db.getEntitlement(householdId);
            if (ent.plan === "trial" && ent.trialEndsAt) {
                const endsAt = new Date(ent.trialEndsAt).getTime();
                if (endsAt - Date.now() >= STRIPE_MIN_TRIAL_MS) {
                    params.subscription_data = { trial_end: Math.floor(endsAt / 1000) };
                }
            }
        }
        if (ctx?.body?.annual) {
            const offers = await getOffers();
            if (offers.founders.available && offers.founders.coupon) {
                params.discounts = [{ coupon: offers.founders.coupon }];
            }
        }
    } catch (error) {
        console.error("[stripe] checkout params:", error.message);
    }
    return Object.keys(params).length ? { params } : {};
}

// Only wire Stripe when configured, so local/dev can boot without the keys.
const plugins = [];
if (stripeClient && process.env.STRIPE_PREMIUM_PRICE_ID) {
    const { stripe } = require("@better-auth/stripe");
    plugins.push(
        stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            createCustomerOnSignUp: true,
            subscription: {
                enabled: true,
                // One plan, two prices. The client picks the yearly one with
                // upgrade({ plan: "premium", annual: true }); without the env
                // var the plugin simply has no annual price to offer.
                plans: [
                    {
                        name: "premium",
                        priceId: process.env.STRIPE_PREMIUM_PRICE_ID,
                        ...(process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID
                            ? { annualDiscountPriceId: process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID }
                            : {}),
                    },
                ],
                getCheckoutSessionParams: checkoutParamsFor,
                onSubscriptionComplete: async ({ subscription }) =>
                    syncSubscriptionToHousehold(subscription),
                onSubscriptionUpdate: async ({ subscription }) =>
                    syncSubscriptionToHousehold(subscription),
                onSubscriptionCancel: async ({ subscription }) =>
                    syncSubscriptionToHousehold(subscription),
                onSubscriptionDeleted: async ({ subscription }) =>
                    syncSubscriptionToHousehold(subscription),
            },
        }),
    );
} else {
    console.warn("[stripe] STRIPE_SECRET_KEY / STRIPE_PREMIUM_PRICE_ID not set — payments disabled");
}

const auth = betterAuth({
    // The client reaches auth through the Next.js proxy at the frontend origin, so
    // that's the canonical base. Without this, BetterAuth infers the base from the
    // (proxied) request — the Railway host — and its post-verify redirect for
    // password-reset / email-verification lands on the API domain, which serves no
    // such page (a broken link). Setting it makes both the emailed link and the
    // redirect resolve to the app. FRONTEND_URL = ALLOWED_ORIGINS[0].
    baseURL: FRONTEND_URL,
    database: pool,
    plugins,
    trustedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["http://localhost:3000"],
    emailAndPassword: {
        enabled: true,
        // Users must confirm their email before they can sign in.
        requireEmailVerification: true,
        sendResetPassword: async ({ user, url }) => {
            await sendEmail({
                to: user.email,
                subject: "Reset your Fornetto password",
                text: `Reset your password: ${throughFrontend(url)}`,
                html: actionEmail({
                    heading: "Reset your password",
                    body: "We received a request to reset your password. This link expires in one hour. If you didn't ask for this, you can ignore this email.",
                    buttonLabel: "Choose a new password",
                    url: throughFrontend(url),
                }),
            });
        },
    },
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
            await sendEmail({
                to: user.email,
                subject: "Verify your email for Fornetto",
                text: `Verify your email: ${throughFrontend(url)}`,
                html: actionEmail({
                    heading: "Confirm your email",
                    body: "Welcome to Fornetto. Confirm your email address to start planning your week.",
                    buttonLabel: "Verify email",
                    url: throughFrontend(url),
                }),
            });
        },
        // Follow up with the "put it on your home screen" email. BetterAuth
        // awaits this hook before it sets the session cookie and redirects,
        // and sendEmail throws on a Resend failure — so fire and forget: a
        // slow or failed send must never delay or break verification.
        afterEmailVerification: async (user) => {
            void sendInstallEmailAfterVerification(user).catch((err) =>
                console.error("[install email] after verification:", err.message ?? err),
            );
        },
    },
    // Throttle credential endpoints. Note: behind the Next proxy the client IP
    // seen here may be the proxy's — tighten with advanced.ipAddress headers if
    // per-user limiting is needed.
    rateLimit: {
        enabled: true,
        window: 60,
        max: 100,
        customRules: {
            "/sign-in/email": { window: 60, max: 5 },
            "/sign-up/email": { window: 60, max: 5 },
            "/request-password-reset": { window: 3600, max: 3 },
            "/send-verification-email": { window: 3600, max: 3 },
        },
    },
    user: {
        deleteUser: {
            enabled: true,
            // Account deletion under households:
            //  - Sole member of their household → the data is theirs alone:
            //    purge its Cloudinary photos, then delete the household, which
            //    cascades the recipes/lists via household_id.
            //  - Member of a shared household → leave the shared data intact;
            //    recipes.user_id is ON DELETE SET NULL (migration 007), so the
            //    recipes stay and just lose their "added by" attribution.
            beforeDelete: async (user) => {
                try {
                    // Entitlement follows the payer: if they leave, any household
                    // they were paying for drops back to free. (Their Stripe
                    // subscription is cancelled via the billing portal / Stripe
                    // when the customer is removed.)
                    await db.clearHouseholdPremiumByPayer(user.id);

                    const { rows: memRows } = await pool.query(
                        "SELECT household_id FROM household_member WHERE user_id = $1",
                        [user.id],
                    );
                    const householdId = memRows[0]?.household_id;
                    if (!householdId) return;

                    const { rows: cntRows } = await pool.query(
                        "SELECT COUNT(*)::int AS n FROM household_member WHERE household_id = $1",
                        [householdId],
                    );
                    if (cntRows[0].n > 1) return; // shared — keep the data

                    const { rows } = await pool.query(
                        "SELECT image_public_id FROM recipes WHERE household_id = $1 AND image_public_id IS NOT NULL",
                        [householdId],
                    );
                    for (const { image_public_id } of rows) {
                        await deleteAsset(image_public_id);
                    }
                    await pool.query("DELETE FROM household WHERE id = $1", [householdId]);
                } catch (error) {
                    // Don't block account deletion on a cleanup hiccup.
                    console.error("[deleteUser] household cleanup failed", error.message);
                }
            },
        },
    },
});

module.exports = { auth };
