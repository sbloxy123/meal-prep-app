const { betterAuth } = require("better-auth");
const { Pool } = require("pg");

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
});

module.exports = { auth };
