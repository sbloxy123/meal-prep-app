const { Router } = require("express");
const recipesRouter = Router();
const recipesController = require("../controllers/recipesController");

recipesRouter.get("/", recipesController.getRecipes);
recipesRouter.get("/recipe-fetch-test", async (req, res) => {
    const url =
        "https://www.allrecipes.com/recipe/20680/easy-mexican-casserole/";

    const html = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
    }).then((r) => r.text());

    console.log(html.slice(0, 1000));
    const match = html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    if (!match) {
        return res
            .status(422)
            .json({ error: "No ld+json script tag found in page" });
    }
    const json = JSON.parse(match[1]);

    console.log(json); // poke around here
    res.json(json); // also sends it to the browser
});

recipesRouter.get("/:id", recipesController.showSingleRecipe);

recipesRouter.get("/:id", recipesController.showSingleRecipe);

recipesRouter.post("/", recipesController.createRecipe);
recipesRouter.delete("/:id", recipesController.deleteRecipe);

recipesRouter.get("/:id/update", recipesController.getUpdateRecipeForm);
recipesRouter.put("/:id/update", recipesController.updateRecipe);

recipesRouter.put("/:id/favorite", recipesController.markRecipeAsFavorite);

module.exports = recipesRouter;
