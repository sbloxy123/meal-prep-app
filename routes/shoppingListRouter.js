const { Router } = require("express");
const shoppingListRouter = Router();
const shoppingListController = require("../controllers/shoppingListController");

shoppingListRouter.delete("/", shoppingListController.deleteShoppingList);

shoppingListRouter.post("/", shoppingListController.createShoppingList);
shoppingListRouter.get("/", shoppingListController.getShoppingList);

shoppingListRouter.post(
    "/custom-product",
    shoppingListController.createCustomProduct,
);
shoppingListRouter.post(
    "/organise",
    shoppingListController.organiseShoppingList,
);

shoppingListRouter.put("/:id", shoppingListController.updateShoppingListItem);

shoppingListRouter.put(
    "/custom-product/:id",
    shoppingListController.updateCustomProductItem,
);
shoppingListRouter.delete(
    "/shopping-list-item/:id",
    shoppingListController.deleteSingleShoppingListItem,
);

shoppingListRouter.put(
    "/recipe/:id",
    shoppingListController.removeRecipeFromShoppingList,
);

module.exports = shoppingListRouter;
