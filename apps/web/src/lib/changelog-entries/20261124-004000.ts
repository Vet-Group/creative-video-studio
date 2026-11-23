import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T00:40:00+07:00',
  kind: 'improved',
  title: 'Giữ Shift để chọn cả một dải trong Thư viện và Lịch sử',
  details: [
    'Khi đang chọn nhiều mục, bấm một ô rồi giữ Shift và bấm ô khác: mọi mục ở giữa cũng được chọn (hoặc bỏ chọn) theo, tiện khi tải .zip, ghép lookbook hay đánh dấu hàng loạt.',
  ],
  href: '/library',
  prs: [0],
  audience: 'all',
} satisfies ChangeEntry;
