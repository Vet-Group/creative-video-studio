import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T18:44:00+07:00',
  kind: 'new',
  title: 'Tạo video: hai khung prompt mới cho quần áo',
  details: [
    '"Đổi màu theo cánh quạt": thêm 2–4 ảnh áo trải phẳng cùng một thiết kế, mỗi ảnh một màu, theo thứ tự. Mỗi lần bóng cánh quạt lướt qua, áo đổi sang màu kế tiếp mà hình in vẫn giữ nguyên, hợp để khoe mọi màu của một mẫu trong một video.',
    '"Cận cảnh chi tiết": từ một ảnh áo, video đi từ cảnh toàn sang cận hình in, sợi vải, đường may cổ áo và gấu tay, rồi trở lại cảnh toàn.',
    'Cả hai nằm trong nhóm Quần áo của Khung prompt. "Đổi màu theo cánh quạt" cần mô hình nhận nhiều ảnh tham chiếu, như Minimax H3 Max Reference.',
  ],
  prs: [717],
  href: '/create',
  audience: 'all',
} satisfies ChangeEntry;
