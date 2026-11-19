const sql = require("mssql");

// Cấu hình chuẩn cho thư viện mssql
const config = {
  server: "My-PC\\SQLEXPRESS", // ⚠️ CHỈ để localhost, KHÔNG để localhost\SQLEXPRESS
  database: "MediCareHome",
  user: "sa",
  password: "Password123!", // ⚠️ Thay bằng mật khẩu SA thực tế của bạn
  options: {
    instanceName: "SQLEXPRESS", // ⚠️ Để instanceName ở trong options
    trustServerCertificate: true,
    encrypt: false,
    enableArithAbort: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

async function test() {
  try {
    console.log("⏳ Đang kết nối...");
    const pool = await sql.connect(config);
    console.log("✅ Kết nối SQL Server thành công!");

    // Test truy vấn
    const result = await pool.request().query("SELECT @@VERSION AS version");
    console.log(
      "📦 Phiên bản SQL Server:",
      result.recordset[0].version.split("\n")[0],
    );

    await pool.close();
    console.log("🔒 Đã đóng kết nối.");
  } catch (err) {
    console.error("❌ Lỗi kết nối:", err.message);
  }
}

test();
