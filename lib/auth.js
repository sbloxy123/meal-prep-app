const { betterAuth } = require("better-auth");
const { Pool } = require("pg");
const { deleteAsset } = require("./cloudinary");
const { sendEmail, actionEmail } = require("./email");
const db = require("../db/queries");

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
        await db.setHouseholdPremiumFromSubscription({
            userId: subscription.referenceId,
            isPremium,
            periodEnd: subscription.periodEnd ?? null,
            stripeCustomerId: subscription.stripeCustomerId ?? null,
            stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
        });
    } catch (error) {
        console.error("[stripe] household sync failed:", error.message);
    }
}

// Only wire Stripe when configured, so local/dev can boot without the keys.
const plugins = [];
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PREMIUM_PRICE_ID) {
    const Stripe = require("stripe");
    const { stripe } = require("@better-auth/stripe");
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    plugins.push(
        stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            createCustomerOnSignUp: true,
            subscription: {
                enabled: true,
                plans: [{ name: "premium", priceId: process.env.STRIPE_PREMIUM_PRICE_ID }],
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
