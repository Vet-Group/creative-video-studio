import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T17:00:00+07:00',
  kind: 'new',
  title: 'Kết nối AI: cho Claude Code, OpenMausBot dùng CVS bằng khoá truy cập',
  details: [
    'Admin vào Cài đặt > Kết nối AI để tạo khoá truy cập cho Claude Code, OpenMausBot hay một script. Khoá chỉ hiện một lần, có hạn dùng 7, 30 hoặc 90 ngày và hạn mức chi riêng mỗi tháng (mặc định $20).',
    'Việc tốn tiền và phần lớn thay đổi phải qua một bước xác nhận: lần gọi đầu chỉ báo giá, gọi lại kèm mã xác nhận mới chạy thật. Khoá không đổi được mật khẩu, người dùng hay tạo khoá khác.',
    'Mỗi khoá có danh sách lần dùng cuối, số tiền đã chi trong tháng và nút thu hồi. Kết nối qua MCP sẽ có ở bản cập nhật tới.',
  ],
  prs: [712],
  audience: 'admin',
} satisfies ChangeEntry;
