import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T16:00:00+07:00',
  kind: 'improved',
  title: 'Chọn mô hình gọn hơn, thấy phần miễn phí của team trước khi tạo',
  details: [
    'Khi mở ô Mô hình, bạn chỉ thấy mô hình đang chọn và mô hình đề xuất. Muốn xem các mô hình khác, bấm Nâng cao hoặc gõ tên vào ô tìm.',
    'Ngay trên nút Tạo có dòng cho biết team bạn còn bao nhiêu USD miễn phí tháng này. Giá của lượt tạo vẫn hiện trên nút như trước.',
  ],
  prs: [703],
  audience: 'all',
} satisfies ChangeEntry;
