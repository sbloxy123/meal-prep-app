const { Router } = require("express");
const recipesRouter = Router();
const recipesController = require("../controllers/recipesController");

recipesRouter.get("/", recipesController.getRecipes);
recipesRouter.get("/:id", recipesController.showSingleRecipe);

recipesRouter.post("/", recipesController.createRecipe);
recipesRouter.delete("/:id", recipesController.deleteRecipe);

recipesRouter.get("/:id/update", recipesController.getUpdateRecipeForm);
recipesRouter.put("/:id/update", recipesController.updateRecipe);

module.exports = recipesRouter;
