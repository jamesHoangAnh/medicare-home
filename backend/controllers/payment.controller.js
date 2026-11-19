/**
 * Controller: Thanh toán & Hóa đơn
 */
const { getPool, sql } = require("../config/database");
const { logAction } = require("../middleware/logger");
const vietqrService = require("../subsystems/Payment/vietqrService");

/**
 * Bệnh nhân xem hóa đơn của mình
 */
exports.getMyInvoices = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().input("idBN", sql.Int, req.user.id)
      .query(`SELECT * FROM HoaDon 
              WHERE idBenhNhan = @idBN
              ORDER BY ngayTao DESC`);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Tạo mã QR thanh toán
 */
exports.generateQR = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Lấy hóa đơn
    const hdResult = await pool
      .request()
      .input("id", sql.Int, id)
      .input("idBN", sql.Int, req.user.id).query(`SELECT hd.*, bn.soDienThoai 
              FROM HoaDon hd
              JOIN TaiKhoan bn ON hd.idBenhNhan = bn.id
              WHERE hd.id = @id AND hd.idBenhNhan = @idBN`);

    if (hdResult.recordset.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy hóa đơn" });
    }

    const hd = hdResult.recordset[0];

    if (hd.trangThai !== "ChoThanhToan") {
      return res.status(400).json({ error: "Hóa đơn không thể thanh toán" });
    }

    // Tạo QR
    const qr = vietqrService.generateQRCode(
      hd.maHoaDon,
      hd.tongTien,
      hd.soDienThoai,
    );

    // Lưu QR vào DB
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("qr", sql.NVarChar, qr.qrCodeUrl)
      .input("exp", sql.DateTime, qr.expiredAt).query(`UPDATE HoaDon 
              SET qrCodeUrl = @qr, qrCodeExpiredAt = @exp
              WHERE id = @id`);

    res.json({
      qrCodeUrl: qr.qrCodeUrl,
      expiredAt: qr.expiredAt,
      bankInfo: qr.bankInfo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Từ chối xác nhận thủ công khi chưa tích hợp xác minh giao dịch ngân hàng.
 */
exports.confirmPayment = async (req, res) => {
  res.status(501).json({
    error:
      "Thanh toán chỉ được xác nhận sau khi hệ thống xác minh giao dịch với ngân hàng.",
  });
};

/**
 * Bác sĩ tạo hóa đơn
 */
exports.createInvoice = async (req, res) => {
  try {
    const data = req.body;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idLK", sql.Int, data.idLichKham || null)
      .input("idYC", sql.Int, data.idYeuCauTuVan || null)
      .input("idBN", sql.Int, data.idBenhNhan)
      .input("phiTV", sql.Decimal, data.phiTuVan || 0)
      .input("phiK", sql.Decimal, data.phiKhamTaiNha || 0)
      .input("phiT", sql.Decimal, data.phiThuoc || 0)
      .input("phiDV", sql.Decimal, data.phiDichVuKhac || 0)
      .input("gg", sql.Decimal, data.giamGia || 0)
      .input("ngTao", sql.Int, req.user.id)
      .execute("sp_TaoHoaDon");

    const { idHoaDon, maHoaDon, tongTien } = result.recordset[0];

    await logAction({
      idUser: req.user.id,
      hanhDong: "Tạo hóa đơn",
      doiTuong: "HoaDon",
      idDoiTuong: idHoaDon,
      chiTiet: `Mã: ${maHoaDon}, Tổng: ${tongTien}`,
    });

    res.status(201).json({
      message: "Tạo hóa đơn thành công",
      id: idHoaDon,
      maHoaDon,
      tongTien,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = exports;
