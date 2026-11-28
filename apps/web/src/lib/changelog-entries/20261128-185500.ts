import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T18:55:00+07:00',
  kind: 'improved',
  title: 'Chấm đỏ "Có gì mới" báo cả mục được gộp trước nhưng phát hành sau',
  details: [
    'Trước đây một mục có giờ sớm hơn mục bạn đã xem thì không bao giờ hiện chấm đỏ hay hộp thông báo. Giờ trình duyệt nhớ từng mục đã xem, nên mục nào mới ra cũng được báo.',
    'Mục "Có gì mới" ghi đúng giờ gộp thật, không cần đặt giờ ở tương lai rồi chờ mới phát hành.',
  ],
  prs: [727],
  audience: 'admin',
} satisfies ChangeEntry;
