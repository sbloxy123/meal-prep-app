const { Router } = require("express");
const premiumRouter = Router();
const premiumController = require("../controllers/premiumController");

// Phase 1: funnel logging only. Phase 2 adds the Stripe checkout/status routes
// here (or via the BetterAuth Stripe plugin's own /api/auth/stripe/* routes).
premiumRouter.post("/cta", premiumController.logCta);
// Monthly / annual / founders' availability for the upgrade page.
premiumRouter.get("/offers", premiumController.offers);

module.exports = premiumRouter;
