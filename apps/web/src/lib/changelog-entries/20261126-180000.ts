import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T18:00:00+07:00',
  kind: 'new',
  title: 'Tự động chốt chi phí tháng trước',
  details: [
    'Từ 8:00 sáng ngày 1 hằng tháng (giờ Việt Nam), tháng trước tự được chốt trong Chi phí › Theo team, rồi gửi tóm tắt và tệp CSV qua Lark như khi bấm Chốt tháng. Lần đầu là tháng 11/2026, vào 1/12 lúc 8:00.',
    'Tháng chốt tự động ghi người chốt là Hệ thống (tự động). Tháng nào Admin đã mở lại thì hệ thống không tự chốt lại, Admin chốt tay khi cần.',
  ],
  href: '/admin/costs/teams',
  prs: [661],
  audience: 'admin',
} satisfies ChangeEntry;
