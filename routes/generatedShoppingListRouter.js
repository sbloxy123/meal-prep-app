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
generatedShoppingListRouter.delete(
    "/item/:id",
    generatedShoppingListController.deleteShoppingListItemBoth,
);

module.exports = generatedShoppingListRouter;
