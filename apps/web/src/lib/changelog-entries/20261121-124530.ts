import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-21T12:45:30+07:00',
  kind: 'new',
  title: 'Tổng quan: ai trong các team bán hàng đang dùng CVS',
  details: [
    'Trang Quản trị › Tổng quan có thêm bảng "Người bán dùng CVS": từng thành viên của các team bán hàng, kèm lần gần nhất họ tạo job hoặc phân tích video, hoặc "Chưa thấy đăng nhập" nếu chưa thấy họ vào lần nào.',
    'Dòng đầu bảng đếm số người đã dùng trong 14 ngày qua và số người chưa thấy đăng nhập lần nào. Lượt Admin xem dưới tên một thành viên không tính là thành viên đó đăng nhập.',
  ],
  prs: [612],
  audience: 'admin',
} satisfies ChangeEntry;
