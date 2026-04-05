const { Router } = require("express");
const generatedShoppingListRouter = Router();
const generatedShoppingListController = require("../controllers/generatedShoppingListController");

generatedShoppingListRouter.get(
    "/",
    generatedShoppingListController.getGeneratedShoppingList,
);
generatedShoppingListRouter.put(
    "/item/:id",
    generatedShoppingListController.markShoppingListItemAsCollected,
);

module.exports = generatedShoppingListRouter;
