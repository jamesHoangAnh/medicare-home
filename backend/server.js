const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getPool, sql } = require("./config/database");
require("dotenv").config();

const app = express();
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;
const PAYMENT_VERIFICATION_ERROR =
  "Thanh toán chỉ được xác nhận sau khi hệ thống xác minh giao dịch với ngân hàng.";

async function verifyPassword(password, storedValue) {
  if (typeof password !== "string" || typeof storedValue !== "string") {
    return false;
  }
  if (BCRYPT_HASH_PATTERN.test(storedValue)) {
    return bcrypt.compare(password, storedValue);
  }
  return storedValue === password;
}

function isStrongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

// CORS
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Helper ghi log
async function ghiLog(
  req,
  hanhDong,
  doiTuong = null,
  idDoiTuong = null,
  chiTiet = "",
) {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("idUser", sql.Int, req.user?.id || null)
      .input("tenDN", sql.NVarChar, req.user?.hoTen || "Khách")
      .input("hd", sql.VarChar, hanhDong)
      .input("dt", sql.VarChar, doiTuong)
      .input("idt", sql.Int, idDoiTuong)
      .input("ct", sql.NVarChar, chiTiet)
      .input("ip", sql.VarChar, req.ip)
      .query(`INSERT INTO SystemLog (idUser, tenDangNhap, hanhDong, doiTuong, idDoiTuong, chiTiet, ipAddress, thoiGian)
              VALUES (@idUser, @tenDN, @hd, @dt, @idt, @ct, @ip, GETDATE())`);
  } catch (e) {
    console.error("Log error:", e.message);
  }
}

// ============ MIDDLEWARE XÁC THỰC & PHÂN QUYỀN ============
function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    next();
  } catch (e) {
    return res
      .status(401)
      .json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.vaiTro !== "Admin") {
    return res
      .status(403)
      .json({ error: "Chỉ Quản trị viên mới có quyền thực hiện" });
  }
  next();
}

// ============ AUTH ============
app.post("/api/auth/login", async (req, res) => {
  try {
    const { soDienThoai, matKhau } = req.body;
    if (!soDienThoai || !matKhau)
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });

    const pool = await getPool();
    const result = await pool
      .request()
      .input("sdt", sql.VarChar, soDienThoai)
      .query("SELECT * FROM TaiKhoan WHERE soDienThoai = @sdt");

    if (result.recordset.length === 0)
      return res
        .status(401)
        .json({ error: "Số điện thoại hoặc mật khẩu không chính xác" });

    const user = result.recordset[0];
    if (!(await verifyPassword(matKhau, user.matKhauHash)))
      return res
        .status(401)
        .json({ error: "Số điện thoại hoặc mật khẩu không chính xác" });
    if (user.trangThai === "DinhChi")
      return res.status(403).json({ error: "Tài khoản đang bị đình chỉ" });

    if (!BCRYPT_HASH_PATTERN.test(user.matKhauHash)) {
      const matKhauHash = await bcrypt.hash(matKhau, 10);
      await pool
        .request()
        .input("id", sql.Int, user.id)
        .input("mk", sql.VarChar, matKhauHash)
        .query("UPDATE TaiKhoan SET matKhauHash = @mk WHERE id = @id");
    }

    const token = jwt.sign(
      {
        id: user.id,
        vaiTro: user.vaiTro,
        hoTen: user.hoTen,
        soDienThoai: user.soDienThoai,
      },
      process.env.JWT_SECRET || "medicare_home_secret_2026",
      { expiresIn: "24h" },
    );

    await ghiLog(
      { user: { id: user.id, hoTen: user.hoTen } },
      "Đăng nhập",
      "TaiKhoan",
      user.id,
      `${user.hoTen} đăng nhập`,
    );

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
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { hoTen, soDienThoai, email, matKhau } = req.body;
    if (!hoTen || !soDienThoai || !matKhau)
      return res
        .status(400)
        .json({ error: "Vui lòng điền đầy đủ thông tin bắt buộc" });
    if (!isStrongPassword(matKhau))
      return res
        .status(400)
        .json({ error: "Mật khẩu phải ≥8 ký tự, có chữ hoa và số" });

    const pool = await getPool();
    const check = await pool
      .request()
      .input("sdt", sql.VarChar, soDienThoai)
      .query("SELECT id FROM TaiKhoan WHERE soDienThoai = @sdt");
    if (check.recordset.length > 0)
      return res.status(400).json({ error: "Số điện thoại đã được đăng ký" });

    const matKhauHash = await bcrypt.hash(matKhau, 10);
    await pool
      .request()
      .input("ht", sql.NVarChar, hoTen)
      .input("sdt", sql.VarChar, soDienThoai)
      .input("em", sql.NVarChar, email)
      .input("mk", sql.VarChar, matKhauHash)
      .query(`INSERT INTO TaiKhoan (hoTen, soDienThoai, email, matKhauHash, vaiTro, trangThai)
              VALUES (@ht, @sdt, @em, @mk, 'BenhNhan', 'HoatDong')`);

    res.status(201).json({ message: "Đăng ký thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, decoded.id)
      .query("SELECT * FROM TaiKhoan WHERE id = @id");
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(401).json({ error: "Token không hợp lệ" });
  }
});

app.put("/api/auth/change-password", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const { matKhauCu, matKhauMoi } = req.body;

    if (!matKhauCu || !matKhauMoi)
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ" });
    if (!isStrongPassword(matKhauMoi)) {
      return res
        .status(400)
        .json({ error: "Mật khẩu mới phải ≥8 ký tự, có chữ hoa và số" });
    }

    const pool = await getPool();
    const user = await pool
      .request()
      .input("id", sql.Int, decoded.id)
      .query("SELECT matKhauHash FROM TaiKhoan WHERE id = @id");

    if (!(await verifyPassword(matKhauCu, user.recordset[0].matKhauHash))) {
      return res.status(400).json({ error: "Mật khẩu cũ không chính xác" });
    }

    const matKhauHash = await bcrypt.hash(matKhauMoi, 10);
    await pool
      .request()
      .input("id", sql.Int, decoded.id)
      .input("mk", sql.VarChar, matKhauHash)
      .query("UPDATE TaiKhoan SET matKhauHash = @mk WHERE id = @id");

    await ghiLog(
      req,
      "Đổi mật khẩu",
      "TaiKhoan",
      decoded.id,
      "Đổi mật khẩu thành công",
    );
    res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DOCTORS (Công khai) ============
app.get("/api/doctors", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });
    jwt.verify(token, process.env.JWT_SECRET || "medicare_home_secret_2026");

    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT id, hoTen, chuyenKhoa, kinhNghiem, trangThai
              FROM TaiKhoan 
              WHERE vaiTro = 'BacSi' AND trangThai = 'HoatDong'
              ORDER BY chuyenKhoa, hoTen`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PATIENT ROUTES ============
app.get("/api/patient/consultation/my-requests", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const pool = await getPool();
    const result = await pool.request().input("id", sql.Int, decoded.id)
      .query(`SELECT yc.*, bs.hoTen AS tenBacSi, bs.chuyenKhoa
              FROM YeuCauTuVan yc LEFT JOIN TaiKhoan bs ON yc.idBacSi = bs.id
              WHERE yc.idBenhNhan = @id ORDER BY yc.thoiGianTao DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/patient/consultation/request", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const { hinhThuc, trieuChung } = req.body;
    if (!trieuChung)
      return res.status(400).json({ error: "Vui lòng nhập triệu chứng" });

    const pool = await getPool();
    await pool
      .request()
      .input("idBN", sql.Int, decoded.id)
      .input("ht", sql.VarChar, hinhThuc)
      .input("tc", sql.NVarChar, trieuChung)
      .query(
        "INSERT INTO YeuCauTuVan (idBenhNhan, hinhThuc, trieuChung) VALUES (@idBN, @ht, @tc)",
      );

    await ghiLog(
      req,
      "Yêu cầu tư vấn",
      "YeuCauTuVan",
      null,
      `Hình thức: ${hinhThuc}, TC: ${trieuChung}`,
    );
    res.status(201).json({ message: "Đã gửi yêu cầu" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/patient/appointment/my", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const pool = await getPool();
    const result = await pool.request().input("id", sql.Int, decoded.id)
      .query(`SELECT lk.*, bs.hoTen AS tenBacSi, bs.chuyenKhoa
              FROM LichKham lk JOIN TaiKhoan bs ON lk.idBacSi = bs.id
              WHERE lk.idBenhNhan = @id ORDER BY lk.thoiGian DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/patient/appointment", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const { idBacSi, thoiGian, diaChi, ghiChu } = req.body;
    if (!thoiGian || !diaChi)
      return res.status(400).json({ error: "Vui lòng điền đủ thông tin" });

    const pool = await getPool();
    await pool
      .request()
      .input("idBN", sql.Int, decoded.id)
      .input("idBS", sql.Int, idBacSi)
      .input("tg", sql.DateTime, new Date(thoiGian))
      .input("dc", sql.NVarChar, diaChi)
      .input("gc", sql.NVarChar, ghiChu || "")
      .query(
        "INSERT INTO LichKham (idBenhNhan, idBacSi, thoiGian, diaChi, ghiChu) VALUES (@idBN, @idBS, @tg, @dc, @gc)",
      );

    await ghiLog(
      req,
      "Đặt lịch khám",
      "LichKham",
      null,
      `Đặt với BS#${idBacSi}`,
    );
    res.status(201).json({ message: "Đặt lịch thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/patient/appointment/:id/cancel", async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE LichKham SET trangThai = 'DaHuy' WHERE id = @id");
    await ghiLog(
      req,
      "Hủy lịch khám",
      "LichKham",
      parseInt(req.params.id),
      "BN hủy lịch",
    );
    res.json({ message: "Đã hủy" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/patient/medical-records", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const pool = await getPool();
    const result = await pool.request().input("id", sql.Int, decoded.id)
      .query(`SELECT ba.*, bs.hoTen AS tenBacSi, bs.chuyenKhoa
              FROM BenhAn ba JOIN TaiKhoan bs ON ba.idBacSi = bs.id
              WHERE ba.idBenhNhan = @id ORDER BY ba.ngayTao DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/patient/invoices", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, decoded.id)
      .query(
        "SELECT * FROM HoaDon WHERE idBenhNhan = @id ORDER BY ngayTao DESC",
      );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/patient/invoices/:id/generate-qr", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query("SELECT * FROM HoaDon WHERE id = @id");
    if (result.recordset.length === 0)
      return res.status(404).json({ error: "Không tìm thấy hóa đơn" });

    const hd = result.recordset[0];
    const qrUrl = `https://img.vietqr.io/image/970416-1234567890-compact.png?amount=${hd.tongTien}&addInfo=HD${hd.id}&accountName=MEDICARE HOME`;
    res.json({
      qrCodeUrl: qrUrl,
      tongTien: hd.tongTien,
      bankInfo: {
        bank: "VCB",
        accountNo: "1234567890",
        accountName: "MEDICARE HOME",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/patient/invoices/:id/confirm-payment",
  auth,
  (req, res) => {
    if (req.user?.vaiTro !== "BenhNhan") {
      return res.status(403).json({ error: "Chỉ bệnh nhân mới có quyền này" });
    }
    return res.status(501).json({ error: PAYMENT_VERIFICATION_ERROR });
  },
);

// ============ DOCTOR ROUTES ============
app.get("/api/doctor/appointments/pending", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const pool = await getPool();
    const result = await pool.request().input("id", sql.Int, decoded.id)
      .query(`SELECT lk.*, bn.hoTen AS tenBenhNhan, bn.soDienThoai AS sdtBenhNhan
              FROM LichKham lk JOIN TaiKhoan bn ON lk.idBenhNhan = bn.id
              WHERE lk.idBacSi = @id AND lk.trangThai = 'ChoXacNhan' ORDER BY lk.thoiGian ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/doctor/appointments/:id/status", async (req, res) => {
  try {
    const { trangThai } = req.body;
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .input("tt", sql.VarChar, trangThai)
      .query("UPDATE LichKham SET trangThai = @tt WHERE id = @id");
    await ghiLog(
      req,
      trangThai === "DaXacNhan" ? "Xác nhận lịch" : "Từ chối lịch",
      "LichKham",
      parseInt(req.params.id),
      "",
    );
    res.json({ message: "Đã cập nhật" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/doctor/medical-records", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    const {
      soDienThoaiBenhNhan,
      trieuChung,
      chanDoan,
      huongDieuTri,
      donThuoc,
    } = req.body;

    const pool = await getPool();
    const bn = await pool
      .request()
      .input("sdt", sql.VarChar, soDienThoaiBenhNhan)
      .query(
        "SELECT id FROM TaiKhoan WHERE soDienThoai = @sdt AND vaiTro = 'BenhNhan'",
      );
    if (bn.recordset.length === 0)
      return res.status(400).json({ error: "Không tìm thấy BN" });

    await pool
      .request()
      .input("idBN", sql.Int, bn.recordset[0].id)
      .input("idBS", sql.Int, decoded.id)
      .input("tc", sql.NVarChar, trieuChung)
      .input("cd", sql.NVarChar, chanDoan)
      .input("hd", sql.NVarChar, huongDieuTri)
      .input("dt", sql.NVarChar, donThuoc || "")
      .query(
        "INSERT INTO BenhAn (idBenhNhan, idBacSi, trieuChung, chanDoan, huongDieuTri, donThuoc) VALUES (@idBN, @idBS, @tc, @cd, @hd, @dt)",
      );

    await ghiLog(
      req,
      "Tạo bệnh án",
      "BenhAn",
      null,
      `BN: ${soDienThoaiBenhNhan}`,
    );
    res.status(201).json({ message: "Đã tạo bệnh án" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/doctor/invoices", async (req, res) => {
  try {
    const { idBenhNhan, phiTuVan, phiKhamTaiNha, phiThuoc } = req.body;
    const tongTien = (phiTuVan || 0) + (phiKhamTaiNha || 0) + (phiThuoc || 0);
    const pool = await getPool();
    await pool
      .request()
      .input("idBN", sql.Int, idBenhNhan)
      .input("ptv", sql.Decimal, phiTuVan || 0)
      .input("pk", sql.Decimal, phiKhamTaiNha || 0)
      .input("pt", sql.Decimal, phiThuoc || 0)
      .input("tt", sql.Decimal, tongTien)
      .query(
        "INSERT INTO HoaDon (idBenhNhan, phiTuVan, phiKham, phiThuoc, tongTien, trangThai) VALUES (@idBN, @ptv, @pk, @pt, @tt, 'ChoThanhToan')",
      );
    await ghiLog(req, "Tạo hóa đơn", "HoaDon", null, `Tổng: ${tongTien}₫`);
    res.status(201).json({ message: "Đã tạo hóa đơn", tongTien });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CONSULTANT ROUTES ============
app.get("/api/consultant/requests/pending", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT yc.*, bn.hoTen AS tenBenhNhan, bn.soDienThoai AS sdtBenhNhan
              FROM YeuCauTuVan yc JOIN TaiKhoan bn ON yc.idBenhNhan = bn.id
              WHERE yc.trangThai IN ('ChoXuLy', 'DangSanLoc') ORDER BY yc.thoiGianTao ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/consultant/requests/assign", async (req, res) => {
  try {
    const { idYeuCau, idBacSi, ghiChuSanLoc } = req.body;
    const pool = await getPool();
    await pool
      .request()
      .input("idYC", sql.Int, idYeuCau)
      .input("idBS", sql.Int, idBacSi)
      .input("gc", sql.NVarChar, ghiChuSanLoc || "")
      .query(
        "UPDATE YeuCauTuVan SET idBacSi = @idBS, ghiChuSanLoc = @gc, trangThai = 'DaDieuPhoi' WHERE id = @idYC",
      );
    await ghiLog(
      req,
      "Điều phối bác sĩ",
      "YeuCauTuVan",
      idYeuCau,
      `YC#${idYeuCau} → BS#${idBacSi}`,
    );
    res.json({ message: "Đã điều phối" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ADMIN ROUTES ============
app.use("/api/admin", auth, requireAdmin);

app.get("/api/admin/statistics", async (req, res) => {
  try {
    const pool = await getPool();
    const bn = await pool
      .request()
      .query(
        "SELECT COUNT(*) as count FROM TaiKhoan WHERE vaiTro = 'BenhNhan'",
      );
    const bs = await pool
      .request()
      .query(
        "SELECT COUNT(*) as count FROM TaiKhoan WHERE vaiTro = 'BacSi' AND trangThai = 'HoatDong'",
      );
    const dt = await pool
      .request()
      .query(
        "SELECT ISNULL(SUM(tongTien), 0) as total FROM HoaDon WHERE trangThai = 'DaThanhToan'",
      );
    const yc = await pool
      .request()
      .query(
        "SELECT COUNT(*) as count FROM YeuCauTuVan WHERE trangThai = 'ChoXuLy'",
      );
    const lk = await pool
      .request()
      .query(
        "SELECT COUNT(*) as count FROM LichKham WHERE trangThai = 'DaXacNhan'",
      );
    res.json({
      soBenhNhan: bn.recordset[0].count,
      soBacSi: bs.recordset[0].count,
      tongDoanhThu: dt.recordset[0].total,
      yeuCauChoXuLy: yc.recordset[0].count,
      lichDaXacNhan: lk.recordset[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/accounts", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(
        "SELECT id, hoTen, soDienThoai, email, vaiTro, chuyenKhoa, kinhNghiem, trangThai, ngayTao FROM TaiKhoan ORDER BY id DESC",
      );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/accounts", async (req, res) => {
  try {
    const {
      hoTen,
      soDienThoai,
      email,
      vaiTro,
      chuyenKhoa,
      kinhNghiem,
      matKhau,
    } = req.body;
    if (!hoTen || !soDienThoai || !matKhau)
      return res
        .status(400)
        .json({ error: "Vui lòng điền đầy đủ thông tin bắt buộc" });
    if (!["BacSi", "TuVanVien"].includes(vaiTro))
      return res
        .status(400)
        .json({ error: "Chỉ được tạo tài khoản Bác sĩ hoặc Tư vấn viên" });
    if (!isStrongPassword(matKhau))
      return res
        .status(400)
        .json({ error: "Mật khẩu phải ≥8 ký tự, có chữ hoa và số" });

    const matKhauHash = await bcrypt.hash(matKhau, 10);
    const pool = await getPool();
    const check = await pool
      .request()
      .input("sdt", sql.VarChar, soDienThoai)
      .query("SELECT id FROM TaiKhoan WHERE soDienThoai = @sdt");
    if (check.recordset.length > 0)
      return res.status(400).json({ error: "SĐT đã tồn tại" });

    await pool
      .request()
      .input("ht", sql.NVarChar, hoTen)
      .input("sdt", sql.VarChar, soDienThoai)
      .input("em", sql.NVarChar, email)
      .input("vt", sql.VarChar, vaiTro)
      .input("ck", sql.NVarChar, chuyenKhoa || null)
      .input("kn", sql.Int, kinhNghiem || 0)
      .input("mk", sql.VarChar, matKhauHash)
      .query(
        "INSERT INTO TaiKhoan (hoTen, soDienThoai, email, vaiTro, chuyenKhoa, kinhNghiem, matKhauHash, trangThai) VALUES (@ht, @sdt, @em, @vt, @ck, @kn, @mk, 'HoatDong')",
      );

    await ghiLog(
      req,
      "Tạo tài khoản",
      "TaiKhoan",
      null,
      `${hoTen} - ${vaiTro}`,
    );
    res.status(201).json({ message: "Tạo tài khoản thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/accounts/:id/suspend", async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE TaiKhoan SET trangThai = 'DinhChi' WHERE id = @id");
    await ghiLog(
      req,
      "Đình chỉ tài khoản",
      "TaiKhoan",
      parseInt(req.params.id),
      "",
    );
    res.json({ message: "Đã đình chỉ" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/accounts/:id/activate", async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE TaiKhoan SET trangThai = 'HoatDong' WHERE id = @id");
    await ghiLog(
      req,
      "Kích hoạt tài khoản",
      "TaiKhoan",
      parseInt(req.params.id),
      "",
    );
    res.json({ message: "Đã kích hoạt" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/accounts/:id", async (req, res) => {
  const pool = await getPool();
  const id = parseInt(req.params.id);
  let transaction;

  try {
    // ===== 1. CHẶN TỰ XÓA CHÍNH MÌNH =====
    if (req.user.id === id) {
      return res.status(400).json({
        error: "Không thể xóa tài khoản của chính bạn đang đăng nhập!",
      });
    }

    // ===== 2. Kiểm tra tài khoản tồn tại =====
    const tk = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT id, hoTen, vaiTro FROM TaiKhoan WHERE id = @id");
    if (tk.recordset.length === 0) {
      return res.status(404).json({ error: "Tài khoản không tồn tại" });
    }
    const target = tk.recordset[0];

    // ===== 3. Chặn xóa Admin cuối cùng của hệ thống =====
    if (target.vaiTro === "Admin") {
      const dem = await pool
        .request()
        .query(
          "SELECT COUNT(*) AS n FROM TaiKhoan WHERE vaiTro = 'Admin' AND trangThai = 'HoatDong'",
        );
      if (dem.recordset[0].n <= 1) {
        return res.status(400).json({
          error: "Không thể xóa Quản trị viên cuối cùng của hệ thống!",
        });
      }
    }

    // ===== 4. Chặn nếu còn giao dịch ĐANG diễn ra (báo cáo - Alt Flow A2) =====
    const busy = await pool.request().input("id", sql.Int, id).query(`
      SELECT
        (SELECT COUNT(*) FROM LichKham
          WHERE (idBenhNhan = @id OR idBacSi = @id)
            AND trangThai IN ('ChoXacNhan','DaXacNhan')) AS lichMo,
        (SELECT COUNT(*) FROM HoaDon
          WHERE idBenhNhan = @id AND trangThai = 'ChoThanhToan') AS hdChuaTT
    `);
    const { lichMo, hdChuaTT } = busy.recordset[0];
    if (lichMo > 0 || hdChuaTT > 0) {
      return res.status(400).json({
        error: `Không thể xóa "${target.hoTen}": còn ${lichMo} lịch khám chưa hoàn tất, ${hdChuaTT} hóa đơn chưa thanh toán.`,
      });
    }

    // ===== 5. TỰ ĐỘNG tìm MỌI cột khóa ngoại còn tham chiếu TaiKhoan =====
    const fk = await pool.request().query(`
      SELECT 
        OBJECT_NAME(fk.parent_object_id) AS bangCon,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS cotCon,
        c.is_nullable AS choPhepNull
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      JOIN sys.columns c ON c.object_id = fkc.parent_object_id 
                        AND c.column_id = fkc.parent_column_id
      WHERE OBJECT_NAME(fk.referenced_object_id) = 'TaiKhoan'
    `);

    // Nếu còn cột NOT NULL → báo rõ để xử lý, không để SQL ném lỗi thô
    const cotChan = fk.recordset.filter(
      (f) => !f.choPhepNull && f.bangCon !== "SystemLog",
    );
    if (cotChan.length > 0) {
      return res.status(400).json({
        error:
          "Còn cột NOT NULL chặn xóa: " +
          cotChan.map((f) => `${f.bangCon}.${f.cotCon}`).join(", ") +
          ". Hãy chạy script ALTER COLUMN ... NULL trong SSMS.",
      });
    }

    // ===== 6. TRANSACTION: ngắt liên kết rồi xóa =====
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const f of fk.recordset) {
      // GIỮ NGUYÊN SystemLog để truy vết (theo báo cáo 3.2.2u)
      if (f.bangCon === "SystemLog") continue;
      await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .query(
          `UPDATE [${f.bangCon}] SET [${f.cotCon}] = NULL WHERE [${f.cotCon}] = @id`,
        );
    }

    const del = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query("DELETE FROM TaiKhoan WHERE id = @id");

    if (del.rowsAffected[0] === 0) {
      throw new Error("Không có bản ghi nào bị xóa");
    }

    await transaction.commit();
    transaction = null;

    // ===== 7. Ghi log (giờ đã có req.user nhờ middleware auth) =====
    await ghiLog(
      req,
      "Xóa tài khoản",
      "TaiKhoan",
      id,
      `Admin ${req.user.hoTen} đã xóa tài khoản "${target.hoTen}" (${target.vaiTro})`,
    );

    res.json({ message: `Đã xóa tài khoản "${target.hoTen}" thành công` });
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {}
    }
    console.error("❌ Delete error:", err);
    res.status(500).json({ error: "Lỗi khi xóa: " + err.message });
  }
});

app.get("/api/admin/logs", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT TOP 100 l.*, ISNULL(tk.hoTen, l.tenDangNhap) AS tenUser, tk.vaiTro
              FROM SystemLog l LEFT JOIN TaiKhoan tk ON l.idUser = tk.id
              ORDER BY l.thoiGian DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/log-actions", async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool
      .request()
      .query("SELECT DISTINCT hanhDong FROM SystemLog ORDER BY hanhDong");
    res.json(r.recordset.map((x) => x.hanhDong));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/config", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query("SELECT * FROM CauHinhHeThong ORDER BY id");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/config", async (req, res) => {
  try {
    const { configs } = req.body;
    const pool = await getPool();
    for (const cfg of configs) {
      await pool
        .request()
        .input("khoa", sql.NVarChar, cfg.khoa)
        .input("gt", sql.NVarChar, cfg.giaTri)
        .query("UPDATE CauHinhHeThong SET giaTri = @gt WHERE khoa = @khoa");
    }
    await ghiLog(
      req,
      "Cập nhật cấu hình",
      "CauHinh",
      null,
      `${configs.length} tham số`,
    );
    res.json({ message: "Đã cập nhật" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/backup", async (req, res) => {
  await ghiLog(req, "Sao lưu dữ liệu", "Database", null, "Sao lưu thành công");
  res.json({
    message: "Sao lưu thành công",
    fileName: "backup_" + Date.now() + ".bak",
  });
});

// ===== MIDDLEWARE (bỏ qua nếu đã có) =====
function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || "medicare_home_secret_2026",
    );
    next();
  } catch (e) {
    return res.status(401).json({ error: "Phiên đăng nhập không hợp lệ" });
  }
}
function requireAdmin(req, res, next) {
  if (req.user?.vaiTro !== "Admin")
    return res.status(403).json({ error: "Chỉ Admin có quyền này" });
  next();
}

// ===== 1. XEM TẤT CẢ LỊCH CỦA BÁC SĨ (Hình 116) =====
app.get("/api/doctor/appointments/my", auth, async (req, res) => {
  try {
    if (req.user.vaiTro !== "BacSi")
      return res.status(403).json({ error: "Chỉ Bác sĩ" });
    const pool = await getPool();
    const r = await pool.request().input("id", sql.Int, req.user.id).query(`
      SELECT lk.*, ISNULL(bn.hoTen, N'(Đã xóa)') AS tenBenhNhan, bn.soDienThoai AS sdtBenhNhan
      FROM LichKham lk LEFT JOIN TaiKhoan bn ON lk.idBenhNhan = bn.id
      WHERE lk.idBacSi = @id ORDER BY lk.thoiGian DESC`);
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 2. ĐỔI TRẠNG THÁI LỊCH — dùng chung BN + BS (Hình 8, 40) =====
app.put("/api/appointments/:id/status", auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { trangThai, lyDo } = req.body;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM LichKham WHERE id = @id");
    if (r.recordset.length === 0)
      return res.status(404).json({ error: "Không tìm thấy lịch khám" });
    const lk = r.recordset[0];

    // RBAC: chỉ người trong cuộc mới được đổi
    const laBenhNhan =
      req.user.vaiTro === "BenhNhan" && lk.idBenhNhan === req.user.id;
    const laBacSi = req.user.vaiTro === "BacSi" && lk.idBacSi === req.user.id;
    if (!laBenhNhan && !laBacSi) {
      return res
        .status(403)
        .json({ error: "Bạn không có quyền với lịch khám này" });
    }

    // Lịch đã kết thúc thì không đổi nữa
    if (["HoanThanh", "DaHuy", "BSTuChoi"].includes(lk.trangThai)) {
      return res
        .status(400)
        .json({ error: "Lịch này đã kết thúc, không thể thay đổi" });
    }

    // Ma trận chuyển trạng thái hợp lệ
    const choPhep = {
      BacSi: {
        ChoXacNhan: ["DaXacNhan", "BSTuChoi"],
        DaXacNhan: ["HoanThanh", "DaHuy"],
      },
      BenhNhan: { ChoXacNhan: ["DaHuy"], DaXacNhan: ["DaHuy"] },
    };
    const hopLe = (choPhep[req.user.vaiTro]?.[lk.trangThai] || []).includes(
      trangThai,
    );
    if (!hopLe) {
      return res
        .status(400)
        .json({
          error: `Không thể chuyển từ "${lk.trangThai}" sang "${trangThai}"`,
        });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("tt", sql.VarChar, trangThai)
      .query("UPDATE LichKham SET trangThai = @tt WHERE id = @id");

    await ghiLog(
      req,
      "Cập nhật lịch khám",
      "LichKham",
      id,
      `${lk.trangThai} → ${trangThai}${lyDo ? " | Lý do: " + lyDo : ""}`,
    );

    res.json({ message: "Đã cập nhật trạng thái lịch khám" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 3. CHỈNH SỬA LỊCH KHÁM (Hình 40 / 111) =====
app.put("/api/appointments/:id", auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { thoiGian, diaChi, ghiChu } = req.body;
    if (!thoiGian || !diaChi)
      return res.status(400).json({ error: "Thiếu thời gian hoặc địa chỉ" });

    const pool = await getPool();
    const r = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM LichKham WHERE id = @id");
    if (r.recordset.length === 0)
      return res.status(404).json({ error: "Không tìm thấy lịch khám" });
    const lk = r.recordset[0];

    const coQuyen = lk.idBenhNhan === req.user.id || lk.idBacSi === req.user.id;
    if (!coQuyen)
      return res.status(403).json({ error: "Bạn không có quyền sửa lịch này" });
    if (["HoanThanh", "DaHuy", "BSTuChoi"].includes(lk.trangThai)) {
      return res.status(400).json({ error: "Lịch đã kết thúc, không thể sửa" });
    }

    // Chống trùng giờ của cùng bác sĩ (Concurrency Control - mục 4.2.2d)
    const trung = await pool
      .request()
      .input("idBS", sql.Int, lk.idBacSi)
      .input("tg", sql.DateTime, new Date(thoiGian))
      .input("id", sql.Int, id).query(`SELECT COUNT(*) AS n FROM LichKham
              WHERE idBacSi = @idBS AND thoiGian = @tg AND id <> @id
                AND trangThai NOT IN ('DaHuy','BSTuChoi')`);
    if (trung.recordset[0].n > 0) {
      return res
        .status(400)
        .json({
          error:
            "Bác sĩ đã có lịch khác vào khung giờ này. Vui lòng chọn giờ khác.",
        });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("tg", sql.DateTime, new Date(thoiGian))
      .input("dc", sql.NVarChar, diaChi)
      .input("gc", sql.NVarChar, ghiChu || "")
      .query(
        "UPDATE LichKham SET thoiGian=@tg, diaChi=@dc, ghiChu=@gc WHERE id=@id",
      );

    await ghiLog(
      req,
      "Chỉnh sửa lịch khám",
      "LichKham",
      id,
      `Giờ mới: ${thoiGian}, ĐH: ${diaChi}`,
    );
    res.json({ message: "Đã cập nhật lịch khám" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 4. XEM RÀNG BUỘC TRƯỚC KHI XÓA TÀI KHOẢN =====
app.get(
  "/api/admin/accounts/:id/dependencies",
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = await getPool();
      const lich = await pool.request().input("id", sql.Int, id).query(`
      SELECT lk.id, lk.thoiGian, lk.trangThai, lk.diaChi,
             ISNULL(bn.hoTen, N'(Đã xóa)') AS tenBenhNhan,
             ISNULL(bs.hoTen, N'(Đã xóa)') AS tenBacSi
      FROM LichKham lk
      LEFT JOIN TaiKhoan bn ON lk.idBenhNhan = bn.id
      LEFT JOIN TaiKhoan bs ON lk.idBacSi = bs.id
      WHERE (lk.idBenhNhan = @id OR lk.idBacSi = @id)
        AND lk.trangThai IN ('ChoXacNhan','DaXacNhan')
      ORDER BY lk.thoiGian DESC`);
      const hd = await pool.request().input("id", sql.Int, id).query(`
      SELECT id, tongTien, trangThai FROM HoaDon
      WHERE idBenhNhan = @id AND trangThai = 'ChoThanhToan'`);
      res.json({ lich: lich.recordset, hoaDon: hd.recordset });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// 404 handler
app.use((req, res) =>
  res.status(404).json({ error: "API không tồn tại: " + req.originalUrl }),
);
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, async () => {
    try {
      await getPool();
      console.log("✅ Backend chạy tại http://localhost:" + PORT);
    } catch (err) {
      console.error("❌ Lỗi kết nối DB:", err.message);
    }
  });
}

module.exports = app;
