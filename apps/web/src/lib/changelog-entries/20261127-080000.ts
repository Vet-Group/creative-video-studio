import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T08:00:00+07:00',
  kind: 'new',
  title: 'Ứng dụng mới: Hiệu ứng mở đầu',
  details: [
    'Từ một ảnh sản phẩm, tạo video dọc 5 giây với hiệu ứng gây chú ý trong 2–3 giây đầu: phồng rồi bóp, tan chảy, rơi vào khung hoặc hộp bung mở. Video luôn kết thúc đúng như ảnh của bạn.',
    'Ảnh không đúng khung dọc được thêm viền thay vì bị cắt. Chữ nhỏ trên sản phẩm có thể bị méo trong lúc hiệu ứng chạy, và clip có sẵn âm thanh do mô hình tự tạo.',
  ],
  href: '/apps/hook-effects',
  prs: [680],
  audience: 'all',
} satisfies ChangeEntry;
