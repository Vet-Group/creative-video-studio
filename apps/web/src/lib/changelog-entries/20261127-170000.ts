import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T17:00:00+07:00',
  kind: 'new',
  title: 'Xem ứng dụng và mẫu nào đang được dùng nhiều',
  details: [
    'Thẻ ứng dụng và mẫu chuyển động hiện số lượt dùng trong 7 ngày qua của công ty bạn, từ 3 lượt trở lên.',
    'Trang Khám phá có nút sắp xếp "Đang được dùng nhiều" cho công cụ và mẫu chuyển động.',
  ],
  href: '/apps',
  prs: [0], // placeholder: the coordinator sets the PR number (the changelog test needs one)
  audience: 'all',
} satisfies ChangeEntry;
