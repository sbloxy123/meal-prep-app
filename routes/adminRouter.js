const { Router } = require("express");
const adminRouter = Router();
const adminController = require("../controllers/adminController");

// Read-only usage analytics for the /back-of-house dashboard. Mounted behind
// requireAuth + requireAdmin in app.js.
adminRouter.get("/overview", adminController.overview);
adminRouter.get("/users", adminController.users);

module.exports = adminRouter;
