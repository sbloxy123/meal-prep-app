const { Router } = require("express");
const adminRouter = Router();
const adminController = require("../controllers/adminController");

// Usage analytics + premium comps for the /back-of-house dashboard. Mounted
// behind requireAuth + requireAdmin in app.js.
adminRouter.get("/overview", adminController.overview);
adminRouter.get("/users", adminController.users);
// The AI ledger (ai_usage): cost, tokens, latency, outcomes per action/model.
adminRouter.get("/ai", adminController.aiStats);
// The credit model in numbers: per-plan usage distribution, ceiling hits, trial funnel.
adminRouter.get("/credits", adminController.creditStats);
// Daily snapshots rolled up by month (+ ?format=csv), and the questionnaire funnel.
adminRouter.get("/history", adminController.history);
adminRouter.get("/onboarding", adminController.onboardingStats);
// What people add (anonymous), one person's list (logged), one full recipe (reason required, logged), the log.
adminRouter.get("/recipes/overview", adminController.recipesOverview);
adminRouter.get("/recipes/:id", adminController.recipeDetail);
adminRouter.get("/users/:id", adminController.userDetail);
adminRouter.get("/access-log", adminController.accessLog);
// app_config knobs (trial length, allowances, weights, member limit, founders).
adminRouter.get("/config", adminController.getConfig);
adminRouter.put("/config", adminController.putConfig);
// Ingredient → aisle cache review: model guesses to confirm/correct, misses to map.
adminRouter.get("/aisles", adminController.aisleReview);
adminRouter.post("/aisles", adminController.addAisle);
adminRouter.put("/aisles/:id", adminController.setAisle);
adminRouter.delete("/aisles/:id", adminController.deleteAisle);

// Premium grants: comp a household to premium (no Stripe), or revoke.
adminRouter.get("/premium/comps", adminController.comps);
adminRouter.post("/premium/grant", adminController.grantPremium);
adminRouter.post("/premium/revoke", adminController.revokePremium);

module.exports = adminRouter;
