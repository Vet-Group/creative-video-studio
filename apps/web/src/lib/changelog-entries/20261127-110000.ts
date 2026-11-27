import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T11:00:00+07:00',
  kind: 'fixed',
  title: 'Dễ bấm hơn trên iPad và màn cảm ứng',
  details: [
    'Trên iPad, các nút, tab, ô chọn và nút trên thẻ Lịch sử giờ rộng 44 px như trên điện thoại, dễ chạm bằng ngón tay.',
    'Ảnh đính kèm ở Góp ý mở ngay trong trang có nút đóng, không sang tab mới. Nút phóng to ảnh đầu vào ở Lịch sử hiện cả trên màn cảm ứng.',
    'Kệ sản phẩm trống: nút Thêm sản phẩm mở kệ ngay trên biểu mẫu rồi quay lại, không sang tab mới.',
  ],
  prs: [691],
  audience: 'all',
} satisfies ChangeEntry;
