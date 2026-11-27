import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T17:30:00+07:00',
  kind: 'improved',
  title: 'Sửa video hay Smart Remake: mỗi form chỉ sang form kia',
  details: [
    'Form Sửa video có dòng chỉ sang Smart Remake khi bạn muốn đặt đúng sản phẩm của mình, kể cả hình in, vào video.',
    'Form Smart Remake có dòng chỉ sang Sửa video khi bạn chỉ cần đổi màu áo hoặc nền: rẻ hơn và giữ âm thanh gốc.',
    'Ảnh minh hoạ của Smart Remake giờ là một áo in hình được thay bằng một áo in hình khác, thay cho cảnh đổi màu áo dễ nhầm với Sửa video.',
  ],
  href: '/apps/smart-remake',
  prs: [704],
  audience: 'all',
} satisfies ChangeEntry;
