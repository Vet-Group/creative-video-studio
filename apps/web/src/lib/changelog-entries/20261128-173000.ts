import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T17:30:00+07:00',
  kind: 'new',
  title: 'Kết nối AI: đăng nhập Claude Code, OpenMausBot không cần dán khoá',
  details: [
    'Claude Code (gõ /mcp, chọn cvs, Authenticate) và OpenMausBot giờ mở trang CVS để Admin bấm Cho phép, không phải chép khoá truy cập. Trang cho thấy tên app và máy nhận quyền, và cảnh báo khi app được đăng ký từ máy khác.',
    'Mỗi lần đăng nhập là một kết nối có hạn mức chi riêng như khoá truy cập. Kết nối còn hiệu lực khi app vẫn dùng thường xuyên; xem và ngắt kết nối ở Cài đặt > Kết nối AI.',
  ],
  prs: [722],
  audience: 'admin',
} satisfies ChangeEntry;
