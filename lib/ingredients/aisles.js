// The aisle taxonomy: 21 slugs (the keys in seed-source.js) plus "Other".
// Slugs are what the cache stores and what the model is allowed to answer
// with; LABEL is what the generated list shows and the frontend groups by;
// WALK_ORDER is how a UK supermarket is laid out front to back, so a list
// reads in the order you push the trolley. Keep the three in step with
// seed-source.js — build-seed.js checks the slugs.

const AISLES = {
    "fruit-veg": "Fruit & veg",
    bakery: "Bakery",
    "meat-poultry": "Meat & poultry",
    "fish-seafood": "Fish & seafood",
    "dairy-eggs": "Dairy & eggs",
    "chilled-deli": "Chilled & deli",
    "tins-jars": "Tins & jars",
    "pasta-rice-grains": "Pasta, rice & grains",
    "cooking-oils-vinegars": "Oils & vinegars",
    "herbs-spices": "Herbs & spices",
    "sauces-condiments": "Sauces & condiments",
    "world-foods": "World foods",
    baking: "Baking",
    "breakfast-cereals": "Breakfast & cereals",
    "snacks-confectionery": "Snacks & sweets",
    "soft-drinks": "Drinks",
    "tea-coffee": "Tea & coffee",
    alcohol: "Beer, wine & spirits",
    frozen: "Frozen",
    household: "Household",
    "health-beauty": "Health & beauty",
};

// Anything the cache and the model can't place. The frontend shop page and
// addForgottenItemToGeneratedList use the same literal.
const OTHER = "Other";

// Object key order above IS the walking order (fresh first, frozen and
// non-food last); this array makes that explicit for sorting.
const WALK_ORDER = Object.keys(AISLES);

const SLUGS = new Set(WALK_ORDER);

function isSlug(s) {
    return typeof s === "string" && SLUGS.has(s);
}

function labelFor(slug) {
    return AISLES[slug] ?? OTHER;
}

function orderIndex(slug) {
    const i = WALK_ORDER.indexOf(slug);
    return i === -1 ? WALK_ORDER.length : i;
}

module.exports = { AISLES, OTHER, WALK_ORDER, SLUGS, isSlug, labelFor, orderIndex };
