const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const appointmentCtrl = require("../controllers/appointment.controller");
const medicalRecordCtrl = require("../controllers/medicalRecord.controller");
const paymentCtrl = require("../controllers/payment.controller");

router.use(authenticateToken);
router.use(requireRole("BacSi"));

// Lịch khám
router.get("/appointments/pending", appointmentCtrl.getPendingByDoctor);
router.get("/appointments/my", appointmentCtrl.getMyAppointments);
router.put("/appointments/:id/status", appointmentCtrl.updateStatus);

// Bệnh án
router.post("/medical-records", medicalRecordCtrl.create);
router.put("/medical-records/:id", medicalRecordCtrl.update);
router.get("/medical-records/search", medicalRecordCtrl.search);

// Hóa đơn
router.post("/invoices", paymentCtrl.createInvoice);

module.exports = router;
