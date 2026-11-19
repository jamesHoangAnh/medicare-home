/**
 * Controller: Bệnh án (EMR)
 */
const { getPool, sql } = require("../config/database");
const { logAction } = require("../middleware/logger");

/**
 * Bệnh nhân xem bệnh án của mình
 */
exports.getMyRecords = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().input("idBN", sql.Int, req.user.id)
      .query(`SELECT ba.*, bs.hoTen AS tenBacSi, bs.chuyenKhoa
              FROM BenhAn ba
              JOIN TaiKhoan bs ON ba.idBacSi = bs.id
              WHERE ba.idBenhNhan = @idBN AND ba.trangThai = 'HoatDong'
              ORDER BY ba.ngayTao DESC`);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Xem chi tiết bệnh án
 */
exports.getDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request().input("id", sql.Int, id)
      .query(`SELECT ba.*, 
              bs.hoTen AS tenBacSi, bs.chuyenKhoa,
              bn.hoTen AS tenBenhNhan, bn.soDienThoai AS sdtBenhNhan
              FROM BenhAn ba
              JOIN TaiKhoan bs ON ba.idBacSi = bs.id
              JOIN TaiKhoan bn ON ba.idBenhNhan = bn.id
              WHERE ba.id = @id`);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy bệnh án" });
    }

    const record = result.recordset[0];

    // Kiểm tra quyền: BN chỉ xem của mình, Admin không xem được
    if (req.user.vaiTro === "BenhNhan" && record.idBenhNhan !== req.user.id) {
      return res.status(403).json({ error: "Không có quyền xem bệnh án này" });
    }
    if (req.user.vaiTro === "Admin") {
      return res
        .status(403)
        .json({ error: "Admin không có quyền xem nội dung bệnh án" });
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Bác sĩ tạo bệnh án
 */
exports.create = async (req, res) => {
  try {
    const data = req.body;
    const idBacSi = req.user.id;

    // Tìm bệnh nhân theo SĐT
    const pool = await getPool();
    const bnCheck = await pool
      .request()
      .input("sdt", sql.VarChar, data.soDienThoaiBenhNhan)
      .query(
        "SELECT id FROM TaiKhoan WHERE soDienThoai = @sdt AND vaiTro = 'BenhNhan'",
      );

    if (bnCheck.recordset.length === 0) {
      return res
        .status(400)
        .json({ error: "Không tìm thấy bệnh nhân với SĐT này" });
    }
    const idBenhNhan = bnCheck.recordset[0].id;

    // Tạo mã bệnh án
    const maBenhAn =
      "BA" +
      new Date().toISOString().slice(0, 10).replace(/-/g, "") +
      Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");

    const result = await pool
      .request()
      .input("ma", sql.VarChar, maBenhAn)
      .input("idBN", sql.Int, idBenhNhan)
      .input("idBS", sql.Int, idBacSi)
      .input("idLK", sql.Int, data.idLichKham || null)
      .input("tc", sql.NVarChar, data.trieuChung)
      .input("ts", sql.NVarChar, data.tienSuBenh || null)
      .input("cd", sql.NVarChar, data.chanDoan)
      .input("hd", sql.NVarChar, data.huongDieuTri || null)
      .input("dt", sql.NVarChar, data.donThuoc || null)
      .input("cd_cs", sql.NVarChar, data.chiDanChamSoc || null)
      .input("tk", sql.Date, data.ngayTaiKham || null)
      .query(`INSERT INTO BenhAn 
              (maBenhAn, idBenhNhan, idBacSi, idLichKham, trieuChung, tienSuBenh,
               chanDoan, huongDieuTri, donThuoc, chiDanChamSoc, ngayTaiKham)
              OUTPUT INSERTED.id
              VALUES (@ma, @idBN, @idBS, @idLK, @tc, @ts, @cd, @hd, @dt, @cd_cs, @tk)`);

    const idBenhAn = result.recordset[0].id;

    await logAction({
      idUser: idBacSi,
      hanhDong: "Tạo bệnh án",
      doiTuong: "BenhAn",
      idDoiTuong: idBenhAn,
      chiTiet: `Mã: ${maBenhAn}, BN: ${data.soDienThoaiBenhNhan}`,
    });

    res.status(201).json({
      message: "Tạo bệnh án thành công",
      id: idBenhAn,
      maBenhAn,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Bác sĩ chỉnh sửa bệnh án
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("idBS", sql.Int, req.user.id)
      .input("tc", sql.NVarChar, data.trieuChung)
      .input("cd", sql.NVarChar, data.chanDoan)
      .input("hd", sql.NVarChar, data.huongDieuTri)
      .input("dt", sql.NVarChar, data.donThuoc || null)
      .input("cd_cs", sql.NVarChar, data.chiDanChamSoc || null)
      .query(`UPDATE BenhAn 
              SET trieuChung = @tc, chanDoan = @cd, huongDieuTri = @hd,
                  donThuoc = @dt, chiDanChamSoc = @cd_cs, ngayCapNhat = GETDATE()
              WHERE id = @id AND idBacSi = @idBS`);

    await logAction({
      idUser: req.user.id,
      hanhDong: "Chỉnh sửa bệnh án",
      doiTuong: "BenhAn",
      idDoiTuong: parseInt(id),
    });

    res.json({ message: "Cập nhật bệnh án thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Tìm kiếm bệnh án (cho BS và TVV)
 */
exports.search = async (req, res) => {
  try {
    const { hoTen, soDienThoai } = req.query;
    const pool = await getPool();

    let query = `SELECT ba.*, bn.hoTen AS tenBenhNhan, bn.soDienThoai,
                 bs.hoTen AS tenBacSi
                 FROM BenhAn ba
                 JOIN TaiKhoan bn ON ba.idBenhNhan = bn.id
                 JOIN TaiKhoan bs ON ba.idBacSi = bs.id
                 WHERE ba.trangThai = 'HoatDong'`;

    const request = pool.request();

    if (hoTen) {
      query += " AND bn.hoTen LIKE @hoTen";
      request.input("hoTen", sql.NVarChar, `%${hoTen}%`);
    }
    if (soDienThoai) {
      query += " AND bn.soDienThoai = @sdt";
      request.input("sdt", sql.VarChar, soDienThoai);
    }

    query += " ORDER BY ba.ngayTao DESC";

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = exports;
