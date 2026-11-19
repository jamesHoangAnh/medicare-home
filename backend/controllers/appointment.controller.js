/**
 * Controller: Lịch khám
 */
const { getPool, sql } = require("../config/database");
const { logAction } = require("../middleware/logger");

/**
 * Bệnh nhân tạo lịch khám
 */
exports.create = async (req, res) => {
  try {
    const { idBacSi, thoiGian, diaChi, ghiChu, idYeuCauTuVan } = req.body;
    const idBenhNhan = req.user.id;

    if (!idBacSi || !thoiGian || !diaChi) {
      return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" });
    }

    const pool = await getPool();

    // Gọi stored procedure
    const result = await pool
      .request()
      .input("idBenhNhan", sql.Int, idBenhNhan)
      .input("idBacSi", sql.Int, idBacSi)
      .input("thoiGian", sql.DateTime, new Date(thoiGian))
      .input("diaChi", sql.NVarChar, diaChi)
      .input("ghiChu", sql.NVarChar, ghiChu || "")
      .input("idYeuCauTuVan", sql.Int, idYeuCauTuVan || null)
      .execute("sp_DatLichKham");

    const idLichKham = result.recordset[0].idLichKham;

    await logAction({
      idUser: idBenhNhan,
      hanhDong: "Đặt lịch khám",
      doiTuong: "LichKham",
      idDoiTuong: idLichKham,
      chiTiet: `Đặt lịch với BS#${idBacSi} vào ${thoiGian}`,
    });

    res.status(201).json({
      message: "Đặt lịch thành công. Bác sĩ sẽ xác nhận sớm.",
      id: idLichKham,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Bệnh nhân xem lịch khám của mình
 */
exports.getMyAppointments = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().input("idBN", sql.Int, req.user.id)
      .query(`SELECT lk.*, bs.hoTen AS tenBacSi, bs.chuyenKhoa
              FROM LichKham lk
              JOIN TaiKhoan bs ON lk.idBacSi = bs.id
              WHERE lk.idBenhNhan = @idBN
              ORDER BY lk.thoiGian DESC`);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Bác sĩ xem lịch chờ xác nhận
 */
exports.getPendingByDoctor = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().input("idBS", sql.Int, req.user.id)
      .query(`SELECT lk.*, bn.hoTen AS tenBenhNhan, bn.soDienThoai AS sdtBenhNhan, bn.diaChi AS diaChiBN
              FROM LichKham lk
              JOIN TaiKhoan bn ON lk.idBenhNhan = bn.id
              WHERE lk.idBacSi = @idBS AND lk.trangThai = 'ChoXacNhan'
              ORDER BY lk.thoiGian ASC`);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Bác sĩ xác nhận / từ chối lịch
 */
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { trangThai, lyDoHuy } = req.body;

    if (!["DaXacNhan", "BSTuChoi"].includes(trangThai)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    }

    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("tt", sql.VarChar, trangThai)
      .input("ngXN", sql.Int, req.user.id)
      .input("lyDo", sql.NVarChar, lyDoHuy || null).query(`UPDATE LichKham 
              SET trangThai = @tt, nguoiXacNhan = @ngXN,
                  thoiGianXacNhan = GETDATE(), lyDoHuy = @lyDo,
                  ngayCapNhat = GETDATE()
              WHERE id = @id AND idBacSi = @ngXN`);

    await logAction({
      idUser: req.user.id,
      hanhDong: trangThai === "DaXacNhan" ? "Xác nhận lịch" : "Từ chối lịch",
      doiTuong: "LichKham",
      idDoiTuong: parseInt(id),
      trangThaiMoi: trangThai,
    });

    res.json({ message: "Cập nhật thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Bệnh nhân hủy lịch
 */
exports.cancel = async (req, res) => {
  try {
    const { id } = req.params;
    const { lyDoHuy } = req.body;

    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("idBN", sql.Int, req.user.id)
      .input("lyDo", sql.NVarChar, lyDoHuy || "").query(`UPDATE LichKham 
              SET trangThai = 'DaHuy', lyDoHuy = @lyDo, ngayCapNhat = GETDATE()
              WHERE id = @id AND idBenhNhan = @idBN`);

    await logAction({
      idUser: req.user.id,
      hanhDong: "Hủy lịch khám",
      doiTuong: "LichKham",
      idDoiTuong: parseInt(id),
    });

    res.json({ message: "Đã hủy lịch" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = exports;
