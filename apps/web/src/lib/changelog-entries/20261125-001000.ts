import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-25T00:10:00+07:00',
  kind: 'improved',
  title: 'Thử đồ giữ đúng tỉ lệ người mẫu khi ảnh chụp sát',
  details: [
    'Khi ảnh người mẫu chụp sát hơn món đồ cần thấy, ví dụ ảnh tới ngực mà thử quần hay váy dài, AI lùi khung để thấy thêm người thay vì phóng to đầu hay rút ngắn thân.',
    'Khi bạn chọn tư thế, khung ảnh vẫn theo tư thế đó như trước.',
  ],
  href: '/try-on',
  prs: [646],
  audience: 'all',
} satisfies ChangeEntry;
