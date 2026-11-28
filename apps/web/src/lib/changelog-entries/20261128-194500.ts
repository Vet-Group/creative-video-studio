import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T19:45:00+07:00',
  kind: 'improved',
  title: 'Giá hiển thị gọn một kiểu, tiêu đề trang không lặp trên điện thoại',
  details: [
    'Mọi giá trong danh sách mô hình, dòng tổng giá, nút Chạy lại và hộp xác nhận giờ hiện như $0.70 hay $0.035 thay vì $0.7000, nên so sánh giữa các trang dễ hơn.',
    'Trên điện thoại, tiêu đề trang chỉ hiện một lần ở thanh trên cùng, nội dung bắt đầu cao hơn. Văn bản tiếng Việt ngắt dòng đều hơn, ít còn chữ lẻ cuối dòng.',
  ],
  prs: [731],
  audience: 'all',
} satisfies ChangeEntry;
