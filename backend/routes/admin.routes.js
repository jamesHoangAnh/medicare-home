const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const adminCtrl = require("../controllers/admin.controller");

router.use(authenticateToken);
router.use(requireRole("Admin"));

router.get("/statistics", adminCtrl.getStatistics);
router.get("/accounts", adminCtrl.getAccounts);
router.post("/accounts", adminCtrl.createStaff);
router.put("/accounts/:id/suspend", adminCtrl.suspendAccount);
router.put("/accounts/:id/activate", adminCtrl.activateAccount);
router.delete("/accounts/:id", adminCtrl.deleteAccount);
router.get("/logs", adminCtrl.getSystemLogs);
router.get("/config", adminCtrl.getConfig);
router.put("/config", adminCtrl.updateConfig);
router.post("/backup", adminCtrl.backup);

module.exports = router;
