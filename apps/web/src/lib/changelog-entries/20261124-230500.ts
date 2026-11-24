import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T23:05:00+07:00',
  kind: 'fixed',
  title: 'Thử đồ lót giữ đúng tỉ lệ người mẫu',
  details: [
    'Ảnh người mẫu chỉ chụp tới ngực không còn cho ra người đầu to, thân ngắn: AI lùi khung để thấy người tới giữa đùi.',
    'Người mẫu có sẵn đổi sang ảnh chụp từ đầu tới đùi, và ô Người mẫu gợi ý dùng ảnh từ đầu tới đùi hoặc toàn thân.',
  ],
  href: '/apps/lingerie-try-on',
  prs: [645],
  audience: 'all',
} satisfies ChangeEntry;
