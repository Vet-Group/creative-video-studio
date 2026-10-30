import { expect, type Page, test } from '@playwright/test';
import { pickPreset, png, signIn } from './support.test';

// What Create video adds on a fal model that takes it, as Fash's Create Videos page does: an End frame slot, a Run from the prompt alone and reference
// audio. The mock model takes none (the models API reads them from fal's request builders), so the spec gives it the flags in the models answer and
// checks the Run's body without making the job.

/** The mock models with `extras` merged into each, as the models API would answer for a fal model that has them. */
async function withExtras(page: Page, extras: Record<string, unknown>): Promise<void> {
  await page.route('**/api/models?*', async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { models: Record<string, unknown>[] };
    for (const m of json.models) Object.assign(m, extras);
    await route.fulfill({ response: res, json });
  });
}

/** The body of the next Run; the job is answered as queued and never made, since the mock model would refuse the extras. */
function nextRun(page: Page): Promise<{ assetIds: string[]; params: Record<string, unknown> }> {
  return new Promise((resolve) => {
    void page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      resolve(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: 'caught', status: 'queued' } });
    });
  });
}

const endSlot = (page: Page) => page.getByRole('group', { name: 'Khung hình cuối' });

// A models request still in the route when a test ends would fail it, so the routes go first.
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test('the End frame slot shows only for a model that takes one, and its image goes with the Run', async ({ page }) => {
  await signIn(page, 'cvxa');
  await expect(page.getByRole('button', { name: /^Mô hình / })).toContainText('Mock E2E');
  await expect(endSlot(page)).toHaveCount(0); // the mock endpoint takes no end frame

  await withExtras(page, { endFrame: true });
  await page.reload();
  await expect(endSlot(page)).toBeVisible();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'start.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Ảnh khung hình cuối').setInputFiles({ name: 'end.png', mimeType: 'image/png', buffer: png() });
  await expect(endSlot(page).getByRole('img', { name: 'end.png' })).toBeVisible();
  await expect(endSlot(page).getByRole('button', { name: /^Tải lên/ })).toHaveCount(0); // one end frame at most
  await page.getByLabel('Mô tả chuyển động').fill('The bottle turns to face the camera.');
  const body = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  const sent = await body;
  expect(sent.assetIds).toHaveLength(1);
  expect(sent.params).toEqual({ audio: 'on', endAssetId: expect.any(String) });
  expect(sent.assetIds).not.toContain(sent.params.endAssetId);

  // Removed, it is not sent.
  await endSlot(page).getByRole('button', { name: 'Bỏ ảnh end.png' }).click();
  const again = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  expect((await again).params).toEqual({ audio: 'on' });
});

test('a model that runs from the prompt alone lets Run go with no image and a written prompt, but not with a preset', async ({ page }) => {
  const run = page.getByRole('button', { name: /^Tạo video/ });
  await signIn(page, 'cvxa');
  await page.getByLabel('Mô tả chuyển động').fill('A red bottle on a beach at sunset.');
  await expect(run).toBeDisabled(); // the mock endpoint needs an image

  await withExtras(page, { textOnly: true });
  await page.reload();
  await expect(page.getByText('Tối đa 4 ảnh sản phẩm, hoặc chỉ viết mô tả')).toBeVisible();
  await pickPreset(page, 'gentle-push-in');
  await expect(run).toBeDisabled();
  await expect(page.getByText('Mẫu chuyển động cần ảnh sản phẩm.', { exact: false })).toBeVisible();
  await pickPreset(page, '');
  await page.getByLabel('Mô tả chuyển động').fill('A red bottle on a beach at sunset.');
  const body = nextRun(page);
  await run.click();
  const sent = (await body) as { assetIds: string[]; prompt?: string; presetId?: string };
  expect(sent.assetIds).toEqual([]);
  expect(sent.prompt).toBe('A red bottle on a beach at sunset.');
  expect(sent.presetId).toBeUndefined();
});

/** A WAV of `ms` at 8 kHz, 8-bit mono: what the assets API measures for its length. */
function wav(ms: number): Buffer {
  const b = Buffer.alloc(44 + ms * 8);
  b.write('RIFF', 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  [b.writeUInt32LE(16, 16), b.writeUInt16LE(1, 20), b.writeUInt16LE(1, 22), b.writeUInt32LE(8000, 24), b.writeUInt32LE(8000, 28), b.writeUInt16LE(1, 32), b.writeUInt16LE(8, 34)];
  b.write('data', 36);
  b.writeUInt32LE(ms * 8, 40);
  return b;
}

test('a model that takes reference audio shows the picker: clips of 2 s or more up to its count, sent with the Run', async ({ page }) => {
  const picker = page.getByRole('group', { name: 'Âm thanh tham chiếu' });
  await signIn(page, 'cvxa');
  await expect(picker).toHaveCount(0); // the mock endpoint takes none

  await withExtras(page, { audioClips: { max: 2, seconds: 15 } });
  await page.reload();
  await expect(picker).toContainText('Tối đa 2 tệp MP3 hoặc WAV, mỗi tệp từ 2 giây, tổng tối đa 15 giây');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Tệp âm thanh tham chiếu').setInputFiles({ name: 'blip.wav', mimeType: 'audio/wav', buffer: wav(1000) });
  await expect(page.getByText('Mỗi tệp âm thanh phải dài ít nhất 2 giây.')).toBeVisible();
  await expect(picker.getByRole('listitem')).toHaveCount(0);
  await page.getByLabel('Tệp âm thanh tham chiếu').setInputFiles([
    { name: 'voice.wav', mimeType: 'audio/wav', buffer: wav(2500) },
    { name: 'song.wav', mimeType: 'audio/wav', buffer: wav(4000) },
  ]);
  await expect(picker.getByRole('listitem')).toHaveText(['voice.wav · 2.5 giây', 'song.wav · 4.0 giây']);
  await expect(picker.getByRole('button', { name: 'Tải lên Âm thanh tham chiếu' })).toHaveCount(0); // full at 2
  await page.getByLabel('Mô tả chuyển động').fill('The model sings along to @Audio1.');
  const body = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  const ids = String((await body).params.audioAssetIds).split(',');
  expect(ids).toHaveLength(2);

  await picker.getByRole('button', { name: 'Bỏ âm thanh voice.wav' }).click();
  const again = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  expect((await again).params.audioAssetIds).toBe(ids[1]);
});

test('a saved template and History’s Dùng lại refill the end frame and the audio, and a model that takes neither leaves them out of the Run', async ({ page }) => {
  const picker = page.getByRole('group', { name: 'Âm thanh tham chiếu' });
  await signIn(page, 'cvxr');
  await withExtras(page, { endFrame: true, audioClips: { max: 2, seconds: 15 } });
  await page.reload();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'start.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Ảnh khung hình cuối').setInputFiles({ name: 'end.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Tệp âm thanh tham chiếu').setInputFiles([
    { name: 'voice.wav', mimeType: 'audio/wav', buffer: wav(2500) },
    { name: 'song.wav', mimeType: 'audio/wav', buffer: wav(4000) },
  ]);
  await expect(picker.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Mô tả chuyển động').fill('The bottle turns to face the camera.');
  await page.getByRole('button', { name: 'Lưu mẫu', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lưu mẫu' });
  await dialog.getByLabel('Tên mẫu').fill('Kết thúc có nhạc');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu mẫu.' })).toBeVisible();

  // A fresh form refilled from the template has the end frame and both clips back, and sends them with the Run.
  await page.goto('/create');
  await expect(endSlot(page)).toBeVisible();
  await expect(endSlot(page).getByRole('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mẫu của tôi' }).click();
  await page.getByRole('dialog', { name: 'Mẫu của tôi' }).getByRole('link', { name: 'Kết thúc có nhạc' }).click();
  await expect(endSlot(page).getByRole('img', { name: 'end.png' })).toBeVisible();
  await expect(picker.getByRole('listitem')).toHaveText(['voice.wav · 2.5 giây', 'song.wav · 4.0 giây']);
  const body = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  const sent = await body;
  expect(sent.params).toEqual({ audio: 'on', endAssetId: expect.any(String), audioAssetIds: expect.stringMatching(/^[^,]+,[^,]+$/) });
  const { endAssetId, audioAssetIds } = sent.params as { endAssetId: string; audioAssetIds: string };

  // History's reuse button: a job the API gives back with that end frame and audio (the mock model cannot run one) refills them the same way.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const run = await page.request.post('/api/jobs', { data: { assetIds: sent.assetIds, modelId: 'mock-e2e', prompt: 'p', enhance: false, ratio: '9:16', durationSec: 5, params: { audio: 'on' } } });
  expect(run.status()).toBe(201);
  const { id } = (await run.json()) as { id: string };
  const [voice, song] = audioAssetIds.split(',');
  await page.route(`**/api/jobs/${id}`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), endFrame: { id: endAssetId, filename: 'end.png' }, clips: [{ id: song, filename: 'song.wav', durationMs: 4000 }, { id: voice, filename: 'voice.wav', durationMs: 2500 }] } });
  });
  await withExtras(page, { endFrame: true, audioClips: { max: 2, seconds: 15 } });
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('button', { name: 'Dùng lại' }).first().click();
  await expect(endSlot(page).getByRole('img', { name: 'end.png' })).toBeVisible();
  await expect(picker.getByRole('listitem')).toHaveText(['song.wav · 4.0 giây', 'voice.wav · 2.5 giây']);

  // On a model that takes neither, the template refills the image and leaves the end frame and the audio out of the Run.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto('/create');
  await page.getByRole('button', { name: 'Mẫu của tôi' }).click();
  await page.getByRole('dialog', { name: 'Mẫu của tôi' }).getByRole('link', { name: 'Kết thúc có nhạc' }).click();
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue('The bottle turns to face the camera.');
  await expect(endSlot(page)).toHaveCount(0);
  await expect(picker).toHaveCount(0);
  const plain = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  expect(await plain).toMatchObject({ assetIds: sent.assetIds, params: { audio: 'on' } });
  expect((await plain).params).toEqual({ audio: 'on' });
});
