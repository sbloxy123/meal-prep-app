const { Router } = require("express");
const installRouter = Router();
const installController = require("../controllers/installController");

installRouter.post("/email", installController.emailInstallLink);

module.exports = installRouter;
