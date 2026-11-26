import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T22:00:00+07:00',
  kind: 'ops',
  title: 'Thêm bốn mô hình rẻ hơn: Veo 3.1 Lite, Veo 3.1 Fast, H3 Max Turbo và Seedream 5.5 (đang tắt)',
  details: [
    'Tạo video: Veo 3.1 Lite và Fast (clip 4, 6 hoặc 8 giây, từ khoảng 0,03 USD một giây) cùng MiniMax H3 Max Turbo ở 480p, 768p và 1080p, rẻ hơn H3 Max. Tạo ảnh: Seedream 5.5, từ khoảng 0,042 USD một ảnh ở 1K, cộng 0,012 USD cho mỗi ảnh đầu vào thêm.',
    'Các mô hình đang tắt: bật trong Quản trị, Cài đặt, Mô hình sau khi chạy thử.',
  ],
  href: '/admin',
  prs: [670],
  audience: 'admin',
} satisfies ChangeEntry;
