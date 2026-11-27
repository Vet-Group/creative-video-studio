import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { draftFromJob } from '@/lib/custom-apps';
import type { AdminApp, AppSource } from '@/lib/custom-apps-db';
import { AppEditor } from './AppEditor';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) })); // a static render has no app router

const job = { feature: 'video', presetId: null, prompt: '  spin it  ', enhancedPrompt: null, ratio: '9:16', durationSec: 5, params: { audio: 'on' }, inputCount: 2 };
const source = (over: Partial<AppSource> = {}): AppSource => ({
  draft: draftFromJob(job), feature: 'video', prompt: job.prompt, enhancedPrompt: null, presetId: null, ratio: '9:16', durationS: 5, audio: 'on', brand: false, endFrame: false, refAudio: false, refVideo: false,
  pairModel: 'm', modelLabel: 'Mock E2E', maxPromptChars: 500, inputIds: ['in-1', 'in-2'], images: [{ id: 'in-1', filename: 'a.png' }, { id: 'in-2', filename: 'b.png' }], outputAssetId: 'out-1', posterAssetId: 'poster-1', ...over,
});
const render = (s: AppSource, app?: AdminApp) => renderToStaticMarkup(<AppEditor jobId="job-1" source={s} app={app} />);

test('a new app lists each input with its thumbnail and the two choices, a slot first with its name and hint fields', () => {
  const html = render(source());
  expect(html).toContain('Biến thành ứng dụng');
  expect(html).toContain('src="/api/assets/in-1/thumb"');
  expect(html).toContain('src="/api/assets/in-2/thumb"');
  expect(html.match(/Người dùng tải lên/g)).toHaveLength(2);
  expect(html.match(/Giữ cố định/g)).toHaveLength(2);
  expect(html.match(/Tên ô/g)).toHaveLength(2);
  expect(html.match(/Gợi ý trong ô/g)).toHaveLength(2);
  expect(html).toContain('value="Ảnh 1"');
  expect(html).toContain('value="Ảnh 2"');
});

test('it shows the result, the settings the app keeps as a read-only line and the trimmed prompt with its counter', () => {
  const html = render(source());
  expect(html).toContain('Ảnh bìa: kết quả của lượt này');
  expect(html).toContain('src="/api/assets/out-1/content"');
  expect(html).toContain('Mock E2E · 9:16 · 5 giây · Có âm thanh');
  expect(html).toContain('Mô hình, tỉ lệ và thời lượng giữ như lượt gốc.');
  expect(html).toContain('>spin it</textarea>');
  expect(html).toContain('>7/500 ký tự<');
});

test('an image source shows its picture and its resolution', () => {
  const html = render(source({ feature: 'image', durationS: 0, resolution: '2K', audio: undefined, draft: draftFromJob({ ...job, feature: 'image', durationSec: 0, params: { resolution: '2K' } }) }));
  expect(html).toContain('<img src="/api/assets/out-1/thumb"');
  expect(html).toContain('Mock E2E · 9:16 · 2K');
  expect(html).not.toContain('<video');
});

test('Lưu stays disabled with the reason until there is a name', () => {
  const html = render(source());
  expect(html).toMatch(/<button type="submit" class="primary" disabled="" aria-describedby="[^"]+-reason">Lưu<\/button>/);
  expect(html).toMatch(/<p id="[^"]+-reason" class="muted" role="status">Hãy đặt tên ứng dụng/);
});

test('editing prefills the fields of the app: its name, a slot, a kept photo, and Lưu waits for a change', () => {
  const app: AdminApp = { id: 'a1', name: 'Video xoay', category: 'video', published: true, sourceLive: true, sourceJobId: 'job-1', description: 'Xoay', prompt: 'saved prompt', inputs: [{ slot: { label: 'Ảnh sản phẩm', hint: 'Nền trắng' } }, { fixed: 'in-2' }] };
  const html = render(source(), app);
  expect(html).toContain('Sửa ứng dụng');
  expect(html).toContain('value="Video xoay"');
  expect(html).toContain('value="Ảnh sản phẩm"');
  expect(html).toContain('value="Nền trắng"');
  expect(html).toContain('>saved prompt</textarea>');
  expect(html.match(/Tên ô/g)).toHaveLength(1); // the second input is kept
  expect(html).toMatch(/<button type="submit" class="primary" disabled="" aria-describedby="[^"]+-reason">Lưu<\/button>/);
  expect(html).toContain('Chưa có thay đổi nào để lưu.'); // an unchanged app sends nothing
});

test('a source that cannot become an app shows its preview and the reason instead of the form', () => {
  const html = render(source({ presetId: 'gentle-push-in', draft: draftFromJob({ ...job, presetId: 'gentle-push-in' }) }));
  expect(html).toContain('Lượt này dùng mẫu chuyển động hoặc phong cách có sẵn nên chưa biến thành ứng dụng được.');
  expect(html).toContain('Mock E2E · 9:16 · 5 giây');
  expect(html).not.toContain('<form');
  expect(html).not.toContain('Lưu');
});
