require("dotenv").config();

const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const path = require("node:path");

const recipesRouter = require("./routes/recipesRouter");
const shoppingListRouter = require("./routes/shoppingListRouter");
const generatedShoppingListRouter = require("./routes/generatedShoppingListRouter");
const initializeDatabase = require("./db/init");

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

const assetsPath = path.join(__dirname, "public");
app.use(express.static(assetsPath));

const methodOverride = require("method-override");
app.use(methodOverride("_method"));

app.use("/shopping-list", shoppingListRouter);
app.use("/recipes", recipesRouter);
app.use("/generated-shopping-list", generatedShoppingListRouter);
app.get("/", (req, res) => res.redirect("/recipes"));

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
