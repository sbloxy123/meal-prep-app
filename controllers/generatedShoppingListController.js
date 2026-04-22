const db = require("../db/queries");

async function getGeneratedShoppingList(req, res, next) {
    try {
        const generatedShoppingItems = await db.getGeneratedShoppingListItems();
        // console.log(generatedShoppingItems);

        const generatedAisles = Array.from(
            new Set(
                generatedShoppingItems.map((product) => product.aisle_name),
            ),
        );

        let productsByAisles = [];

        generatedAisles.forEach((aisleName) => {
            let aisle_products = [];
            generatedShoppingItems.forEach((product) => {
                if (product.aisle_name == aisleName) {
                    aisle_products.push(product);
                }
            });
            productsByAisles.push({
                aisle_name: aisleName,
                products: aisle_products,
            });
        });
        // console.log(productsByAisles);

        res.render("generatedShoppingList", {
            generatedShoppingListPageTitle: "Organised list",
            generatedShoppingItems,
            productsByAisles,
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
}

async function markShoppingListItemAsCollected(req, res, next) {
    try {
        const productId = req.params.id;
        const isCollectedStatus = req.body.is_collected;
        await db.toggleCollected(productId, isCollectedStatus);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        next(error);
    }
}

async function deleteShoppingListItemBoth(req, res, next) {
    try {
        const productId = req.body.productId;
        const productName = req.body.productName;
        console.log(productId, productName);
        await db.deleteProductItemBoth(productId, productName);
    } catch (error) {
        console.error(error);
        next(error);
    }
}

module.exports = {
    getGeneratedShoppingList,
    markShoppingListItemAsCollected,
    deleteShoppingListItemBoth,
};
