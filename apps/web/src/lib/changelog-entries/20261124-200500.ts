import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T20:05:00+07:00',
  kind: 'new',
  title: 'Tạo tư thế người mẫu cho biết mỗi ảnh giống người mẫu đến đâu',
  details: [
    'Mỗi ảnh của Tạo tư thế người mẫu có một dòng cho biết khuôn mặt trong ảnh giống ảnh người mẫu gốc đến đâu: Cao, Vừa hoặc Thấp, kèm con số.',
    'Dòng này hiện ở thẻ kết quả trong Lịch sử. Ảnh chụp từ phía sau hoặc che mặt sẽ ghi "không thấy mặt", nên đó không phải lỗi.',
  ],
  href: '/apps/pose-generator',
  prs: [643],
  audience: 'all',
} satisfies ChangeEntry;
