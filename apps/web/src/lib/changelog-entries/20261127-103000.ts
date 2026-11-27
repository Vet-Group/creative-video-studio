import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T10:30:00+07:00',
  kind: 'new',
  title: 'Marketing Studio làm cùng lúc nhiều tỉ lệ',
  details: [
    'Dưới ô Tỉ lệ có thêm hàng "Thêm tỉ lệ": chọn thêm tối đa 2 tỉ lệ mà mô hình làm được, mỗi hook ra thêm một clip ở mỗi tỉ lệ.',
    'Một lượt tối đa 6 clip (ví dụ 3 hook × 2 tỉ lệ). Giá và số clip trong ngày hiện đủ cho mọi clip trước khi bấm Tạo.',
  ],
  href: '/marketing-studio',
  prs: [689],
  audience: 'all',
} satisfies ChangeEntry;
