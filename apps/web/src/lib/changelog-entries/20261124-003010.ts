import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T00:30:10+07:00',
  kind: 'new',
  title: 'So sánh hai kết quả cạnh nhau trong Thư viện',
  details: [
    'Chọn đúng 2 mục trong Thư viện rồi bấm "So sánh": hai kết quả hiện cạnh nhau (xếp dọc trên điện thoại), mỗi cái có tên tính năng và model.',
    'Với hai video, bấm phát, tạm dừng hoặc tua một video thì video kia làm theo; cả hai tắt tiếng sẵn, bấm nút loa để bật.',
  ],
  href: '/library',
  prs: [632],
  audience: 'all',
} satisfies ChangeEntry;
