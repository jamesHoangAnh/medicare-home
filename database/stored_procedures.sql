USE MediCareHome;
GO

-- ============================================================
-- STORED PROCEDURE: Đặt lịch khám (kiểm tra trùng lịch)
-- ============================================================
CREATE OR ALTER PROCEDURE sp_DatLichKham
    @idBenhNhan INT,
    @idBacSi INT,
    @thoiGian DATETIME,
    @diaChi NVARCHAR(255),
    @ghiChu NVARCHAR(1000) = NULL,
    @idYeuCauTuVan INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Kiểm tra bác sĩ có tồn tại và đang hoạt động
    IF NOT EXISTS (
        SELECT 1 FROM TaiKhoan 
        WHERE id = @idBacSi AND vaiTro = 'BacSi' AND trangThai = 'HoatDong'
    )
    BEGIN
        RAISERROR(N'Bác sĩ không tồn tại hoặc đã bị đình chỉ', 16, 1);
        RETURN;
    END
    
    -- Kiểm tra trùng lịch (cùng BS, cùng giờ, chưa hủy)
    IF EXISTS (
        SELECT 1 FROM LichKham 
        WHERE idBacSi = @idBacSi 
          AND thoiGian = @thoiGian 
          AND trangThai NOT IN ('DaHuy', 'BSTuChoi')
    )
    BEGIN
        RAISERROR(N'Khung giờ này đã được đặt. Vui lòng chọn giờ khác!', 16, 1);
        RETURN;
    END
    
    -- Kiểm tra số lịch khám trong ngày của BS
    DECLARE @soLichHomNay INT;
    SELECT @soLichHomNay = COUNT(*) 
    FROM LichKham 
    WHERE idBacSi = @idBacSi 
      AND CAST(thoiGian AS DATE) = CAST(@thoiGian AS DATE)
      AND trangThai NOT IN ('DaHuy', 'BSTuChoi');
    
    IF @soLichHomNay >= 20
    BEGIN
        RAISERROR(N'Bác sĩ đã đủ lịch trong ngày. Vui lòng chọn ngày khác!', 16, 1);
        RETURN;
    END
    
    -- Tạo lịch khám mới
    INSERT INTO LichKham (idBenhNhan, idBacSi, idYeuCauTuVan, thoiGian, diaChi, ghiChu)
    VALUES (@idBenhNhan, @idBacSi, @idYeuCauTuVan, @thoiGian, @diaChi, @ghiChu);
    
    SELECT SCOPE_IDENTITY() AS idLichKham;
END
GO

-- ============================================================
-- STORED PROCEDURE: Tạo hóa đơn tự động
-- ============================================================
CREATE OR ALTER PROCEDURE sp_TaoHoaDon
    @idLichKham INT = NULL,
    @idYeuCauTuVan INT = NULL,
    @idBenhNhan INT,
    @phiTuVan DECIMAL(12,2) = 0,
    @phiKhamTaiNha DECIMAL(12,2) = 0,
    @phiThuoc DECIMAL(12,2) = 0,
    @phiDichVuKhac DECIMAL(12,2) = 0,
    @giamGia DECIMAL(12,2) = 0,
    @nguoiTao INT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @tongTien DECIMAL(12,2);
    SET @tongTien = @phiTuVan + @phiKhamTaiNha + @phiThuoc + @phiDichVuKhac - @giamGia;
    
    IF @tongTien < 0 SET @tongTien = 0;
    
    -- Tạo mã hóa đơn: HD + YYYYMMDD + 3 số thứ tự
    DECLARE @maHD VARCHAR(20);
    DECLARE @dem INT;
    SELECT @dem = COUNT(*) + 1 
    FROM HoaDon 
    WHERE CAST(ngayTao AS DATE) = CAST(GETDATE() AS DATE);
    
    SET @maHD = 'HD' + FORMAT(GETDATE(), 'yyyyMMdd') + RIGHT('000' + CAST(@dem AS VARCHAR), 3);
    
    INSERT INTO HoaDon (
        maHoaDon, idLichKham, idYeuCauTuVan, idBenhNhan,
        phiTuVan, phiKhamTaiNha, phiThuoc, phiDichVuKhac, giamGia, tongTien,
        nguoiTao
    )
    VALUES (
        @maHD, @idLichKham, @idYeuCauTuVan, @idBenhNhan,
        @phiTuVan, @phiKhamTaiNha, @phiThuoc, @phiDichVuKhac, @giamGia, @tongTien,
        @nguoiTao
    );
    
    SELECT SCOPE_IDENTITY() AS idHoaDon, @maHD AS maHoaDon, @tongTien AS tongTien;
END
GO

-- ============================================================
-- STORED PROCEDURE: Ghi log hệ thống
-- ============================================================
CREATE OR ALTER PROCEDURE sp_GhiLog
    @idUser INT = NULL,
    @tenDangNhap NVARCHAR(100) = NULL,
    @hanhDong VARCHAR(50),
    @doiTuong VARCHAR(50) = NULL,
    @idDoiTuong INT = NULL,
    @chiTiet NVARCHAR(1000) = NULL,
    @trangThaiCu NVARCHAR(100) = NULL,
    @trangThaiMoi NVARCHAR(100) = NULL,
    @ipAddress VARCHAR(50) = NULL,
    @userAgent NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO SystemLog (
        idUser, tenDangNhap, hanhDong, doiTuong, idDoiTuong, chiTiet,
        trangThaiCu, trangThaiMoi, ipAddress, userAgent
    )
    VALUES (
        @idUser, @tenDangNhap, @hanhDong, @doiTuong, @idDoiTuong, @chiTiet,
        @trangThaiCu, @trangThaiMoi, @ipAddress, @userAgent
    );
END
GO

-- ============================================================
-- STORED PROCEDURE: Thống kê tổng quan
-- ============================================================
CREATE OR ALTER PROCEDURE sp_ThongKeTongQuan
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        (SELECT COUNT(*) FROM TaiKhoan WHERE vaiTro = 'BenhNhan') AS soBenhNhan,
        (SELECT COUNT(*) FROM TaiKhoan WHERE vaiTro = 'BacSi' AND trangThai = 'HoatDong') AS soBacSi,
        (SELECT COUNT(*) FROM TaiKhoan WHERE vaiTro = 'TuVanVien') AS soTuVanVien,
        (SELECT COUNT(*) FROM LichKham WHERE trangThai = 'ChoXacNhan') AS lichChoXacNhan,
        (SELECT COUNT(*) FROM LichKham WHERE trangThai = 'DaXacNhan') AS lichDaXacNhan,
        (SELECT COUNT(*) FROM YeuCauTuVan WHERE trangThai = 'ChoXuLy') AS yeuCauChoXuLy,
        (SELECT COUNT(*) FROM HoaDon WHERE trangThai = 'ChoThanhToan') AS hoaDonChoTT,
        (SELECT ISNULL(SUM(tongTien), 0) FROM HoaDon WHERE trangThai = 'DaThanhToan') AS tongDoanhThu;
END
GO

PRINT N'✅ Stored Procedures đã được tạo!';
GO