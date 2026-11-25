import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-25T14:20:00+07:00',
  kind: 'improved',
  title: 'Chi phí: chọn khoảng ngày, chỉ tính người dùng thật và trang gọn hơn',
  details: [
    'Trang Chi phí chọn được Hôm nay, 7 ngày, Tháng này, Tháng trước hoặc khoảng ngày tuỳ chọn, so với khoảng liền trước. Mặc định chỉ tính người dùng thật (bỏ tài khoản hệ thống, tài khoản thử và team không tính báo cáo) và ghi rõ phần đang ẩn.',
    'Biểu đồ chi theo ngày có trục tiền, đường mức đều để vừa hạn mức video, và bấm một ngày để xem riêng ngày đó. Bốn bảng cũ gộp thành một thẻ chuyển giữa Người dùng, Team hiện tại, Cửa hàng, Tính năng và Mô hình, sắp xếp được theo từng cột.',
    'Tỉ giá, chi phí chung, điều chỉnh tay, hóa đơn, số dư nhà cung cấp, Vertex và CSV cho kế toán chuyển sang tab mới Đối soát, vẫn tính theo cả tháng và mọi tài khoản.',
  ],
  href: '/admin/costs',
  prs: [650],
  audience: 'admin',
} satisfies ChangeEntry;
