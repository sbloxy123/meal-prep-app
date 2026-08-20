const { Router } = require("express");
const householdRouter = Router();
const householdController = require("../controllers/householdController");

householdRouter.get("/", householdController.getHousehold);
householdRouter.put("/", householdController.renameHousehold);
householdRouter.post("/invite", householdController.inviteMember);
householdRouter.post("/accept", householdController.acceptInvite);
householdRouter.post("/leave", householdController.leaveHousehold);
householdRouter.delete("/invite/:inviteId", householdController.revokeInvite);
householdRouter.delete("/member/:userId", householdController.removeMember);

module.exports = householdRouter;
