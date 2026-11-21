import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-21T12:45:00+07:00',
  kind: 'improved',
  title: 'Gợi ý nhanh mùa lễ; trang Có gì mới gọn hơn',
  details: [
    'Từ 15/11 đến 31/12, hàng gợi ý nhanh dưới ô prompt của Tạo ảnh, Thử đồ và Đổi nền mở đầu bằng cảnh Giáng sinh, phố tuyết, hộp quà và nền Black Friday. Hết mùa lễ, các gợi ý này tự ẩn.',
    'Trang Có gì mới hiện 10 ngày gần nhất trước; bấm nút cuối trang để xem thêm các ngày trước đó. Mục chưa xem luôn hiện, dù cũ đến đâu.',
  ],
  prs: [612],
  audience: 'all',
} satisfies ChangeEntry;
