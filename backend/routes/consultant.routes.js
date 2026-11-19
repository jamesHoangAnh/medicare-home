const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const consultationCtrl = require("../controllers/consultation.controller");
const medicalRecordCtrl = require("../controllers/medicalRecord.controller");

router.use(authenticateToken);
router.use(requireRole("TuVanVien"));

router.get("/requests/pending", consultationCtrl.getPendingRequests);
router.post("/requests/assign", consultationCtrl.assignDoctor);
router.get("/medical-records/search", medicalRecordCtrl.search);

module.exports = router;
