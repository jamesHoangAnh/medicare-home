/**
 * Middleware ghi log hệ thống
 * Cơ chế: Error Handling & Logging (theo báo cáo 4.2.2)
 */
const { getPool, sql } = require("../config/database");

/**
 * Ghi log vào bảng SystemLog
 */
async function logAction({
  idUser,
  tenDangNhap,
  hanhDong,
  doiTuong = null,
  idDoiTuong = null,
  chiTiet = null,
  trangThaiCu = null,
  trangThaiMoi = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("idUser", sql.Int, idUser)
      .input("tenDangNhap", sql.NVarChar, tenDangNhap)
      .input("hanhDong", sql.VarChar, hanhDong)
      .input("doiTuong", sql.VarChar, doiTuong)
      .input("idDoiTuong", sql.Int, idDoiTuong)
      .input("chiTiet", sql.NVarChar, chiTiet)
      .input("trangThaiCu", sql.NVarChar, trangThaiCu)
      .input("trangThaiMoi", sql.NVarChar, trangThaiMoi)
      .input("ipAddress", sql.VarChar, ipAddress)
      .input("userAgent", sql.NVarChar, userAgent)
      .execute("sp_GhiLog");
  } catch (err) {
    console.error("❌ [Logger] Lỗi ghi log:", err.message);
    // Không throw error để không ảnh hưởng flow chính
  }
}

/**
 * Middleware tự động ghi log request
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ` +
        `${res.statusCode} ${duration}ms`,
    );
  });

  next();
}

module.exports = {
  logAction,
  requestLogger,
};
