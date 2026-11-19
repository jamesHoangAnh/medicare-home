/**
 * Controller: Xác thực
 */
const bcrypt = require("bcryptjs");
const { getPool, sql } = require("../config/database");
const { generateToken } = require("../middleware/auth");
const { logAction } = require("../middleware/logger");

/**
 * Đăng ký tài khoản
 */
exports.register = async (req, res) => {
  try {
    const { hoTen, soDienThoai, email, matKhau, ngaySinh, gioiTinh } = req.body;

    // Validate
    if (!hoTen || !soDienThoai || !matKhau) {
      return res
        .status(400)
        .json({ error: "Vui lòng điền đầy đủ thông tin bắt buộc" });
    }

    if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(matKhau)) {
      return res.status(400).json({
        error: "Mật khẩu phải ≥8 ký tự, có chữ hoa và số",
      });
    }

    if (!/^0\d{9}$/.test(soDienThoai)) {
      return res.status(400).json({ error: "Số điện thoại không hợp lệ" });
    }

    const pool = await getPool();

    // Kiểm tra SĐT đã tồn tại
    const check = await pool
      .request()
      .input("sdt", sql.VarChar, soDienThoai)
      .query("SELECT id FROM TaiKhoan WHERE soDienThoai = @sdt");

    if (check.recordset.length > 0) {
      return res.status(400).json({ error: "Số điện thoại đã được đăng ký" });
    }

    // Hash mật khẩu
    const salt = await bcrypt.genSalt(10);
    const matKhauHash = await bcrypt.hash(matKhau, salt);

    // Tạo tài khoản
    const result = await pool
      .request()
      .input("hoTen", sql.NVarChar, hoTen)
      .input("sdt", sql.VarChar, soDienThoai)
      .input("email", sql.NVarChar, email || null)
      .input("mk", sql.VarChar, matKhauHash)
      .input("ns", sql.Date, ngaySinh || null)
      .input("gt", sql.NVarChar, gioiTinh || null).query(`INSERT INTO TaiKhoan 
              (hoTen, soDienThoai, email, matKhauHash, ngaySinh, gioiTinh, vaiTro) 
              OUTPUT INSERTED.id
              VALUES (@hoTen, @sdt, @email, @mk, @ns, @gt, 'BenhNhan')`);

    const newId = result.recordset[0].id;

    // Ghi log
    await logAction({
      idUser: newId,
      tenDangNhap: hoTen,
      hanhDong: "Đăng ký",
      doiTuong: "TaiKhoan",
      idDoiTuong: newId,
      chiTiet: `Đăng ký tài khoản bệnh nhân: ${hoTen}`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(201).json({
      message: "Đăng ký thành công",
      id: newId,
    });
  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({ error: "Lỗi server: " + err.message });
  }
};

/**
 * Đăng nhập
 */
exports.login = async (req, res) => {
  try {
    const { soDienThoai, matKhau } = req.body;

    if (!soDienThoai || !matKhau) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });
    }

    const pool = await getPool();

    // Tìm user
    const result = await pool
      .request()
      .input("sdt", sql.VarChar, soDienThoai)
      .query("SELECT * FROM TaiKhoan WHERE soDienThoai = @sdt");

    if (result.recordset.length === 0) {
      return res
        .status(401)
        .json({ error: "Số điện thoại hoặc mật khẩu không chính xác" });
    }

    const user = result.recordset[0];

    // Kiểm tra trạng thái
    if (user.trangThai === "DinhChi") {
      return res.status(403).json({
        error: "Tài khoản đang bị đình chỉ",
        lyDo: user.lyDoDinhChi,
      });
    }

    // Xác thực mật khẩu
    const isValid = await bcrypt.compare(matKhau, user.matKhauHash);
    if (!isValid) {
      return res
        .status(401)
        .json({ error: "Số điện thoại hoặc mật khẩu không chính xác" });
    }

    // Cập nhật lần đăng nhập gần nhất
    await pool
      .request()
      .input("id", sql.Int, user.id)
      .input("ip", sql.VarChar, req.ip).query(`UPDATE TaiKhoan 
              SET lanDangNhapGanNhat = GETDATE(), diaChiIP = @ip 
              WHERE id = @id`);

    // Tạo JWT token
    const token = generateToken(user);

    // Ghi log
    await logAction({
      idUser: user.id,
      tenDangNhap: user.hoTen,
      hanhDong: "Đăng nhập",
      doiTuong: "TaiKhoan",
      idDoiTuong: user.id,
      chiTiet: `${user.hoTen} đăng nhập thành công`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      token,
      user: {
        id: user.id,
        hoTen: user.hoTen,
        soDienThoai: user.soDienThoai,
        email: user.email,
        vaiTro: user.vaiTro,
        chuyenKhoa: user.chuyenKhoa,
        kinhNghiem: user.kinhNghiem,
        diaChi: user.diaChi,
        anhDaiDien: user.anhDaiDien,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Lỗi server: " + err.message });
  }
};

/**
 * Đăng xuất
 */
exports.logout = async (req, res) => {
  await logAction({
    idUser: req.user.id,
    tenDangNhap: req.user.hoTen,
    hanhDong: "Đăng xuất",
    chiTiet: `${req.user.hoTen} đăng xuất`,
  });
  res.json({ message: "Đăng xuất thành công" });
};

/**
 * Lấy thông tin user hiện tại
 */
exports.getMe = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().input("id", sql.Int, req.user.id)
      .query(`SELECT id, hoTen, soDienThoai, email, vaiTro, 
              chuyenKhoa, kinhNghiem, diaChi, anhDaiDien, ngaySinh, gioiTinh
              FROM TaiKhoan WHERE id = @id`);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Đổi mật khẩu
 */
exports.changePassword = async (req, res) => {
  try {
    const { matKhauCu, matKhauMoi } = req.body;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, req.user.id)
      .query("SELECT matKhauHash FROM TaiKhoan WHERE id = @id");

    const isValid = await bcrypt.compare(
      matKhauCu,
      result.recordset[0].matKhauHash,
    );
    if (!isValid) {
      return res.status(400).json({ error: "Mật khẩu cũ không chính xác" });
    }

    if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(matKhauMoi)) {
      return res
        .status(400)
        .json({ error: "Mật khẩu mới phải ≥8 ký tự, có chữ hoa và số" });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(matKhauMoi, salt);

    await pool
      .request()
      .input("id", sql.Int, req.user.id)
      .input("mk", sql.VarChar, newHash)
      .query(
        "UPDATE TaiKhoan SET matKhauHash = @mk, ngayCapNhat = GETDATE() WHERE id = @id",
      );

    await logAction({
      idUser: req.user.id,
      hanhDong: "Đổi mật khẩu",
      doiTuong: "TaiKhoan",
      idDoiTuong: req.user.id,
    });

    res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Cập nhật hồ sơ
 */
exports.updateProfile = async (req, res) => {
  try {
    const { hoTen, email, ngaySinh, gioiTinh, diaChi, chuyenKhoa, kinhNghiem } =
      req.body;
    const pool = await getPool();

    await pool
      .request()
      .input("id", sql.Int, req.user.id)
      .input("hoTen", sql.NVarChar, hoTen)
      .input("email", sql.NVarChar, email)
      .input("ns", sql.Date, ngaySinh)
      .input("gt", sql.NVarChar, gioiTinh)
      .input("dc", sql.NVarChar, diaChi)
      .input("ck", sql.NVarChar, chuyenKhoa)
      .input("kn", sql.Int, kinhNghiem).query(`UPDATE TaiKhoan 
              SET hoTen = @hoTen, email = @email, ngaySinh = @ns,
                  gioiTinh = @gt, diaChi = @dc, chuyenKhoa = @ck,
                  kinhNghiem = @kn, ngayCapNhat = GETDATE()
              WHERE id = @id`);

    await logAction({
      idUser: req.user.id,
      hanhDong: "Cập nhật hồ sơ",
      doiTuong: "TaiKhoan",
      idDoiTuong: req.user.id,
    });

    res.json({ message: "Cập nhật thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
