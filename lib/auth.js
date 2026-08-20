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
            // Purge the user's Cloudinary photos before the account is removed.
            // The user_id foreign keys are ON DELETE CASCADE, so deleting the
            // user row drops their recipes/shopping lists automatically — but
            // that cascade bypasses the per-recipe controller that normally
            // cleans up the Cloudinary asset, so we do it here first.
            beforeDelete: async (user) => {
                try {
                    const { rows } = await pool.query(
                        "SELECT image_public_id FROM recipes WHERE user_id = $1 AND image_public_id IS NOT NULL",
                        [user.id],
                    );
                    for (const { image_public_id } of rows) {
                        await deleteAsset(image_public_id);
                    }
                } catch (error) {
                    // Don't block account deletion on a Cloudinary hiccup.
                    console.error("[deleteUser] cloudinary purge failed", error.message);
                }
            },
        },
    },
});

module.exports = { auth };
