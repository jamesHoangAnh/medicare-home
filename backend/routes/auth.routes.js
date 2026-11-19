/**
 * Routes: Xác thực (Đăng ký, Đăng nhập)
 */
const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticateToken } = require("../middleware/auth");

// Đăng ký tài khoản bệnh nhân
router.post("/register", authController.register);

// Đăng nhập
router.post("/login", authController.login);

// Đăng xuất (client-side chỉ xóa token, nhưng có thể blacklist)
router.post("/logout", authenticateToken, authController.logout);

// Lấy thông tin user hiện tại
router.get("/me", authenticateToken, authController.getMe);

// Đổi mật khẩu
router.put(
  "/change-password",
  authenticateToken,
  authController.changePassword,
);

// Cập nhật hồ sơ cá nhân
router.put("/profile", authenticateToken, authController.updateProfile);

module.exports = router;
