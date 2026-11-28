import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T19:05:00+07:00',
  kind: 'improved',
  title: 'Kết nối AI: bỏ hạn mức riêng của khoá, thêm khoá không hết hạn',
  details: [
    'Khoá truy cập và kết nối đăng nhập không còn hạn mức chi riêng mỗi tháng: việc tốn tiền của AI tính vào hạn mức của team và công ty như khi dùng trên web. Danh sách khoá vẫn hiện số đã chi trong tháng.',
    'Khi tạo khoá có thêm lựa chọn Không hết hạn bên cạnh 7, 30 và 90 ngày. Khoá như vậy dùng được tới khi bị thu hồi, hoặc khi chủ khoá đổi mật khẩu hay không còn là Admin.',
  ],
  prs: [724],
  audience: 'admin',
} satisfies ChangeEntry;
