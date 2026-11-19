-- ============================================================
-- HỆ THỐNG TƯ VẤN Y TẾ & ĐẶT LỊCH KHÁM TẠI NHÀ
-- Script tạo Database MediCareHome
-- SQL Server 2019+
-- ============================================================

-- Kiểm tra và xóa DB cũ nếu tồn tại
IF DB_ID('MediCareHome') IS NOT NULL
BEGIN
    ALTER DATABASE MediCareHome SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE MediCareHome;
END
GO

-- Tạo Database mới
CREATE DATABASE MediCareHome;
GO

USE MediCareHome;
GO

-- ============================================================
-- BẢNG 1: TaiKhoan (Account) - Bảng cha
-- Lưu trữ thông tin định danh chung cho tất cả người dùng
-- ============================================================
CREATE TABLE TaiKhoan (
    id INT IDENTITY(1,1) PRIMARY KEY,
    hoTen NVARCHAR(100) NOT NULL,
    soDienThoai VARCHAR(15) UNIQUE NOT NULL,
    email NVARCHAR(100),
    matKhauHash VARCHAR(255) NOT NULL,  -- bcrypt hash
    ngaySinh DATE,
    gioiTinh NVARCHAR(10) CHECK (gioiTinh IN ('Nam', 'Nu', 'Khac')),
    diaChi NVARCHAR(255),
    anhDaiDien NVARCHAR(500),
    vaiTro VARCHAR(20) NOT NULL 
        CHECK (vaiTro IN ('BenhNhan', 'TuVanVien', 'BacSi', 'Admin')),
    
    -- Thông tin riêng cho Bác sĩ
    chuyenKhoa NVARCHAR(100),
    kinhNghiem INT CHECK (kinhNghiem >= 0),
    bangCap NVARCHAR(255),
    phiTuVan DECIMAL(12,2),
    trangThaiTrucTuyen VARCHAR(20) DEFAULT 'Offline' 
        CHECK (trangThaiTrucTuyen IN ('Online', 'Offline', 'Busy')),
    
    -- Trạng thái chung
    trangThai VARCHAR(20) DEFAULT 'HoatDong' 
        CHECK (trangThai IN ('HoatDong', 'DinhChi', 'ChoXacThuc')),
    lyDoDinhChi NVARCHAR(500),
    
    -- Audit fields
    ngayTao DATETIME DEFAULT GETDATE(),
    ngayCapNhat DATETIME DEFAULT GETDATE(),
    lanDangNhapGanNhat DATETIME,
    diaChiIP VARCHAR(50)
);
GO

-- ============================================================
-- BẢNG 2: YeuCauTuVan (Consultation Request)
-- Lưu yêu cầu tư vấn từ bệnh nhân
-- ============================================================
CREATE TABLE YeuCauTuVan (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idBenhNhan INT NOT NULL FOREIGN KEY REFERENCES TaiKhoan(id),
    hinhThuc VARCHAR(20) NOT NULL 
        CHECK (hinhThuc IN ('Chat', 'VideoCall')),
    trieuChung NVARCHAR(1000) NOT NULL,
    mucDoCapBach VARCHAR(20) DEFAULT 'BinhThuong'
        CHECK (mucDoCapBach IN ('Thap', 'BinhThuong', 'Cao', 'KhanCap')),
    
    -- Thông tin sàng lọc từ Tư vấn viên
    ghiChuSanLoc NVARCHAR(2000),
    idTuVanVien INT FOREIGN KEY REFERENCES TaiKhoan(id),
    thoiGianTiepNhan DATETIME,
    
    -- Thông tin điều phối
    idBacSi INT FOREIGN KEY REFERENCES TaiKhoan(id),
    chuyenKhoaYeuCau NVARCHAR(100),
    
    -- Trạng thái
    trangThai VARCHAR(20) DEFAULT 'ChoXuLy'
        CHECK (trangThai IN (
            'ChoXuLy',        -- Chờ TVV tiếp nhận
            'DangSanLoc',     -- TVV đang sàng lọc
            'DaDieuPhoi',     -- Đã kết nối BS
            'DangTuVan',      -- Đang tư vấn
            'HoanThanh',      -- Đã kết thúc
            'DaHuy'           -- Hủy
        )),
    
    thoiGianTao DATETIME DEFAULT GETDATE(),
    thoiGianCapNhat DATETIME DEFAULT GETDATE()
);
GO

-- ============================================================
-- BẢNG 3: LichKham (Appointment)
-- Lưu lịch khám tại nhà
-- ============================================================
CREATE TABLE LichKham (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idBenhNhan INT NOT NULL FOREIGN KEY REFERENCES TaiKhoan(id),
    idBacSi INT NOT NULL FOREIGN KEY REFERENCES TaiKhoan(id),
    idYeuCauTuVan INT FOREIGN KEY REFERENCES YeuCauTuVan(id),
    
    thoiGian DATETIME NOT NULL,
    thoiGianKetThuc DATETIME,
    diaChi NVARCHAR(255) NOT NULL,
    toaDoX DECIMAL(10,6),  -- GPS coordinates
    toaDoY DECIMAL(10,6),
    ghiChu NVARCHAR(1000),
    lyDoKham NVARCHAR(500),
    
    -- Trạng thái
    trangThai VARCHAR(20) DEFAULT 'ChoXacNhan'
        CHECK (trangThai IN (
            'ChoXacNhan',    -- Chờ BS xác nhận
            'DaXacNhan',     -- BS đã xác nhận
            'DangKham',      -- Đang khám
            'HoanThanh',     -- Đã khám xong
            'DaHuy',         -- Bệnh nhân hủy
            'BSTuChoi'       -- BS từ chối
        )),
    
    -- Audit
    nguoiXacNhan INT FOREIGN KEY REFERENCES TaiKhoan(id),
    thoiGianXacNhan DATETIME,
    lyDoHuy NVARCHAR(500),
    ngayTao DATETIME DEFAULT GETDATE(),
    ngayCapNhat DATETIME DEFAULT GETDATE()
);
GO

-- ============================================================
-- BẢNG 4: BenhAn (Medical Record / EMR)
-- Hồ sơ bệnh án điện tử
-- ============================================================
CREATE TABLE BenhAn (
    id INT IDENTITY(1,1) PRIMARY KEY,
    maBenhAn VARCHAR(20) UNIQUE NOT NULL,  -- VD: BA20261117001
    idBenhNhan INT NOT NULL FOREIGN KEY REFERENCES TaiKhoan(id),
    idBacSi INT NOT NULL FOREIGN KEY REFERENCES TaiKhoan(id),
    idLichKham INT FOREIGN KEY REFERENCES LichKham(id),
    
    -- Thông tin khám bệnh
    trieuChung NVARCHAR(2000) NOT NULL,
    tienSuBenh NVARCHAR(1000),
    mach INT,
    nhietDo DECIMAL(4,1),
    huyetAp VARCHAR(20),
    canNang DECIMAL(5,2),
    chieuCao DECIMAL(5,2),
    
    -- Chẩn đoán
    chanDoan NVARCHAR(2000) NOT NULL,
    maICD10 VARCHAR(20),  -- Mã bệnh theo ICD-10
    mucDoNghiemTrong VARCHAR(20) 
        CHECK (mucDoNghiemTrong IN ('Nhe', 'TrungBinh', 'Nang', 'NguyKich')),
    
    -- Điều trị
    huongDieuTri NVARCHAR(2000),
    donThuoc NVARCHAR(3000),
    chiDanChamSoc NVARCHAR(2000),
    ngayTaiKham DATE,
    
    -- File đính kèm (kết quả xét nghiệm, ảnh...)
    fileDinhKem NVARCHAR(1000),
    
    -- Trạng thái
    trangThai VARCHAR(20) DEFAULT 'HoatDong'
        CHECK (trangThai IN ('HoatDong', 'DaHuy', 'LuuTam')),
    
    ngayTao DATETIME DEFAULT GETDATE(),
    ngayCapNhat DATETIME DEFAULT GETDATE()
);
GO

-- ============================================================
-- BẢNG 5: HoaDon (Invoice)
-- Quản lý chứng từ thanh toán
-- ============================================================
CREATE TABLE HoaDon (
    id INT IDENTITY(1,1) PRIMARY KEY,
    maHoaDon VARCHAR(20) UNIQUE NOT NULL,  -- VD: HD20261117001
    idLichKham INT FOREIGN KEY REFERENCES LichKham(id),
    idYeuCauTuVan INT FOREIGN KEY REFERENCES YeuCauTuVan(id),
    idBenhNhan INT NOT NULL FOREIGN KEY REFERENCES TaiKhoan(id),
    
    -- Chi tiết phí
    phiTuVan DECIMAL(12,2) DEFAULT 0,
    phiKhamTaiNha DECIMAL(12,2) DEFAULT 0,
    phiThuoc DECIMAL(12,2) DEFAULT 0,
    phiDichVuKhac DECIMAL(12,2) DEFAULT 0,
    giamGia DECIMAL(12,2) DEFAULT 0,
    tongTien DECIMAL(12,2) NOT NULL,
    
    -- Thông tin thanh toán
    phuongThuc VARCHAR(20) DEFAULT 'VietQR'
        CHECK (phuongThuc IN ('VietQR', 'TienMat', 'The')),
    nganHang VARCHAR(50),
    maGiaoDich VARCHAR(100),
    
    -- Trạng thái
    trangThai VARCHAR(20) DEFAULT 'ChoThanhToan'
        CHECK (trangThai IN (
            'ChoThanhToan',   -- Chờ BN thanh toán
            'DaThanhToan',    -- Đã thanh toán
            'DaHuy',          -- Đã hủy
            'HoanTien'        -- Đã hoàn tiền
        )),
    
    -- QR Code info
    qrCodeUrl NVARCHAR(500),
    qrCodeExpiredAt DATETIME,
    
    -- Audit
    ngayTao DATETIME DEFAULT GETDATE(),
    ngayThanhToan DATETIME,
    nguoiTao INT FOREIGN KEY REFERENCES TaiKhoan(id)
);
GO

-- ============================================================
-- BẢNG 6: SystemLog (Nhật ký hệ thống)
-- Audit trail cho bảo mật
-- ============================================================
CREATE TABLE SystemLog (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    idUser INT FOREIGN KEY REFERENCES TaiKhoan(id),
    tenDangNhap NVARCHAR(100),
    hanhDong VARCHAR(50) NOT NULL,
    doiTuong VARCHAR(50),  -- VD: TaiKhoan, LichKham, BenhAn
    idDoiTuong INT,
    chiTiet NVARCHAR(1000),
    trangThaiCu NVARCHAR(100),
    trangThaiMoi NVARCHAR(100),
    
    ipAddress VARCHAR(50),
    userAgent NVARCHAR(500),
    thoiGian DATETIME DEFAULT GETDATE()
);
GO

-- ============================================================
-- BẢNG 7: CauHinhHeThong (System Configuration)
-- Tham số vận hành
-- ============================================================
CREATE TABLE CauHinhHeThong (
    id INT IDENTITY(1,1) PRIMARY KEY,
    khoa NVARCHAR(100) UNIQUE NOT NULL,
    giaTri NVARCHAR(1000) NOT NULL,
    loaiGiaTri VARCHAR(20) DEFAULT 'string'
        CHECK (loaiGiaTri IN ('string', 'number', 'boolean', 'json')),
    moTa NVARCHAR(500),
    nhom NVARCHAR(50),  -- VD: 'payment', 'consultation', 'security'
    coTheChinhSua BIT DEFAULT 1,
    ngayCapNhat DATETIME DEFAULT GETDATE(),
    nguoiCapNhat INT FOREIGN KEY REFERENCES TaiKhoan(id)
);
GO

-- ============================================================
-- BẢNG 8: ThongBao (Notifications)
-- Thông báo in-app
-- ============================================================
CREATE TABLE ThongBao (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idNguoiNhan INT NOT NULL FOREIGN KEY REFERENCES TaiKhoan(id),
    tieuDe NVARCHAR(200) NOT NULL,
    noiDung NVARCHAR(1000) NOT NULL,
    loai VARCHAR(30) NOT NULL
        CHECK (loai IN (
            'LichKham', 'HoaDon', 'TuVan', 
            'HeThong', 'TaiKhoan', 'BenhAn'
        )),
    duongDan NVARCHAR(500),
    daDoc BIT DEFAULT 0,
    thoiGianTao DATETIME DEFAULT GETDATE()
);
GO

-- ============================================================
-- INDEXES - Tối ưu truy vấn
-- ============================================================
CREATE INDEX IX_TaiKhoan_VaiTro ON TaiKhoan(vaiTro);
CREATE INDEX IX_TaiKhoan_SDT ON TaiKhoan(soDienThoai);
CREATE INDEX IX_TaiKhoan_TrangThai ON TaiKhoan(trangThai);
CREATE INDEX IX_TaiKhoan_ChuyenKhoa ON TaiKhoan(chuyenKhoa) WHERE chuyenKhoa IS NOT NULL;

CREATE INDEX IX_YeuCauTuVan_BenhNhan ON YeuCauTuVan(idBenhNhan);
CREATE INDEX IX_YeuCauTuVan_BacSi ON YeuCauTuVan(idBacSi);
CREATE INDEX IX_YeuCauTuVan_TrangThai ON YeuCauTuVan(trangThai);

CREATE INDEX IX_LichKham_BenhNhan ON LichKham(idBenhNhan);
CREATE INDEX IX_LichKham_BacSi ON LichKham(idBacSi);
CREATE INDEX IX_LichKham_ThoiGian ON LichKham(thoiGian);
CREATE INDEX IX_LichKham_TrangThai ON LichKham(trangThai);

CREATE INDEX IX_BenhAn_BenhNhan ON BenhAn(idBenhNhan);
CREATE INDEX IX_BenhAn_BacSi ON BenhAn(idBacSi);
CREATE INDEX IX_BenhAn_NgayTao ON BenhAn(ngayTao);

CREATE INDEX IX_HoaDon_BenhNhan ON HoaDon(idBenhNhan);
CREATE INDEX IX_HoaDon_TrangThai ON HoaDon(trangThai);
CREATE INDEX IX_HoaDon_NgayTao ON HoaDon(ngayTao);

CREATE INDEX IX_SystemLog_User ON SystemLog(idUser);
CREATE INDEX IX_SystemLog_ThoiGian ON SystemLog(thoiGian);
CREATE INDEX IX_SystemLog_HanhDong ON SystemLog(hanhDong);

CREATE INDEX IX_ThongBao_NguoiNhan ON ThongBao(idNguoiNhan, daDoc);
GO

-- ============================================================
-- VIEW - Truy vấn tổng hợp
-- ============================================================
CREATE VIEW VW_ThongKeDoanhThu AS
SELECT 
    YEAR(hd.ngayThanhToan) AS nam,
    MONTH(hd.ngayThanhToan) AS thang,
    COUNT(*) AS soHoaDon,
    SUM(hd.tongTien) AS tongDoanhThu,
    SUM(hd.phiTuVan) AS tongPhiTuVan,
    SUM(hd.phiKhamTaiNha) AS tongPhiKham,
    SUM(hd.phiThuoc) AS tongPhiThuoc
FROM HoaDon hd
WHERE hd.trangThai = 'DaThanhToan'
GROUP BY YEAR(hd.ngayThanhToan), MONTH(hd.ngayThanhToan);
GO

CREATE VIEW VW_LichKhamChiTiet AS
SELECT 
    lk.id,
    lk.thoiGian,
    lk.diaChi,
    lk.trangThai,
    bn.hoTen AS tenBenhNhan,
    bn.soDienThoai AS sdtBenhNhan,
    bs.hoTen AS tenBacSi,
    bs.chuyenKhoa,
    lk.ghiChu
FROM LichKham lk
JOIN TaiKhoan bn ON lk.idBenhNhan = bn.id
JOIN TaiKhoan bs ON lk.idBacSi = bs.id;
GO

PRINT N'✅ Tạo database MediCareHome thành công!';
PRINT N'📊 Tổng số bảng: 8';
PRINT N'🔑 Indexes đã được tạo để tối ưu truy vấn';
GO