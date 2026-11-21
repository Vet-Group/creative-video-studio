import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-21T12:02:00+07:00',
  kind: 'new',
  title: 'Tạo ảnh: chọn 2 hoặc 4 ảnh một lượt',
  details: [
    'Thanh tạo ảnh có thêm ô "Số ảnh" (1, 2 hoặc 4). Cùng một mô tả và thiết lập, bấm Tạo ảnh một lần là ra nhiều phương án để chọn.',
    'Nút Tạo ảnh hiện tổng giá trước khi gửi, kèm dòng "số ảnh × giá một ảnh = tổng". Mỗi ảnh là một job và vẫn tính vào hạn mức ngày, tháng như trước.',
    'Trong Lịch sử, "Chọn cả lô" chọn và tải về cả lượt.',
  ],
  href: '/image-generation',
  prs: [618],
  audience: 'all',
} satisfies ChangeEntry;
