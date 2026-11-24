import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T12:00:00+07:00',
  kind: 'new',
  title: 'Tạo tư thế cho cả danh mục người mẫu',
  details: [
    'Ô Người mẫu của Tạo tư thế người mẫu nhận tối đa 6 ảnh: thêm ảnh thứ hai là cả danh mục được tạo cùng lúc, không cần bật gì thêm.',
    'Ảnh nào cũng được tạo đủ các tư thế đã chọn, lần lượt từng ảnh. Mỗi ảnh và mỗi tư thế là một ảnh riêng, tối đa 24 ảnh mỗi lần chạy; tổng tiền hiện trước khi bấm Chạy.',
  ],
  href: '/apps/pose-generator',
  prs: [639],
  audience: 'all',
} satisfies ChangeEntry;
