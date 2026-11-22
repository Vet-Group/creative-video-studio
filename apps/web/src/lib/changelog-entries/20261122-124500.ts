import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-22T12:45:00+07:00',
  kind: 'improved',
  title: 'Marketing Studio chọn sẵn model Vertex trong lúc còn credit',
  details: [
    'Giống Tạo video, Marketing Studio giờ chọn sẵn Gemini Omni Flash Reference chạy trên Vertex trong thời gian tài khoản Vertex còn credit miễn phí.',
    'Model này chỉ làm tỉ lệ 9:16 và 16:9 và luôn có tiếng. Với tỉ lệ khác, Marketing Studio chọn sẵn như trước; bạn vẫn đổi được sang model khác bất cứ lúc nào.',
    'Khi credit Vertex hết, Marketing Studio tự quay về chọn model theo điểm như trước.',
  ],
  href: '/marketing-studio',
  prs: [0],
  audience: 'all',
} satisfies ChangeEntry;
