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

// §8.2a — add a single "forgot something" item to the generated list without
// regenerating (preserves collected progress).
async function addItemToGeneratedList(req, res, next) {
    try {
        const productName =
            typeof req.body.product_name === "string" ? req.body.product_name.trim() : "";
        if (!productName) {
            return res.status(400).json({ error: "No product name provided" });
        }
        await db.addForgottenItemToGeneratedList(productName, req.householdId);
        res.status(201).json({ success: true });
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

// The end of a shop: take every collected item off the aisle list AND the
// draft in one go (the draft is keyed by product name, so each removal goes
// through deleteProductItemBoth like the single-item delete). This is where
// the weekly loop closes now — it logs shop_finished { items, collected }, the
// habit metric the dashboard, snapshots and digest read. Nothing else is
// touched: the week's recipes stay on the menu, and uncollected items stay on
// both lists.
async function clearCollected(req, res, next) {
    try {
        const householdId = req.householdId;
        const gen = await db.getGeneratedShoppingListItems(householdId);
        const collected = gen.filter((g) => g.is_collected);
        for (const g of collected) {
            await db.deleteProductItemBoth(g.id, g.product_name, householdId);
        }
        if (collected.length > 0) {
            db.recordEvent("shop_finished", {
                userId: req.user.id,
                householdId,
                meta: { items: gen.length, collected: collected.length },
            });
        }
        res.json({ success: true, removed: collected.length });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getGeneratedShoppingList,
    addItemToGeneratedList,
    markShoppingListItemAsCollected,
    deleteShoppingListItemBoth,
    clearCollected,
};
