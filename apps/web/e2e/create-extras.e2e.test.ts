import { expect, type Page, test } from '@playwright/test';
import { modelButton, openTemplates, pickPreset, png, signIn } from './support.test';

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
const loopButton = (page: Page) => page.getByRole('button', { name: 'Dùng ảnh đầu làm khung cuối (video lặp)' });
/** The strip under the end frame: the first image, an arrow, the end frame. */
const endPath = (page: Page) => page.getByRole('figure', { name: 'Đầu → Cuối' });
const pathSrc = (page: Page, which: 'Ảnh đầu' | 'Khung hình cuối') => endPath(page).getByRole('img', { name: which });
const photos = (page: Page) => page.getByRole('list', { name: 'Ảnh đã chọn', exact: true });
const noEndHint = 'Mô hình này không nhận khung hình cuối.';
const png1 = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });

/** The mock models plus one that takes an end frame, which the chosen Mock E2E does not; `supported` false: not with the ratio and duration chosen. */
async function withEndModel(page: Page, supported = true): Promise<void> {
  await page.route('**/api/models?*', async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { models: Record<string, unknown>[] };
    const mock = json.models.find((m) => m.id === 'mock-e2e')!;
    json.models.push({ ...mock, id: 'mock-end', label: 'Mock End Frame', pairIds: [], recommended: false, endFrame: true, supported });
    await route.fulfill({ response: res, json });
  });
}

// A models request still in the route when a test ends would fail it, so the routes go first.
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test('the End frame slot shows only for a model that takes one, and its image goes with the Run', async ({ page }) => {
  await signIn(page, 'cvxa');
  await expect(page.getByRole('button', { name: /^Mô hình / })).toContainText('Mock E2E');
  await expect(endSlot(page)).toHaveCount(0); // the mock endpoint takes no end frame

  await withExtras(page, { endFrame: true });
  await page.reload();
  await expect(endSlot(page)).toBeVisible();
  // Optional the one way the sections use: the pill beside the name, not a note in the text.
  await expect(page.locator('.optional-head', { hasText: 'Khung hình cuối' }).locator('.choice-optional')).toHaveText('Tuỳ chọn');
  await expect(endSlot(page)).toContainText('Ảnh clip kết thúc ở đó');
  await expect(endSlot(page)).not.toContainText('không bắt buộc');
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

test('the loop shortcut makes the first image the end frame, the strip shows the clip going from it to the end frame, and the limits still hold', async ({ page }) => {
  await signIn(page, 'cvxa');
  await withExtras(page, { endFrame: true, endMaxImages: 1 });
  await page.reload();
  await expect(endSlot(page)).toBeVisible();
  await expect(loopButton(page)).toHaveCount(0); // no image to loop yet
  await page.getByLabel('Ảnh sản phẩm').setInputFiles([
    { name: 'start.png', mimeType: 'image/png', buffer: png() },
    { name: 'side.png', mimeType: 'image/png', buffer: png() },
  ]);
  await expect(loopButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(endPath(page)).toHaveCount(0); // no end frame yet

  await loopButton(page).click();
  await expect(loopButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(endSlot(page).getByRole('img', { name: 'start.png' })).toBeVisible();
  // The strip goes from the first image to the end frame: here the same picture.
  const first = await photos(page).getByRole('img', { name: 'start.png' }).getAttribute('src');
  await expect(endPath(page).getByRole('img')).toHaveCount(2);
  await expect(pathSrc(page, 'Ảnh đầu')).toHaveAttribute('src', first!);
  await expect(pathSrc(page, 'Khung hình cuối')).toHaveAttribute('src', first!);

  // The model's limit on the images beside an end frame still stops Run, with its message.
  const run = page.getByRole('button', { name: /^Tạo video/ });
  await page.getByLabel('Mô tả chuyển động').fill('The bottle turns a full circle.');
  await expect(page.getByText('Mô hình này chỉ nhận khung hình cuối khi có tối đa 1 ảnh. Bỏ bớt ảnh hoặc bỏ khung hình cuối.')).toBeVisible();
  await expect(run).toBeDisabled();
  await photos(page).getByRole('button', { name: 'Bỏ ảnh side.png' }).click();
  const body = nextRun(page);
  await run.click();
  const sent = await body;
  expect(sent.assetIds).toHaveLength(1);
  expect(sent.params).toEqual({ audio: 'on', endAssetId: sent.assetIds[0] });

  // Pressed again, it gives back the end frame it replaced: none here.
  await loopButton(page).click();
  await expect(loopButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(endSlot(page).getByRole('img')).toHaveCount(0);
  await expect(endPath(page)).toHaveCount(0);
});

test('an uploaded end frame shows in the strip after the first image; the shortcut swaps it for the first image and gives it back when turned off, and a looped end frame goes with its image', async ({ page }) => {
  await signIn(page, 'cvxa');
  await withExtras(page, { endFrame: true });
  await page.reload();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles([png1('start.png'), png1('side.png')]);
  await page.getByLabel('Ảnh khung hình cuối').setInputFiles(png1('end.png'));
  const end = await endSlot(page).getByRole('img', { name: 'end.png' }).getAttribute('src');
  const first = await photos(page).getByRole('img', { name: 'start.png' }).getAttribute('src');
  expect(end).not.toBe(first);
  await expect(pathSrc(page, 'Ảnh đầu')).toHaveAttribute('src', first!);
  await expect(pathSrc(page, 'Khung hình cuối')).toHaveAttribute('src', end!);
  await expect(loopButton(page)).toHaveAttribute('aria-pressed', 'false');
  await loopButton(page).click();
  await expect(endSlot(page).getByRole('img', { name: 'start.png' })).toBeVisible();
  await expect(pathSrc(page, 'Khung hình cuối')).toHaveAttribute('src', first!);

  // Turned off, the uploaded end frame is back.
  await loopButton(page).click();
  await expect(loopButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(endSlot(page).getByRole('img', { name: 'end.png' })).toBeVisible();
  await expect(pathSrc(page, 'Khung hình cuối')).toHaveAttribute('src', end!);

  // Looped again, then the first image taken off: the end frame goes with it (a company example's photo is no end frame without it),
  // and the shortcut now stands for the next image.
  await loopButton(page).click();
  await expect(loopButton(page)).toHaveAttribute('aria-pressed', 'true');
  await photos(page).getByRole('button', { name: 'Bỏ ảnh start.png' }).click();
  await expect(photos(page).getByRole('img')).toHaveCount(1);
  await expect(endSlot(page).getByRole('img')).toHaveCount(0);
  await expect(loopButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(endPath(page)).toHaveCount(0);
});

test('a model without an end frame says so where the slot goes while another model takes one, and its link opens the model picker without switching', async ({ page }) => {
  await signIn(page, 'cvxa');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(page.getByText(noEndHint)).toHaveCount(0); // no model in the list takes one: nothing to point to
  // Nor while the one that takes one does not make the ratio and duration chosen: the picker would offer it disabled.
  await withEndModel(page, false);
  await page.reload();
  await expect(page.getByRole('group', { name: '③ Cảnh kết' })).toBeVisible();
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(page.getByText(noEndHint)).toHaveCount(0);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await withEndModel(page);
  await page.reload();
  // In ③ of the sections, beside the last shot; with free writing, under the photos.
  await expect(page.getByRole('group', { name: '③ Cảnh kết' }).getByText(noEndHint)).toBeVisible();
  await expect(endSlot(page)).toHaveCount(0);
  await page.getByRole('radiogroup', { name: 'Cách viết prompt' }).getByText('Viết tự do').click();
  await expect(page.getByText(noEndHint)).toBeVisible();
  await page.getByRole('button', { name: 'Chọn mô hình khác' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chọn mô hình' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(modelButton(page)).toContainText('Mock E2E'); // the member picks: another model has another price
});

test.describe('touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('at 390 px the end frame fits the form, and the loop pill, the end frame’s remove button and the hint’s link take a 44 px tap', async ({ page }) => {
    await signIn(page, 'cvxa');
    await withEndModel(page);
    await page.reload();
    const link = page.getByRole('button', { name: 'Chọn mô hình khác' });
    await link.scrollIntoViewIfNeeded();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await withExtras(page, { endFrame: true });
    await page.reload();
    await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'start.png', mimeType: 'image/png', buffer: png() });
    await loopButton(page).click();
    await expect(endPath(page)).toBeVisible();
    expect((await loopButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // The remove button draws 20 px; a tap 20 px from its middle on every side still lands on it.
    const missed = await endSlot(page)
      .getByRole('button', { name: 'Bỏ ảnh start.png' })
      .evaluate(async (el) => {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise(requestAnimationFrame);
        const r = el.getBoundingClientRect();
        const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
        return [[0, -20], [0, 20], [-20, 0], [20, 0]].filter(([dx, dy]) => !el.contains(document.elementFromPoint(x + dx!, y + dy!)));
      });
    expect(missed).toEqual([]);
    for (const part of [loopButton(page), endPath(page), endSlot(page)]) {
      const box = (await part.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
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
  await expect(page.getByText('Mẫu cần ít nhất 1 ảnh sản phẩm. Bỏ chọn mẫu để tạo video chỉ từ mô tả.')).toBeVisible(); // Run's reason alone says it (no second notice)
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
  await page.getByRole('button', { name: 'Lưu thiết lập', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lưu thiết lập' });
  await dialog.getByLabel('Tên thiết lập').fill('Kết thúc có nhạc');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu thiết lập.' })).toBeVisible();

  // A fresh form refilled from the template has the end frame and both clips back, and sends them with the Run.
  await page.goto('/create');
  await expect(endSlot(page)).toBeVisible();
  await expect(endSlot(page).getByRole('img')).toHaveCount(0);
  await openTemplates(page);
  await page.getByRole('dialog', { name: 'Thiết lập đã lưu' }).getByRole('link', { name: 'Kết thúc có nhạc' }).click();
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
  await page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('button', { name: 'Dùng lại' }).first().click();
  await expect(endSlot(page).getByRole('img', { name: 'end.png' })).toBeVisible();
  await expect(picker.getByRole('listitem')).toHaveText(['song.wav · 4.0 giây', 'voice.wav · 2.5 giây']);

  // On a model that takes neither, the template refills the image and leaves the end frame and the audio out of the Run.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto('/create');
  await openTemplates(page);
  await page.getByRole('dialog', { name: 'Thiết lập đã lưu' }).getByRole('link', { name: 'Kết thúc có nhạc' }).click();
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue('The bottle turns to face the camera.');
  await expect(endSlot(page)).toHaveCount(0);
  await expect(picker).toHaveCount(0);
  const plain = nextRun(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  expect(await plain).toMatchObject({ assetIds: sent.assetIds, params: { audio: 'on' } });
  expect((await plain).params).toEqual({ audio: 'on' });
  // The 9:16 job would otherwise show in the shared Library and break the Library spec's empty 9:16 filter; only a finished clip can be deleted.
  await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
  expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
});

test('two attached images show one chip each that puts its [ImageN] token at the caret, keeps the caret in the box, and is off once the limit leaves no room', async ({ page }) => {
  await signIn(page, 'cvxa');
  const box = page.getByRole('textbox', { name: 'Mô tả chuyển động', exact: true });
  const chips = page.getByRole('group', { name: 'Chèn ảnh vào mô tả:' });
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(png1('one.png'));
  await expect(photos(page).getByRole('img')).toHaveCount(1);
  await expect(chips).toHaveCount(0); // one image: nothing to tell apart
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(png1('two.png'));
  await expect(chips.getByRole('button')).toHaveCount(2);

  // The caret is after "put" while the focus is on the chip; the token lands there, in the order the images are listed and sent, and typing goes on after it.
  await box.fill('put on a table');
  await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 3));
  await chips.getByRole('button', { name: 'Chèn [Image2] vào mô tả (Ảnh 2)' }).click();
  await expect(box).toHaveValue('put [Image2] on a table');
  await expect(box).toBeFocused();
  await page.keyboard.type(',');
  await expect(box).toHaveValue('put [Image2], on a table');

  // A selection is replaced.
  await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 12));
  await chips.getByRole('button', { name: 'Chèn [Image1] vào mô tả (Ảnh 1)' }).click();
  await expect(box).toHaveValue('put [Image1], on a table');

  // With no room for a token the chips are off, and nothing is added.
  const max = Number(await box.getAttribute('maxlength'));
  await box.fill('x'.repeat(max - 5));
  await expect(chips.getByRole('button').first()).toBeDisabled();
  await expect(chips.getByRole('button').last()).toBeDisabled();
});
