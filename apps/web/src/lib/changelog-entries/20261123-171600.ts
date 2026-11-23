import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-23T17:16:00+07:00',
  kind: 'improved',
  title: 'Bộ tư thế Etsy và Shopify đổi sang dáng Sải bước',
  details: [
    'Trong Tạo tư thế người mẫu, nút Etsy và Shopify giờ chọn dáng "Sải bước" (đi thẳng về phía máy ảnh) thay cho "Bước ngang". Bộ Amazon giữ nguyên.',
    'Trên điện thoại, các nút và link trên thanh chọn ảnh trong Lịch sử ("Chọn", "Tải xuống .zip", "Ghép lookbook", "Tải PDF", "Tạo video từ 2 ảnh") cao hơn để bấm dễ hơn.',
  ],
  href: '/apps/pose-generator',
  prs: [627],
  audience: 'all',
} satisfies ChangeEntry;
