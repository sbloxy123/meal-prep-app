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
// app_config knobs (trial length, allowances, weights, member limit, founders).
adminRouter.get("/config", adminController.getConfig);
adminRouter.put("/config", adminController.putConfig);

// Premium grants: comp a household to premium (no Stripe), or revoke.
adminRouter.get("/premium/comps", adminController.comps);
adminRouter.post("/premium/grant", adminController.grantPremium);
adminRouter.post("/premium/revoke", adminController.revokePremium);

module.exports = adminRouter;
