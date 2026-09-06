const { Router } = require("express");
const generatedShoppingListRouter = Router();
const generatedShoppingListController = require("../controllers/generatedShoppingListController");

generatedShoppingListRouter.get(
    "/",
    generatedShoppingListController.getGeneratedShoppingList,
);
generatedShoppingListRouter.post(
    "/",
    generatedShoppingListController.addItemToGeneratedList,
);
generatedShoppingListRouter.put(
    "/item/:id",
    generatedShoppingListController.markShoppingListItemAsCollected,
);
generatedShoppingListRouter.delete(
    "/item/:id",
    generatedShoppingListController.deleteShoppingListItemBoth,
);
// End of a shop: remove every collected item from both lists; logs shop_finished.
generatedShoppingListRouter.post(
    "/clear-collected",
    generatedShoppingListController.clearCollected,
);

module.exports = generatedShoppingListRouter;
