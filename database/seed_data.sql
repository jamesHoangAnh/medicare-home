USE MediCareHome;
GO

-- ============================================================
-- DỮ LIỆU MẪU (Mật khẩu mặc định: 123456)
-- Hash bcrypt của "123456": 
-- $2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z
-- (Trong thực tế, backend sẽ hash khi tạo user)
-- ============================================================

-- Admin
INSERT INTO TaiKhoan (hoTen, soDienThoai, email, matKhauHash, vaiTro, trangThai)
VALUES (N'Admin Hệ thống', '0901111000', 'admin@medicare.vn', 
        '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
        'Admin', 'HoatDong');

-- Tư vấn viên
INSERT INTO TaiKhoan (hoTen, soDienThoai, email, matKhauHash, vaiTro, trangThaiTrucTuyen)
VALUES (N'Trần Thị Bình', '0901111002', 'binh@medicare.vn',
        '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
        'TuVanVien', 'Online');

-- Bác sĩ
INSERT INTO TaiKhoan (hoTen, soDienThoai, email, matKhauHash, vaiTro, 
                      chuyenKhoa, kinhNghiem, phiTuVan, trangThaiTrucTuyen)
VALUES 
(N'BS. Lê Minh Châu', '0901111003', 'chau@medicare.vn',
 '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
 'BacSi', N'Nội tổng quát', 10, 200000, 'Online'),
(N'BS. Phạm Văn Dũng', '0901111004', 'dung@medicare.vn',
 '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
 'BacSi', N'Nhi khoa', 8, 250000, 'Online'),
(N'BS. Nguyễn Thị Phương', '0901111007', 'phuong@medicare.vn',
 '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
 'BacSi', N'Tim mạch', 15, 300000, 'Offline');

-- Bệnh nhân
INSERT INTO TaiKhoan (hoTen, soDienThoai, email, matKhauHash, vaiTro, 
                      ngaySinh, gioiTinh, diaChi)
VALUES 
(N'Nguyễn Văn An', '0901111001', 'an@gmail.com',
 '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
 'BenhNhan', '1990-05-15', N'Nam', N'123 Đường Láng, Đống Đa, Hà Nội'),
(N'Nguyễn Thị E', '0901111005', 'e@gmail.com',
 '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
 'BenhNhan', '1985-08-20', N'Nữ', N'456 Cầu Giấy, Hà Nội'),
(N'Lê Văn F', '0901111008', 'f@gmail.com',
 '$2a$10$XQ5t6r1wK3RqZp8vLmN0xOeYgHjK1lM2nO3pQ4rS5tU6vW7xY8z',
 'BenhNhan', '1978-03-10', N'Nam', N'789 Ba Đình, Hà Nội');
GO

-- Cấu hình hệ thống
INSERT INTO CauHinhHeThong (khoa, giaTri, loaiGiaTri, moTa, nhom) VALUES
('phi_tu_van_mac_dinh', '200000', 'number', N'Phí tư vấn mặc định (VNĐ)', 'payment'),
('phi_kham_nha', '300000', 'number', N'Phí khám tại nhà (VNĐ)', 'payment'),
('thoi_gian_qr_het_han', '120', 'number', N'Thời hạn mã QR (giây)', 'payment'),
('bat_xac_thuc_2fa', 'true', 'boolean', N'Bật xác thực 2 lớp cho bác sĩ', 'security'),
('so_lich_kham_toi_da_ngay', '20', 'number', N'Số lịch khám tối đa/BS/ngày', 'appointment'),
('thoi_gian_tu_van_toi_da', '30', 'number', N'Thời gian tư vấn tối đa (phút)', 'consultation'),
('ten_he_thong', N'MediCare Home', 'string', N'Tên hệ thống', 'general'),
('so_dien_thoai_hotline', '19001234', 'string', N'Hotline hỗ trợ', 'general');
GO

PRINT N'✅ Dữ liệu mẫu đã được thêm vào!';
PRINT N'🔑 Tài khoản demo (mật khẩu: 123456):';
PRINT N'   - Admin: 0901111000';
PRINT N'   - TVV: 0901111002';
PRINT N'   - BS: 0901111003, 0901111004';
PRINT N'   - BN: 0901111001, 0901111005';
GO