const { getPool, sql } = require("../config/database");

exports.assignDoctor = async (req, res) => {
  try {
    const { idYeuCau, idBacSi, ghiChuSanLoc } = req.body;
    const pool = await getPool();

    await pool
      .request()
      .input("idYC", sql.Int, idYeuCau)
      .input("idBS", sql.Int, idBacSi)
      .input("gc", sql.NVarChar, ghiChuSanLoc)
      .query(
        `UPDATE YeuCauTuVan SET idBacSi = @idBS, ghiChuSanLoc = @gc, trangThai = 'DaDieuPhoi' WHERE id = @idYC`,
      );

    res.json({ message: "Đã điều phối bác sĩ thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
module.exports = exports;
