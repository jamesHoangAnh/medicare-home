/**
 * Routes: Bệnh nhân
 */
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const consultationCtrl = require("../controllers/consultation.controller");
const appointmentCtrl = require("../controllers/appointment.controller");
const medicalRecordCtrl = require("../controllers/medicalRecord.controller");
const paymentCtrl = require("../controllers/payment.controller");

// Tất cả routes đều yêu cầu đăng nhập và vai trò BenhNhan
router.use(authenticateToken);
router.use(requireRole("BenhNhan"));

// Yêu cầu tư vấn
router.post("/consultation/request", consultationCtrl.createRequest);
router.get("/consultation/my-requests", consultationCtrl.getMyRequests);

// Lịch khám
router.post("/appointment", appointmentCtrl.create);
router.get("/appointment/my", appointmentCtrl.getMyAppointments);
router.put("/appointment/:id/cancel", appointmentCtrl.cancel);

// Bệnh án
router.get("/medical-records", medicalRecordCtrl.getMyRecords);
router.get("/medical-records/:id", medicalRecordCtrl.getDetail);

// Hóa đơn & Thanh toán
router.get("/invoices", paymentCtrl.getMyInvoices);
router.post("/invoices/:id/generate-qr", paymentCtrl.generateQR);
router.post("/invoices/:id/confirm-payment", paymentCtrl.confirmPayment);

module.exports = router;
