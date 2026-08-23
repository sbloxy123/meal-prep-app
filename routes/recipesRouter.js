const { Router } = require("express");
const recipesRouter = Router();
const recipesController = require("../controllers/recipesController");
const recipeImportController = require("../controllers/recipeImportController");
const recipeShareController = require("../controllers/recipeShareController");

recipesRouter.get("/", recipesController.getRecipes);
recipesRouter.post("/", recipesController.createRecipe);

// Import from a URL / generate from a title / estimate macros for a draft.
// Declared before the "/:id" routes so these fixed paths aren't captured as an
// id. All rate-limited per household (see recipeImportController).
recipesRouter.post("/import", recipeImportController.importRecipe);
recipesRouter.post("/generate-from-title", recipeImportController.generateFromTitle);
recipesRouter.post("/estimate-macros", recipeImportController.estimateMacros);
recipesRouter.post("/improve", recipeImportController.improveRecipe);
// Social post (Instagram/TikTok/YouTube) URL or pasted caption → draft.
recipesRouter.post("/import-social", recipeImportController.importSocial);
// Base64 photos of a recipe → draft. The larger body limit is set in app.js
// (before the global JSON parser); this route only reads the parsed body.
recipesRouter.post("/parse-from-photo", recipeImportController.parseFromPhoto);

recipesRouter.get("/:id", recipesController.showSingleRecipe);
recipesRouter.put("/:id", recipesController.updateRecipe);
recipesRouter.delete("/:id", recipesController.deleteRecipe);

recipesRouter.put("/:id/favorite", recipesController.markRecipeAsFavorite);

recipesRouter.post("/:id/share", recipeShareController.shareRecipe);

module.exports = recipesRouter;
