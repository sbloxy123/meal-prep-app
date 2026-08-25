const { Router } = require("express");
const premiumRouter = Router();
const premiumController = require("../controllers/premiumController");

// Phase 1: funnel logging only. Phase 2 adds the Stripe checkout/status routes
// here (or via the BetterAuth Stripe plugin's own /api/auth/stripe/* routes).
premiumRouter.post("/cta", premiumController.logCta);

module.exports = premiumRouter;
