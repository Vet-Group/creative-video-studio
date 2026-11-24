import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T20:25:00+07:00',
  kind: 'new',
  title: 'Video xoay 360° từ một ảnh sản phẩm hoặc người mẫu',
  details: [
    'Trong Ảnh nhiều góc, bấm "Vòng xoay 360°" để chọn 7 góc ngang (thêm hai góc sau chéo). Khi cả 7 ảnh xong, app tự ghép ảnh gốc và 7 góc thành một video MP4 xoay vòng, miễn phí, ngay dưới các ảnh trong tab Lịch sử.',
    'Dùng được cho cả ảnh sản phẩm lẫn ảnh người mẫu. Nếu có góc bị lỗi, app nói rõ góc nào cần chạy lại.',
  ],
  href: '/apps/multi-angle',
  prs: [644],
  audience: 'all',
} satisfies ChangeEntry;
