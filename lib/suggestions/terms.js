// The 50 common things people ask Inspiration for. The seed
// (scripts/build-suggestion-seed.js) fills a pool for each of these, in the
// plain, vegetarian and vegan variants, so the feature has depth from day one.
//
// TWIN: the frontend keeps a byte-identical copy in
// src/lib/inspiration-terms.ts (its quick chips are sampled from it). Change
// them together. Keys are what suggestKey() makes of them, so casing and
// punctuation here are for display only.

const SEED_TERMS = [
    "Quick dinners",
    "Kids meals",
    "Comfort food",
    "Batch cooking",
    "Slow cooker",
    "Air fryer",
    "Traybake",
    "One pot",
    "Under 30 minutes",
    "Budget",
    "High protein",
    "Low carb",
    "Healthy",
    "Pasta",
    "Curry",
    "Chicken",
    "Fish",
    "Salads",
    "Soup",
    "Mexican",
    "Italian",
    "Indian",
    "Chinese",
    "Thai",
    "Japanese",
    "Greek",
    "Middle Eastern",
    "Spanish",
    "British classics",
    "Sunday roast",
    "BBQ",
    "Picnic",
    "Lunchbox",
    "Breakfast",
    "Brunch",
    "Dessert",
    "Baking",
    "Date night",
    "Dinner party",
    "Freezer friendly",
    "Leftovers",
    "Vegan",
    "Gluten-free",
    "Dairy-free",
    "Pescatarian",
    "Family favourites",
    "Summer",
    "Winter warmers",
    "Student meals",
    "Anything",
];

// Diet variants the seed builds for every term. '' is the plain pool.
const SEED_DIETS = ["", "vegetarian", "vegan"];

module.exports = { SEED_TERMS, SEED_DIETS };
