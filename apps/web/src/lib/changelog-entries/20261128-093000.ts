import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T09:30:00+07:00',
  kind: 'improved',
  title: 'Thời gian chờ phân tích video theo độ dài clip',
  details: [
    'Khi phân tích video tham chiếu (trang Phân tích và Smart Remake), clip từ 20 giây trở xuống vẫn ghi khoảng 2–4 phút; clip dài hơn giờ ghi khoảng 5–8 phút, và thanh chờ chạy theo đúng mức đó.',
  ],
  href: '/analyze',
  prs: [708],
  audience: 'all',
} satisfies ChangeEntry;
