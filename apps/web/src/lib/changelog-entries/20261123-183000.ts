import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-23T18:30:00+07:00',
  kind: 'improved',
  title: 'Trang ứng dụng không còn bị giật khi mở',
  details: [
    'Khi mở một ứng dụng, khung ảnh minh hoạ được giữ chỗ ngay từ đầu, nên phần giới thiệu bên dưới không còn bị đẩy xuống khi ảnh tải xong.',
  ],
  href: '/apps',
  prs: [0],
  audience: 'all',
} satisfies ChangeEntry;
