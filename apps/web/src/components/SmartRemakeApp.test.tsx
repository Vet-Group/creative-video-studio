import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { appBySlug } from '@/lib/apps';
import { scenePicks } from '@/lib/analyze';
import { pickNote, SmartRemakeApp } from './SmartRemakeApp';

// The video slot lists the member's recent clips, which the app shell's jobs provider holds.
vi.mock('./jobs', async (original) => ({ ...(await original<typeof import('./jobs')>()), useJobs: () => ({ jobs: [] }) }));

test('the app asks for two things only, a reference video and one product image, with the tip, and shows no remake form before they are set', () => {
  const html = renderToStaticMarkup(<SmartRemakeApp app={appBySlug('smart-remake')!} />);
  expect(html).toContain('Smart Remake');
  expect(html).toContain('Video tham chiếu');
  expect(html).toContain('Ảnh sản phẩm');
  expect(html).toContain('Mẹo: dùng ảnh sản phẩm rõ nét trên nền trơn');
  expect(html).not.toContain('Tạo video với sản phẩm'); // RemakePanel mounts once the video is analysed and the scenes are picked
  expect(html).not.toContain('role="status"');
  expect(html).toContain('Giới thiệu'); // the About tab beside the form
});

test('a scene pick becomes stored shots in the answer order, drops numbers the video does not have and keeps at most the cap', () => {
  const first = [1, 3, 6, 9];
  expect(scenePicks(first, ['2', '4'], 6)).toEqual([3, 9]);
  expect(scenePicks(first, ['1', '5', '0', 'x', '2'], 6)).toEqual([1, 3]);
  expect(scenePicks(first, ['1', '2', '3', '4'], 2)).toEqual([1, 3]);
  expect(scenePicks(first, [], 6)).toEqual([]);
});

test('the note says how many scenes were ticked, that none matched, or that the pick failed and the member chooses', () => {
  expect(pickNote(2)).toBe('AI đã chọn sẵn 2 cảnh có sản phẩm của bạn; bỏ chọn cảnh nào không cần.');
  expect(pickNote(0)).toContain('chưa thấy cảnh nào');
  expect(pickNote(null)).toContain('tự chọn');
});

test('opened with an analysis id it still shows the form, with no remake list until the member has some', () => {
  const html = renderToStaticMarkup(<SmartRemakeApp app={appBySlug('smart-remake')!} initialId="an-1" />);
  expect(html).toContain('Ảnh sản phẩm');
  expect(html).not.toContain('Tạo video với sản phẩm'); // the panel needs the analysis fetched and a product added again
  expect(html).not.toContain('Video của bạn');
});
