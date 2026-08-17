const db = require("../db/queries");

async function getGeneratedShoppingList(req, res, next) {
    try {
        const generatedShoppingItems = await db.getGeneratedShoppingListItems(req.householdId);

        const generatedAisles = Array.from(
            new Set(generatedShoppingItems.map((product) => product.aisle_name)),
        );

        const productsByAisles = generatedAisles.map((aisle_name) => ({
            aisle_name,
            products: generatedShoppingItems.filter((p) => p.aisle_name === aisle_name),
        }));

        res.json({ generatedShoppingItems, productsByAisles });
    } catch (error) {
        next(error);
    }
}

async function markShoppingListItemAsCollected(req, res, next) {
    try {
        await db.toggleCollected(req.params.id, req.body.is_collected, req.householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function deleteShoppingListItemBoth(req, res, next) {
    try {
        await db.deleteProductItemBoth(req.body.productId, req.body.productName, req.householdId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getGeneratedShoppingList,
    markShoppingListItemAsCollected,
    deleteShoppingListItemBoth,
};
