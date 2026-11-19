/**
 * Middleware xác thực JWT
 * Cơ chế: Security (theo báo cáo 4.2.2)
 */
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "medicare_home_secret_key_2026";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "24h";

/**
 * Tạo JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      hoTen: user.hoTen,
      vaiTro: user.vaiTro,
      soDienThoai: user.soDienThoai,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

/**
 * Middleware xác thực token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({
      error: "Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
    }
    return res.status(403).json({
      error: "Token không hợp lệ.",
    });
  }
}

/**
 * Middleware xác thực token (optional - cho phép guest)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // Token không hợp lệ, tiếp tục như guest
    }
  }
  next();
}

module.exports = {
  generateToken,
  authenticateToken,
  optionalAuth,
  JWT_SECRET,
};
