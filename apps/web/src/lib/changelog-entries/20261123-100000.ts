import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-23T10:00:00+07:00',
  kind: 'new',
  title: 'Tạo tư thế người mẫu: chọn nền và chọn nhanh theo sàn',
  details: [
    'Ở Tạo tư thế người mẫu có mục Nền: giữ nền gốc của ảnh, đổi sang nền studio trắng, hoặc đặt người mẫu vào một cảnh lifestyle chung cho mọi tư thế của lần chạy, để cả bộ ảnh cùng một nền.',
    'Ba nút Amazon, Etsy và Shopify chọn nhanh 4 tư thế và nền hợp quy định ảnh của từng sàn. Giá không đổi: vẫn tính theo số ảnh.',
  ],
  href: '/apps/pose-generator',
  prs: [626],
  audience: 'all',
} satisfies ChangeEntry;
