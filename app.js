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

app.use(express.json());

const recipesRouter = require("./routes/recipesRouter");
const shoppingListRouter = require("./routes/shoppingListRouter");
const generatedShoppingListRouter = require("./routes/generatedShoppingListRouter");
const initializeDatabase = require("./db/init");
const { requireAuth } = require("./middleware/requireAuth");

app.use("/shopping-list", requireAuth, shoppingListRouter);
app.use("/recipes", requireAuth, recipesRouter);
app.use("/generated-shopping-list", requireAuth, generatedShoppingListRouter);

app.get("/", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
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
