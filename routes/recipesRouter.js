const { Router } = require("express");
const recipesRouter = Router();
const recipesController = require("../controllers/recipesController");

recipesRouter.get("/", recipesController.getRecipes);
recipesRouter.post("/", recipesController.createRecipe);

recipesRouter.get("/:id", recipesController.showSingleRecipe);
recipesRouter.put("/:id", recipesController.updateRecipe);
recipesRouter.delete("/:id", recipesController.deleteRecipe);

recipesRouter.put("/:id/favorite", recipesController.markRecipeAsFavorite);

module.exports = recipesRouter;
