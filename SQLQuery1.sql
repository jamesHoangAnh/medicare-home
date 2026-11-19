CREATE DATABASE MediCareHome;
GO
USE MediCareHome;
GO

-- 1. Bảng TaiKhoan (Theo mô hình miền Báo cáo)
CREATE TABLE TaiKhoan (
    id INT IDENTITY(1,1) PRIMARY KEY,
    hoTen NVARCHAR(100) NOT NULL,
    soDienThoai VARCHAR(15) UNIQUE NOT NULL,
    email NVARCHAR(100),
    matKhauHash VARCHAR(255) NOT NULL,
    vaiTro VARCHAR(20) NOT NULL CHECK (vaiTro IN ('BenhNhan', 'TuVanVien', 'BacSi', 'Admin')),
    chuyenKhoa NVARCHAR(100),
    kinhNghiem INT,
    trangThai VARCHAR(20) DEFAULT 'HoatDong',
    ngayTao DATETIME DEFAULT GETDATE()
);

-- 2. Bảng YeuCauTuVan
CREATE TABLE YeuCauTuVan (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idBenhNhan INT FOREIGN KEY REFERENCES TaiKhoan(id),
    hinhThuc VARCHAR(20) CHECK (hinhThuc IN ('Chat', 'VideoCall')),
    trieuChung NVARCHAR(1000),
    ghiChuSanLoc NVARCHAR(1000),
    idBacSi INT FOREIGN KEY REFERENCES TaiKhoan(id),
    trangThai VARCHAR(20) DEFAULT 'ChoXuLy',
    thoiGianTao DATETIME DEFAULT GETDATE()
);

-- 3. Bảng LichKham
CREATE TABLE LichKham (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idBenhNhan INT FOREIGN KEY REFERENCES TaiKhoan(id),
    idBacSi INT FOREIGN KEY REFERENCES TaiKhoan(id),
    thoiGian DATETIME NOT NULL,
    diaChi NVARCHAR(255),
    ghiChu NVARCHAR(500),
    trangThai VARCHAR(20) DEFAULT 'ChoXacNhan',
    ngayTao DATETIME DEFAULT GETDATE()
);

-- 4. Bảng BenhAn (EMR)
CREATE TABLE BenhAn (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idBenhNhan INT FOREIGN KEY REFERENCES TaiKhoan(id),
    idBacSi INT FOREIGN KEY REFERENCES TaiKhoan(id),
    trieuChung NVARCHAR(1000),
    chanDoan NVARCHAR(1000),
    huongDieuTri NVARCHAR(1000),
    donThuoc NVARCHAR(1000),
    ngayTao DATETIME DEFAULT GETDATE()
);

-- 5. Bảng HoaDon
CREATE TABLE HoaDon (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idLichKham INT FOREIGN KEY REFERENCES LichKham(id),
    idBenhNhan INT FOREIGN KEY REFERENCES TaiKhoan(id),
    phiTuVan DECIMAL(12,2),
    phiKham DECIMAL(12,2),
    phiThuoc DECIMAL(12,2),
    tongTien DECIMAL(12,2),
    trangThai VARCHAR(20) DEFAULT 'ChoThanhToan',
    ngayTao DATETIME DEFAULT GETDATE(),
    ngayThanhToan DATETIME
);

-- 6. Bảng SystemLog (Cơ chế Logging)
CREATE TABLE SystemLog (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idUser INT,
    hanhDong NVARCHAR(200),
    chiTiet NVARCHAR(500),
    thoiGian DATETIME DEFAULT GETDATE()
);

-- Dữ liệu mẫu (Mật khẩu mặc định: 123456)
INSERT INTO TaiKhoan (hoTen, soDienThoai, matKhauHash, vaiTro, chuyenKhoa, kinhNghiem) VALUES
(N'Admin Hệ thống', '0901111000', '123456', 'Admin', NULL, NULL),
(N'Nguyễn Văn An', '0901111001', '123456', 'BenhNhan', NULL, NULL),
(N'Trần Thị Bình', '0901111002', '123456', 'TuVanVien', NULL, NULL),
(N'BS. Lê Minh Châu', '0901111003', '123456', 'BacSi', N'Nội tổng quát', 10);
GO

USE MediCareHome; --###
GO

-- Kiểm tra và thêm cột tenDangNhap
IF NOT EXISTS (SELECT 1 FROM sys.columns 
               WHERE object_id = OBJECT_ID('SystemLog') AND name = 'tenDangNhap')
BEGIN
    ALTER TABLE SystemLog ADD tenDangNhap NVARCHAR(100) NULL;
    PRINT '✅ Đã thêm cột tenDangNhap';
END

-- Kiểm tra và thêm cột doiTuong
IF NOT EXISTS (SELECT 1 FROM sys.columns 
               WHERE object_id = OBJECT_ID('SystemLog') AND name = 'doiTuong')
BEGIN
    ALTER TABLE SystemLog ADD doiTuong VARCHAR(50) NULL;
    PRINT '✅ Đã thêm cột doiTuong';
END

-- Kiểm tra và thêm cột idDoiTuong
IF NOT EXISTS (SELECT 1 FROM sys.columns 
               WHERE object_id = OBJECT_ID('SystemLog') AND name = 'idDoiTuong')
BEGIN
    ALTER TABLE SystemLog ADD idDoiTuong INT NULL;
    PRINT '✅ Đã thêm cột idDoiTuong';
END

-- Kiểm tra và thêm cột ipAddress
IF NOT EXISTS (SELECT 1 FROM sys.columns 
               WHERE object_id = OBJECT_ID('SystemLog') AND name = 'ipAddress')
BEGIN
    ALTER TABLE SystemLog ADD ipAddress VARCHAR(50) NULL;
    PRINT '✅ Đã thêm cột ipAddress';
END

-- Kiểm tra và thêm cột trangThaiCu
IF NOT EXISTS (SELECT 1 FROM sys.columns 
               WHERE object_id = OBJECT_ID('SystemLog') AND name = 'trangThaiCu')
BEGIN
    ALTER TABLE SystemLog ADD trangThaiCu NVARCHAR(100) NULL;
    PRINT '✅ Đã thêm cột trangThaiCu';
END

-- Kiểm tra và thêm cột trangThaiMoi
IF NOT EXISTS (SELECT 1 FROM sys.columns 
               WHERE object_id = OBJECT_ID('SystemLog') AND name = 'trangThaiMoi')
BEGIN
    ALTER TABLE SystemLog ADD trangThaiMoi NVARCHAR(100) NULL;
    PRINT '✅ Đã thêm cột trangThaiMoi';
END

-- Xem cấu trúc bảng sau khi sửa
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'SystemLog'
ORDER BY ORDINAL_POSITION;
GO

USE MediCareHome; --###
GO

-- 1. Xóa TẤT CẢ khóa ngoại đang tham chiếu tới TaiKhoan (dọn sạch trạng thái lỗi)
DECLARE @sql NVARCHAR(MAX) = '';
SELECT @sql += 'ALTER TABLE ' + QUOTENAME(OBJECT_NAME(f.parent_object_id)) 
             + ' DROP CONSTRAINT ' + QUOTENAME(f.name) + ';' + CHAR(13)
FROM sys.foreign_keys f
WHERE OBJECT_NAME(f.referenced_object_id) = 'TaiKhoan';
PRINT @sql;
EXEC sp_executesql @sql;
GO

-- 2. Cho phép các cột khóa ngoại nhận NULL (bắt buộc để ngắt liên kết)
ALTER TABLE YeuCauTuVan ALTER COLUMN idBenhNhan INT NULL;
ALTER TABLE YeuCauTuVan ALTER COLUMN idBacSi    INT NULL;
ALTER TABLE LichKham    ALTER COLUMN idBenhNhan INT NULL;
ALTER TABLE LichKham    ALTER COLUMN idBacSi    INT NULL;
ALTER TABLE BenhAn      ALTER COLUMN idBenhNhan INT NULL;
ALTER TABLE BenhAn      ALTER COLUMN idBacSi    INT NULL;
ALTER TABLE HoaDon      ALTER COLUMN idBenhNhan INT NULL;
GO

-- 3. Tạo lại khóa ngoại với NO ACTION (KHÔNG dùng SET NULL nữa)
ALTER TABLE YeuCauTuVan ADD CONSTRAINT FK_YC_BN FOREIGN KEY (idBenhNhan) REFERENCES TaiKhoan(id);
ALTER TABLE YeuCauTuVan ADD CONSTRAINT FK_YC_BS FOREIGN KEY (idBacSi)    REFERENCES TaiKhoan(id);
ALTER TABLE LichKham    ADD CONSTRAINT FK_LK_BN FOREIGN KEY (idBenhNhan) REFERENCES TaiKhoan(id);
ALTER TABLE LichKham    ADD CONSTRAINT FK_LK_BS FOREIGN KEY (idBacSi)    REFERENCES TaiKhoan(id);
ALTER TABLE BenhAn      ADD CONSTRAINT FK_BA_BN FOREIGN KEY (idBenhNhan) REFERENCES TaiKhoan(id);
ALTER TABLE BenhAn      ADD CONSTRAINT FK_BA_BS FOREIGN KEY (idBacSi)    REFERENCES TaiKhoan(id);
ALTER TABLE HoaDon      ADD CONSTRAINT FK_HD_BN FOREIGN KEY (idBenhNhan) REFERENCES TaiKhoan(id);
GO

PRINT N'✅ Đã sửa xong khóa ngoại!';
GO

USE MediCareHome; --###
GO

-- ========== PHẦN A: XEM BẢNG NÀO ĐANG CHẶN ==========
SELECT 
    OBJECT_NAME(fk.parent_object_id) AS BangCon,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS CotCon,
    fk.name AS TenKhoaNgoai,
    c.is_nullable AS ChoPhepNULL
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id 
                   AND c.column_id = fkc.parent_column_id
WHERE OBJECT_NAME(fk.referenced_object_id) = 'TaiKhoan';
GO

-- ========== PHẦN B: XÓA SẠCH TOÀN BỘ FK TỚI TaiKhoan ==========
DECLARE @sql NVARCHAR(MAX) = '';
SELECT @sql += 'ALTER TABLE ' + QUOTENAME(OBJECT_NAME(f.parent_object_id)) 
             + ' DROP CONSTRAINT ' + QUOTENAME(f.name) + ';' + CHAR(13)
FROM sys.foreign_keys f
WHERE OBJECT_NAME(f.referenced_object_id) = 'TaiKhoan';
EXEC sp_executesql @sql;
PRINT N'✅ Đã xóa sạch FK tới TaiKhoan';
GO

-- ========== PHẦN C: CHO PHÉP NULL TỰ ĐỘNG (mọi cột FK) ==========
-- Bảng LichKham
IF COL_LENGTH('LichKham','idBenhNhan') IS NOT NULL ALTER TABLE LichKham ALTER COLUMN idBenhNhan INT NULL;
IF COL_LENGTH('LichKham','idBacSi') IS NOT NULL ALTER TABLE LichKham ALTER COLUMN idBacSi INT NULL;
IF COL_LENGTH('LichKham','nguoiXacNhan') IS NOT NULL ALTER TABLE LichKham ALTER COLUMN nguoiXacNhan INT NULL;
IF COL_LENGTH('LichKham','idYeuCauTuVan') IS NOT NULL ALTER TABLE LichKham ALTER COLUMN idYeuCauTuVan INT NULL;

-- Bảng YeuCauTuVan
IF COL_LENGTH('YeuCauTuVan','idBenhNhan') IS NOT NULL ALTER TABLE YeuCauTuVan ALTER COLUMN idBenhNhan INT NULL;
IF COL_LENGTH('YeuCauTuVan','idBacSi') IS NOT NULL ALTER TABLE YeuCauTuVan ALTER COLUMN idBacSi INT NULL;
IF COL_LENGTH('YeuCauTuVan','idTuVanVien') IS NOT NULL ALTER TABLE YeuCauTuVan ALTER COLUMN idTuVanVien INT NULL;

-- Bảng BenhAn
IF COL_LENGTH('BenhAn','idBenhNhan') IS NOT NULL ALTER TABLE BenhAn ALTER COLUMN idBenhNhan INT NULL;
IF COL_LENGTH('BenhAn','idBacSi') IS NOT NULL ALTER TABLE BenhAn ALTER COLUMN idBacSi INT NULL;

-- Bảng HoaDon
IF COL_LENGTH('HoaDon','idBenhNhan') IS NOT NULL ALTER TABLE HoaDon ALTER COLUMN idBenhNhan INT NULL;
IF COL_LENGTH('HoaDon','nguoiTao') IS NOT NULL ALTER TABLE HoaDon ALTER COLUMN nguoiTao INT NULL;

-- Bảng CauHinhHeThong
IF COL_LENGTH('CauHinhHeThong','nguoiCapNhat') IS NOT NULL ALTER TABLE CauHinhHeThong ALTER COLUMN nguoiCapNhat INT NULL;
GO

PRINT N'✅ Đã cho phép NULL. SystemLog GIỮ NGUYÊN idUser để truy vết (không tạo FK).';
GO