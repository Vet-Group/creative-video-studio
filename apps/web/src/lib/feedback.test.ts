import { expect, test } from 'vitest';
import { type FeedbackComment, feedbackMarkdown, type ListedFeedback } from './feedback';

const item: ListedFeedback = {
  id: 'f1',
  kind: 'bug',
  title: 'Nút bị lệch',
  body: 'Nút Tạo video lệch trên điện thoại.',
  status: 'done',
  adminNote: 'Đã sửa:\n1. Nút thẳng hàng',
  imageAssetIds: ['a1', 'a2'],
  authorName: 'Nguyễn Văn A',
  mine: false,
  votes: 3,
  voted: false,
  comments: 2,
  createdAt: '2026-11-15T03:00:00.000Z',
  updatedAt: '2026-11-15T04:00:00.000Z',
  unread: false,
  workspaceName: null,
  workspaceCompany: true,
};
const comments: FeedbackComment[] = [
  { id: 'c1', authorName: 'Trần B', authorAdmin: false, body: 'Mình cũng bị.\nTrên iPhone.', mine: false, createdAt: '2026-11-15T03:30:00.000Z' },
  { id: 'c2', authorName: 'Admin C', authorAdmin: true, body: 'Đã sửa.', mine: false, createdAt: '2026-11-15T04:00:00.000Z' },
];

test('the Markdown has the title, the facts, the link, the body, the reply and the comments, and no staff name', () => {
  const md = feedbackMarkdown(item, comments, 'https://video.vetgroup.net');
  expect(md.split('\n').slice(0, 7)).toEqual([
    '## Nút bị lệch',
    '',
    '- Loại: Báo lỗi · Trạng thái: Đã xử lý · Bình chọn: 3',
    expect.stringMatching(/^- Gửi lúc: .+ · 2 ảnh \(xem trong app\)$/),
    '- Link: https://video.vetgroup.net/feedback/f1',
    '',
    'Nút Tạo video lệch trên điện thoại.',
  ]);
  expect(md).toContain('### Phản hồi của đội kỹ thuật\n\nĐã sửa:\n1. Nút thẳng hàng');
  expect(md).toMatch(/- Thành viên \(.+\): Mình cũng bị\. Trên iPhone\./);
  expect(md).toMatch(/- Đội kỹ thuật \(.+\): Đã sửa\./);
  for (const name of ['Nguyễn Văn A', 'Trần B', 'Admin C']) expect(md).not.toContain(name);
});

test('without a reply, comments or images, those parts are left out', () => {
  const md = feedbackMarkdown({ ...item, adminNote: null, imageAssetIds: [] }, [], 'http://x');
  expect(md).not.toContain('###');
  expect(md).not.toContain('ảnh');
});
