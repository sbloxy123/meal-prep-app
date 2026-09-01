const { Router } = require("express");
const eventsRouter = Router();
const eventsController = require("../controllers/eventsController");

eventsRouter.post("/", eventsController.logEvent);

module.exports = eventsRouter;
