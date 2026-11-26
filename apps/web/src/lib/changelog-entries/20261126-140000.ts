import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T14:00:00+07:00',
  kind: 'improved',
  title: 'Chấm điểm app ngay dưới kết quả vừa xong',
  details: [
    'Khi một lượt tạo vừa xong trong tab Lịch sử, ngay dưới kết quả có một dòng hỏi bạn chấm Creative Video Studio mấy điểm, từ 1 đến 10. Dòng này chỉ hiện khi app đang cần bạn chấm, như thẻ hỏi ở góc màn hình.',
    'Chấm ở đâu (dưới kết quả, thẻ ở góc hay trang Góp ý) thì các chỗ hỏi khác cũng ẩn đi. Bấm Để sau thì app không hỏi lại trong 7 ngày.',
  ],
  prs: [656],
  audience: 'all',
} satisfies ChangeEntry;
