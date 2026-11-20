import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-20T22:00:00+07:00',
  kind: 'improved',
  title: 'Khay Lượt tạo của tôi bớt hỏi máy chủ lúc bạn không tạo gì',
  details: [
    'Khi bạn có lượt tạo đang chạy, khay vẫn cập nhật mỗi 5 giây (kể cả khi tab đang ẩn) và báo ngay khi xong. Khi không có lượt nào đang chạy, khay chỉ kiểm tra mỗi 30 giây, nên các tab để mở cả ngày không còn làm chậm máy chủ.',
    'Lượt bạn vừa bấm Chạy, kể cả Chạy lại trong Thư viện, hiện trong khay ngay. Lượt bắt đầu ở tab hay thiết bị khác hiện trong vòng 30 giây; quay lại tab thì khay cập nhật ngay.',
  ],
  prs: [600],
  audience: 'all',
} satisfies ChangeEntry;
