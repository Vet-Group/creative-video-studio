import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T19:50:00+07:00',
  kind: 'improved',
  title: 'Kết nối AI: làm theo 3 bước, kiểm tra kết nối, xem AI đã làm gì',
  details: [
    'Mục Kết nối AI trong Cài đặt giờ dẫn qua 3 bước: chọn công cụ (Claude Code, OpenMausBot hay script), kết nối (đăng nhập hoặc khoá truy cập, kèm lệnh dán sẵn) và kiểm tra. Bước cuối tự báo khi AI gọi lần đầu.',
    'Mỗi khoá và kết nối có nút Kiểm tra kết nối (còn dùng được không, lần dùng cuối) và mục Hoạt động gần đây: những việc AI đã làm, những yêu cầu bị chặn, theo thời gian.',
  ],
  prs: [729],
  audience: 'admin',
} satisfies ChangeEntry;
