import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T18:30:00+07:00',
  kind: 'improved',
  title: 'Điều khiển chuyển động có tab Ví dụ',
  details: [
    'Trang Điều khiển chuyển động giờ có tab Ví dụ, nơi Admin đưa những video chuyển động đẹp của công ty lên cho mọi người xem.',
    'Bấm Dùng ví dụ này trên một video để điền sẵn ảnh nhân vật, video chuyển động, mô tả, mô hình và hướng nhân vật vào biểu mẫu, rồi thay bằng ảnh của bạn nếu cần.',
  ],
  href: '/apps/motion-control',
  prs: [662],
  audience: 'all',
} satisfies ChangeEntry;
