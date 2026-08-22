const { Router } = require("express");
const recipesRouter = Router();
const recipesController = require("../controllers/recipesController");
const recipeImportController = require("../controllers/recipeImportController");

recipesRouter.get("/", recipesController.getRecipes);
recipesRouter.post("/", recipesController.createRecipe);

// Import a recipe from a URL / estimate macros for a draft. Declared before the
// "/:id" routes so these fixed paths aren't captured as an id. Both are
// rate-limited per household (see recipeImportController).
recipesRouter.post("/import", recipeImportController.importRecipe);
recipesRouter.post("/estimate-macros", recipeImportController.estimateMacros);

recipesRouter.get("/:id", recipesController.showSingleRecipe);
recipesRouter.put("/:id", recipesController.updateRecipe);
recipesRouter.delete("/:id", recipesController.deleteRecipe);

recipesRouter.put("/:id/favorite", recipesController.markRecipeAsFavorite);

module.exports = recipesRouter;
