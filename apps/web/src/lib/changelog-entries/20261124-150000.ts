import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T15:00:00+07:00',
  kind: 'new',
  title: 'Chọn nhanh tư thế theo loại trang phục',
  details: [
    'Trong Tạo tư thế người mẫu, hàng nút "Chọn nhanh theo trang phục" (Váy/Đầm, Áo, Quần, Áo khoác) chọn ngay 4 tư thế hợp loại trang phục đó.',
    'Nền vẫn giữ như bạn đang chọn; bấm lại nút để bỏ các tư thế đã chọn.',
  ],
  href: '/apps/pose-generator',
  prs: [641],
  audience: 'all',
} satisfies ChangeEntry;
