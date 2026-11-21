import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-21T13:15:00+07:00',
  kind: 'new',
  title: 'Đổi nền, Xoá nền, Tăng độ phân giải: chạy tối đa 25 ảnh một lượt',
  details: [
    'Ô Ảnh của ba ứng dụng này giờ nhận tối đa 25 ảnh. Bấm Chạy một lần là mỗi ảnh thành một job, cùng thiết lập (cùng mô tả nền hoặc ảnh nền tham chiếu, cùng độ phân giải), nên cả bộ ảnh sản phẩm ra đồng đều.',
    'Từ 2 ảnh trở lên, form ghi rõ "số ảnh × giá một ảnh = tổng" và nút Chạy hiện tổng trước khi gửi. Trong Lịch sử, "Chọn cả lô" chọn và tải về cả lượt.',
    'Chỉ có 1 ảnh thì mọi thứ như cũ: ảnh hiện nguyên khung, thêm ảnh bằng nút + ở góc. Nếu lượt bị lỗi giữa chừng, các ảnh đã gửi được bỏ khỏi ô để bấm Chạy lại chỉ gửi phần còn lại.',
  ],
  href: '/apps/background-changer',
  prs: [617],
  audience: 'all',
} satisfies ChangeEntry;
