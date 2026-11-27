import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T13:00:00+07:00',
  kind: 'new',
  title: 'Ứng dụng một chạm do Admin tạo',
  details: ['Admin giờ biến một kết quả đẹp thành ứng dụng một chạm; ứng dụng mới hiện ở trang Ứng dụng, bạn chỉ cần tải ảnh lên và bấm Chạy.'],
  href: '/apps',
  prs: [], // TODO(pr): the PR number, filled in when the PR is opened
  audience: 'all',
} satisfies ChangeEntry;
