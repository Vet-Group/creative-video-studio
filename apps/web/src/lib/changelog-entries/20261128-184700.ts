import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T18:47:00+07:00',
  kind: 'improved',
  title: 'Nhắc trước khi chạy khi ảnh quá nhỏ hoặc quá tối',
  details: [
    'Dưới ô ảnh hiện một dòng lưu ý khi ảnh có cạnh ngắn dưới 768 px (kết quả dễ bị mờ) hoặc ảnh quá tối (dễ mất chi tiết). Ảnh nền trắng không bị nhắc.',
    'Đây chỉ là lời nhắc: bạn vẫn bấm Chạy được như thường.',
  ],
  prs: [718],
  audience: 'all',
} satisfies ChangeEntry;
