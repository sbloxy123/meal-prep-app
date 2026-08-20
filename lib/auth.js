const { betterAuth } = require("better-auth");
const { Pool } = require("pg");
const { deleteAsset } = require("./cloudinary");
const { sendEmail, actionEmail } = require("./email");

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

const auth = betterAuth({
    database: pool,
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
                subject: "Reset your Mise en Place password",
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
                subject: "Verify your email for Mise en Place",
                text: `Verify your email: ${throughFrontend(url)}`,
                html: actionEmail({
                    heading: "Confirm your email",
                    body: "Welcome to Mise en Place. Confirm your email address to start planning your week.",
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
