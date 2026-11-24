import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T18:31:00+07:00',
  kind: 'fixed',
  title: 'Nút đang chọn bằng bàn phím không còn bị che trong chi tiết Thư viện',
  details: [
    'Khi bấm Tab trong chi tiết một mục ở Thư viện, phần thông tin tự cuộn để nút đang chọn luôn nằm phía trên hàng Đạt, Nổi bật, Không đạt và Dùng lại.',
    'Trước đây trên điện thoại, các nút của "Tải theo tỉ lệ khác" có thể nằm khuất hẳn sau hàng nút này.',
  ],
  href: '/library',
  prs: [642],
  audience: 'all',
} satisfies ChangeEntry;
