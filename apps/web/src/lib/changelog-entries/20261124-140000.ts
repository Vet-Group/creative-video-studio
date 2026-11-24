import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T14:00:00+07:00',
  kind: 'improved',
  title: 'Tab Ví dụ cho Đổi màu sản phẩm và Bộ ảnh listing',
  details: [
    'Hai ứng dụng mới có thêm tab Ví dụ, với kết quả thật do công ty tạo sẵn: một ảnh sản phẩm được đổi sang nhiều màu, và một bộ cảnh listing có cả cảnh theo mùa.',
    'Bấm Dùng ví dụ này để lấy lại ảnh, màu hoặc cảnh của ví dụ rồi thay bằng sản phẩm của bạn.',
  ],
  href: '/apps/product-recolor',
  prs: [640],
  audience: 'all',
} satisfies ChangeEntry;
