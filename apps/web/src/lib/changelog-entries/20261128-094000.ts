import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T09:40:00+07:00',
  kind: 'improved',
  title: 'Bảng chọn mô hình không tự đóng khi cuộn, tìm kiếm thông minh hơn',
  details: [
    'Khi bảng chọn mô hình đang mở mà bạn lăn chuột ở ngoài bảng, bảng đi theo ô Mô hình thay vì đóng lại. Nếu lỡ bấm ra ngoài làm bảng đóng, mở lại trong 30 giây vẫn còn chữ đã gõ và bộ lọc.',
    'Gõ sai chính tả hoặc gõ không dấu vẫn ra mô hình. Bạn cũng tìm được theo thông số như 1080p, 10s, có tiếng, rẻ, mới hoặc tên hãng; phần chữ khớp được tô đậm, và khi không có kết quả thì bảng gợi ý tên gần nhất.',
    'Dưới ô tìm có nút lọc nhanh: Có âm thanh, 1080p, Rẻ nhất, Mới. Mục Dùng gần đây đưa 3 mô hình bạn chọn gần nhất lên đầu.',
  ],
  prs: [710],
  audience: 'all',
} satisfies ChangeEntry;
