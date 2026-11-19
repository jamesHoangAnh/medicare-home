// Theo báo cáo: Mã QR có thời hạn 2 phút (120 giây)
function generateQRCode(maHoaDon, tongTien, sdt) {
  const addInfo = `${maHoaDon} ${sdt} thanh toan MediCare`;
  return {
    qrCodeUrl: `https://img.vietqr.io/image/970416-1234567890-compact.png?amount=${tongTien}&addInfo=${encodeURIComponent(addInfo)}&accountName=MEDICARE HOME`,
    expiredAt: new Date(Date.now() + 120000), // Hết hạn sau 2 phút
    bankInfo: {
      bank: "VCB",
      accountNo: "1234567890",
      accountName: "MEDICARE HOME",
    },
  };
}
module.exports = { generateQRCode };
