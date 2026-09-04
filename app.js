require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { toNodeHandler } = require("better-auth/node");
const { auth } = require("./lib/auth");
const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000"];

const corsMiddleware = cors({ origin: allowedOrigins, credentials: true });

// cors() runs first for ALL routes — handles OPTIONS preflight (BetterAuth
// returns 404 for OPTIONS) and sets Access-Control-Allow-Origin on auth
// responses (BetterAuth does not set CORS headers itself).
app.use(corsMiddleware);

// BetterAuth intercepts /api/auth/* before express.json() because it reads
// the raw body stream (express.json() would consume it first).
app.use((req, res, next) => {
    if (req.url.startsWith("/api/auth")) {
        return toNodeHandler(auth)(req, res);
    }
    next();
});

// Photo → recipe sends base64 image data, which exceeds the default ~100kb JSON
// limit. Parse this one route with a larger cap before the global parser below
// (the global express.json() would otherwise 413 the body first). Once parsed,
// the second express.json() is a no-op for this request.
app.use("/recipes/parse-from-photo", express.json({ limit: "12mb" }));

app.use(express.json());

const recipesRouter = require("./routes/recipesRouter");
const sharedRecipeRouter = require("./routes/sharedRecipeRouter");
const shoppingListRouter = require("./routes/shoppingListRouter");
const generatedShoppingListRouter = require("./routes/generatedShoppingListRouter");
const householdRouter = require("./routes/householdRouter");
const premiumRouter = require("./routes/premiumRouter");
const eventsRouter = require("./routes/eventsRouter");
const installRouter = require("./routes/installRouter");
const adminRouter = require("./routes/adminRouter");
const initializeDatabase = require("./db/init");
const { requireAuth } = require("./middleware/requireAuth");
const { requireAdmin } = require("./middleware/requireAdmin");

app.use("/shopping-list", requireAuth, shoppingListRouter);
app.use("/recipes", requireAuth, recipesRouter);
// Public before the auth-guarded mount: exact path matches first (registration
// order), so crawlers can read a shared recipe's title/image for the link unfurl
// without a session. Everything else under /shared-recipe stays auth-guarded.
app.get(
    "/shared-recipe/:token/meta",
    require("./controllers/recipeShareController").getSharedRecipeMeta,
);
app.use("/shared-recipe", requireAuth, sharedRecipeRouter);
app.use("/generated-shopping-list", requireAuth, generatedShoppingListRouter);
app.use("/household", requireAuth, householdRouter);
app.use("/premium", requireAuth, premiumRouter);
app.use("/events", requireAuth, eventsRouter);
app.use("/install", requireAuth, installRouter);
app.use("/admin", requireAuth, requireAdmin, adminRouter);

app.get("/", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
    console.error(err);
    // Controllers/queries can throw errors carrying an HTTP status (e.g. an
    // expired invite → 410); fall back to 500 for anything unexpected. When
    // the error also carries a machine `code` (db.withStatus(msg, status,
    // code) — HOUSEHOLD_LIMIT, PREMIUM_MERGE…) it goes in `error`, the field
    // the frontend branches on, and the human text in `message` — the same
    // shape as the AI endpoints' 429s.
    const message = err.message ?? "Internal server error";
    res.status(err.status || 500).json(
        err.code ? { error: err.code, message } : { error: message },
    );
});

const PORT = process.env.PORT || 3001;

initializeDatabase()
    .then(() => {
        app.listen(PORT, (error) => {
            if (error) {
                throw error;
            }
            console.log(`Express app listening on port ${PORT}!`);
        });
    })
    .catch((error) => {
        console.error(
            "Failed to initialize database, server not started:",
            error.message,
        );
        process.exit(1);
    });
