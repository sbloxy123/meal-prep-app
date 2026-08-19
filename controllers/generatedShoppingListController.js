const db = require("../db/queries");

async function getGeneratedShoppingList(req, res, next) {
    try {
        const generatedShoppingItems = await db.getGeneratedShoppingListItems(req.user.id);

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

// §8.2a — add a single "forgot something" item to the generated list without
// regenerating (preserves collected progress).
async function addItemToGeneratedList(req, res, next) {
    try {
        const productName =
            typeof req.body.product_name === "string" ? req.body.product_name.trim() : "";
        if (!productName) {
            return res.status(400).json({ error: "No product name provided" });
        }
        await db.addForgottenItemToGeneratedList(productName, req.user.id);
        res.status(201).json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function markShoppingListItemAsCollected(req, res, next) {
    try {
        await db.toggleCollected(req.params.id, req.body.is_collected, req.user.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function deleteShoppingListItemBoth(req, res, next) {
    try {
        await db.deleteProductItemBoth(req.body.productId, req.body.productName, req.user.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getGeneratedShoppingList,
    addItemToGeneratedList,
    markShoppingListItemAsCollected,
    deleteShoppingListItemBoth,
};
