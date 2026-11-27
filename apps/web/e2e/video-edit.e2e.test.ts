import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, type Page, test } from '@playwright/test';
import { RECOLOR_COLORS, videoEditPrompt } from '../src/lib/apps';
import { modelButton, signIn } from './support.test';

// The video edit app on the mock model of e2e/serve.ts (mock provider, the real endpoint): one clip, a quick colour, and a clip as long as the upload.
// A mock job books $0; the price of the real row is checked in api/jobs/video-edit.test.ts.
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy(?! lại)/ }); // not a History card's rerun button
const reason = (page: Page) => page.locator('.form-message').getByRole('status');
const kinds = (page: Page) => page.getByRole('radiogroup', { name: 'Kiểu sửa' });
const colors = (page: Page) => page.getByRole('radiogroup', { name: 'Màu áo mới' });
const red = RECOLOR_COLORS.find((c) => c.label === 'Đỏ')!;

type Job = { id: string; feature: string; status: string; color: string | null };
const mine = async (page: Page) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: Job[] }).jobs.filter((j) => j.feature === 'video_edit');

/** A real 4 s, 720x720, 24 fps H.264 clip from the worker's pinned ffmpeg: the jobs API reads its header and the worker plays it through ffprobe before the job is sent. */
async function clip(): Promise<Buffer> {
  const ffmpeg = createRequire(new URL('../../worker/package.json', import.meta.url))('ffmpeg-static') as string;
  const dir = await mkdtemp(join(tmpdir(), 'cvs-edit-e2e-'));
  try {
    const file = join(dir, 'shirt.mp4');
    await promisify(execFile)(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=720x720:rate=24:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('video edit: the form, a Run of a quick colour, its job, Reuse and the Library chip', async ({ page }) => {
  const video = await clip();
  await signIn(page, 'edita');
  await page.goto('/apps');
  await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: 'Sửa video' }).click();
  await expect(page).toHaveURL(/\/apps\/video-edit$/);

  // The form: the clip slot, the three kinds with the colour first, the swatches unpicked, and no prompt, ratio, length or model control.
  await expect(page.getByRole('tab')).toHaveText(['Lịch sử', 'Ví dụ', 'Giới thiệu']);
  await expect(kinds(page).getByRole('radio')).toHaveCount(3);
  await expect(kinds(page).getByRole('radio', { name: 'Đổi màu áo', exact: true })).toBeChecked();
  await expect(colors(page).getByRole('radio')).toHaveCount(RECOLOR_COLORS.length);
  await expect(colors(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(modelButton(page)).toHaveCount(0);
  await expect(reason(page)).toHaveText('Tải lên video cần sửa.');
  await expect(runButton(page)).toBeDisabled();

  // The clip: the models are asked again for its length (4 s), then a colour is all that is missing.
  const asked = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/models' && new URL(r.url()).searchParams.get('durationSec') === '4');
  await page.getByLabel('Tệp video cần sửa').setInputFiles({ name: 'shirt.mp4', mimeType: 'video/mp4', buffer: video });
  await expect(page.getByText('shirt.mp4 · 4.0 giây')).toBeVisible();
  const query = new URL((await asked).url()).searchParams;
  expect([query.get('feature'), query.get('ratio'), query.get('images')]).toEqual(['video_edit', 'auto', '1']);
  await expect(reason(page)).toHaveText('Chọn màu áo mới.');

  // The own words take a box of their own; back on the colour, a swatch is the whole edit.
  await kinds(page).getByRole('radio', { name: 'Tự mô tả', exact: true }).check();
  await expect(page.getByRole('textbox', { name: 'Mô tả thay đổi' })).toBeVisible();
  await expect(reason(page)).toHaveText('Mô tả thay đổi bạn muốn.');
  await kinds(page).getByRole('radio', { name: 'Đổi màu áo', exact: true }).check();
  await colors(page).getByRole('radio', { name: 'Đỏ', exact: true }).check();
  await expect(reason(page)).toHaveCount(0);
  await expect(runButton(page)).toBeEnabled();

  const sent: Record<string, unknown>[] = [];
  page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/jobs' && sent.push(r.postDataJSON())));
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ feature: 'video_edit', modelId: 'mock-video-edit-e2e', ratio: 'auto', prompt: videoEditPrompt({ color: red.hex }), params: { color: red.hex } });
  expect(sent[0]!.assetIds).toHaveLength(1);
  expect(sent[0]).not.toHaveProperty('durationSec'); // the clip's own length
  expect(sent[0]).not.toHaveProperty('enhance');

  // History names the colour and the clip finishes.
  const card = page.locator('.job-card').filter({ has: page.getByRole('heading', { name: 'Sửa video · Đỏ', level: 3 }) });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 90_000 });

  // The job holds what the page sent, priced for the clip's 4 s.
  const [job] = await mine(page);
  expect(job).toMatchObject({ color: red.hex, status: 'succeeded' });
  const detail = (await (await page.request.get(`/api/jobs/${job!.id}`)).json()) as Record<string, unknown> & { inputIds: string[] };
  expect(detail).toMatchObject({ feature: 'video_edit', color: red.hex, prompt: videoEditPrompt({ color: red.hex }), ratio: 'auto', durationSec: 4, isMock: true });
  expect(detail.inputIds).toHaveLength(1);

  // Dùng lại brings the clip and the colour back.
  await page.goto(`/apps/video-edit?reuse=${job!.id}`);
  await expect(page.getByText('shirt.mp4 · 4.0 giây')).toBeVisible();
  await expect(kinds(page).getByRole('radio', { name: 'Đổi màu áo', exact: true })).toBeChecked();
  await expect(colors(page).getByRole('radio', { name: 'Đỏ', exact: true })).toBeChecked();

  // The Library's app chip finds the job.
  await page.goto('/library');
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Edit A' });
  await page.getByRole('group', { name: 'Loại', exact: true }).getByRole('button', { name: 'Ứng dụng', exact: true }).click();
  await page.getByRole('group', { name: 'Theo ứng dụng' }).getByRole('button', { name: 'Sửa video', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
});
