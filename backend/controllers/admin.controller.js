/**
 * Controller: Admin - Quản trị hệ thống
 */
const { getPool, sql } = require("../config/database");
const { logAction } = require("../middleware/logger");

/**
 * Thống kê tổng quan
 */
exports.getStatistics = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().execute("sp_ThongKeTongQuan");
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Danh sách tài khoản
 */
exports.getAccounts = async (req, res) => {
  try {
    const { vaiTro, trangThai, search } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let query = `SELECT id, hoTen, soDienThoai, email, vaiTro, 
                 chuyenKhoa, trangThai, ngayTao, lanDangNhapGanNhat
                 FROM TaiKhoan WHERE 1=1`;

    if (vaiTro) {
      query += " AND vaiTro = @vaiTro";
      request.input("vaiTro", sql.VarChar, vaiTro);
    }
    if (trangThai) {
      query += " AND trangThai = @trangThai";
      request.input("trangThai", sql.VarChar, trangThai);
    }
    if (search) {
      query += " AND (hoTen LIKE @search OR soDienThoai LIKE @search)";
      request.input("search", sql.NVarChar, `%${search}%`);
    }

    query += " ORDER BY id DESC";

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Tạo tài khoản nhân viên (BS, TVV)
 */
exports.createStaff = async (req, res) => {
  try {
    const data = req.body;
    const bcrypt = require("bcryptjs");
    const pool = await getPool();

    // Kiểm tra SĐT
    const check = await pool
      .request()
      .input("sdt", sql.VarChar, data.soDienThoai)
      .query("SELECT id FROM TaiKhoan WHERE soDienThoai = @sdt");

    if (check.recordset.length > 0) {
      return res.status(400).json({ error: "SĐT đã tồn tại" });
    }

    const salt = await bcrypt.genSalt(10);
    const matKhauHash = await bcrypt.hash(data.matKhau || "Medicare@123", salt);

    const result = await pool
      .request()
      .input("ht", sql.NVarChar, data.hoTen)
      .input("sdt", sql.VarChar, data.soDienThoai)
      .input("em", sql.NVarChar, data.email)
      .input("mk", sql.VarChar, matKhauHash)
      .input("vt", sql.VarChar, data.vaiTro)
      .input("ck", sql.NVarChar, data.chuyenKhoa || null)
      .input("kn", sql.Int, data.kinhNghiem || 0).query(`INSERT INTO TaiKhoan 
              (hoTen, soDienThoai, email, matKhauHash, vaiTro, chuyenKhoa, kinhNghiem)
              OUTPUT INSERTED.id
              VALUES (@ht, @sdt, @em, @mk, @vt, @ck, @kn)`);

    await logAction({
      idUser: req.user.id,
      hanhDong: "Tạo tài khoản nhân viên",
      doiTuong: "TaiKhoan",
      idDoiTuong: result.recordset[0].id,
      chiTiet: `${data.hoTen} - ${data.vaiTro}`,
    });

    res.status(201).json({
      message: "Tạo tài khoản thành công",
      id: result.recordset[0].id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Đình chỉ tài khoản
 */
exports.suspendAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { lyDo } = req.body;

    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("lyDo", sql.NVarChar, lyDo || "").query(`UPDATE TaiKhoan 
              SET trangThai = 'DinhChi', lyDoDinhChi = @lyDo, ngayCapNhat = GETDATE()
              WHERE id = @id`);

    await logAction({
      idUser: req.user.id,
      hanhDong: "Đình chỉ tài khoản",
      doiTuong: "TaiKhoan",
      idDoiTuong: parseInt(id),
      trangThaiCu: "HoatDong",
      trangThaiMoi: "DinhChi",
      chiTiet: lyDo,
    });

    res.json({ message: "Đã đình chỉ tài khoản" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Kích hoạt lại tài khoản
 */
exports.activateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request().input("id", sql.Int, id).query(`UPDATE TaiKhoan 
              SET trangThai = 'HoatDong', lyDoDinhChi = NULL, ngayCapNhat = GETDATE()
              WHERE id = @id`);

    await logAction({
      idUser: req.user.id,
      hanhDong: "Kích hoạt tài khoản",
      doiTuong: "TaiKhoan",
      idDoiTuong: parseInt(id),
    });

    res.json({ message: "Đã kích hoạt tài khoản" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Xóa tài khoản
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Kiểm tra ràng buộc
    const checkLich = await pool.request().input("id", sql.Int, id)
      .query(`SELECT COUNT(*) AS count FROM LichKham 
              WHERE (idBenhNhan = @id OR idBacSi = @id) 
              AND trangThai IN ('ChoXacNhan', 'DaXacNhan')`);

    if (checkLich.recordset[0].count > 0) {
      return res.status(400).json({
        error: "Không thể xóa: Tài khoản đang có lịch khám chưa hoàn tất",
      });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM TaiKhoan WHERE id = @id");

    await logAction({
      idUser: req.user.id,
      hanhDong: "Xóa tài khoản",
      doiTuong: "TaiKhoan",
      idDoiTuong: parseInt(id),
    });

    res.json({ message: "Đã xóa tài khoản" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Xem nhật ký hệ thống
 */
exports.getSystemLogs = async (req, res) => {
  try {
    const { limit = 100, userId, hanhDong } = req.query;
    const pool = await getPool();
    const request = pool.request().input("top", sql.Int, parseInt(limit));

    let query = `SELECT TOP (@top) l.*, tk.hoTen AS tenUser
                 FROM SystemLog l
                 LEFT JOIN TaiKhoan tk ON l.idUser = tk.id
                 WHERE 1=1`;

    if (userId) {
      query += " AND l.idUser = @userId";
      request.input("userId", sql.Int, parseInt(userId));
    }
    if (hanhDong) {
      query += " AND l.hanhDong = @hanhDong";
      request.input("hanhDong", sql.VarChar, hanhDong);
    }

    query += " ORDER BY l.thoiGian DESC";

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Cấu hình hệ thống
 */
exports.getConfig = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query("SELECT * FROM CauHinhHeThong ORDER BY nhom, id");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { configs } = req.body; // Array of {khoa, giaTri}
    const pool = await getPool();

    for (const cfg of configs) {
      await pool
        .request()
        .input("khoa", sql.NVarChar, cfg.khoa)
        .input("giatri", sql.NVarChar, cfg.giaTri)
        .input("ngCN", sql.Int, req.user.id).query(`UPDATE CauHinhHeThong 
                SET giaTri = @giatri, ngayCapNhat = GETDATE(), nguoiCapNhat = @ngCN
                WHERE khoa = @khoa`);
    }

    await logAction({
      idUser: req.user.id,
      hanhDong: "Cập nhật cấu hình",
      chiTiet: `${configs.length} tham số`,
    });

    res.json({ message: "Đã cập nhật cấu hình" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Sao lưu dữ liệu
 */
exports.backup = async (req, res) => {
  try {
    // Trong thực tế: gọi SQL Server BACKUP DATABASE
    // Ở đây: mô phỏng
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `MediCareHome_${timestamp}.bak`;

    await logAction({
      idUser: req.user.id,
      hanhDong: "Sao lưu dữ liệu",
      chiTiet: `File: ${backupName}`,
    });

    res.json({
      message: "Sao lưu thành công",
      fileName: backupName,
      size: "34.2 MB",
      timestamp: new Date(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = exports;
