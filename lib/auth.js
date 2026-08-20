const { betterAuth } = require("better-auth");
const { Pool } = require("pg");
const { deleteAsset } = require("./cloudinary");

const pool = new Pool({
    host: process.env.HOST,
    user: process.env.USER,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.DATABASE_PORT,
});

const auth = betterAuth({
    database: pool,
    trustedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["http://localhost:3000"],
    emailAndPassword: {
        enabled: true,
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
