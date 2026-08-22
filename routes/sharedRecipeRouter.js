const { Router } = require("express");
const sharedRecipeRouter = Router();
const recipeShareController = require("../controllers/recipeShareController");

// Top-level /shared-recipe/:token (frontend link is /shared/<token>). Kept off
// the /recipes router to avoid ":id" route-group ambiguity.
sharedRecipeRouter.get("/:token", recipeShareController.getSharedRecipe);
sharedRecipeRouter.post("/:token/save", recipeShareController.saveSharedRecipe);

module.exports = sharedRecipeRouter;
