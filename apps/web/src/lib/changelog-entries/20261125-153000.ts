import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-25T15:30:00+07:00',
  kind: 'new',
  title: 'Quản trị: trang Mức độ sử dụng',
  details: [
    'Trang mới Quản trị › Mức độ sử dụng cho biết trong khoảng thời gian đã chọn, mỗi team có bao nhiêu người, ai có dùng CVS, ai đã ngưng, ai đã vào nhưng chưa tạo gì và ai chưa đăng nhập, kèm chi phí trong khoảng và từ trước tới nay.',
    'Mặc định chỉ tính người dùng thật; tắt "Chỉ người dùng thật" để xem cả tài khoản hệ thống, tài khoản thử và team không tính báo cáo. Nút Tải CSV và Tải ảnh PNG giúp gửi số liệu đi báo cáo.',
  ],
  href: '/admin/usage',
  prs: [649],
  audience: 'admin',
} satisfies ChangeEntry;
