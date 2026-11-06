import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { HOOKS } from '../src/lib/marketing';
import { clearMyJobs, openTab, png, runViaApi, signIn } from './support.test';

// Marketing Studio's reference video (Advanced only) and the Example detail's hook buttons. The mock models take no reference video (the models API reads it from
// fal's request builders), so the first test gives them the capability in the models answer and catches the Run's body; the second runs the mock model as it is.

const SHOTS = 'C:/Users/User/AppData/Local/Temp/claude/ec29f026d20d029c/2a93dc5d-2e6f-4ba0-82ec-5c6946023ed4/scratchpad/shots';
const hook = HOOKS.find((h) => h.id === 'product-catch')!;
const ENDING = 'The clip ends on a smiling close-up of the product.';
const OWN_HOOK = 'A hand slams the door open.';
const NO_VIDEO = 'Mô hình này không nhận video tham chiếu. Bỏ video hoặc chọn mô hình khác.';
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const reasonOf = (page: Page) => page.locator('.form-message').getByRole('status');
const brief = (page: Page) => page.getByRole('textbox', { name: 'Prompt', exact: true });
const part = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const hookPart = (page: Page) => part(page, '① Hook · 0–2 giây đầu');
const refsInput = (page: Page) => page.getByRole('group', { name: 'Ảnh tham chiếu' }).getByLabel('Ảnh tham chiếu', { exact: true });
const videoSlot = (page: Page) => page.getByRole('group', { name: 'Video tham chiếu', exact: true });

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../public/fixtures/examples/${name}`, import.meta.url)));
const json = (v: object) => Buffer.from(JSON.stringify(v));
const details = { feature: 'marketing', images: [{ sample: 'marketing-example-1-product.png' }], audio: 'on', ratio: '9:16', durationSec: 5, modelId: null, date: '2026-08-18' };
const samples: [string, Buffer, string][] = [
  ['marketing-example-1.mp4', fixture('example-1.mp4'), 'video/mp4'], ['marketing-example-1.jpg', fixture('example-1.jpg'), 'image/jpeg'],
  ['marketing-example-1.json', json({ ...details, format: 'advanced', hook: hook.id, ending: ENDING, brief: 'A woman surfs at dawn.' }), 'application/json'],
  ['marketing-example-2.mp4', fixture('example-1.mp4'), 'video/mp4'], ['marketing-example-2.jpg', fixture('example-1.jpg'), 'image/jpeg'],
  ['marketing-example-2.json', json({ ...details, format: 'advanced', hook: null, hookText: OWN_HOOK, brief: 'A door opens.' }), 'application/json'],
  ['marketing-example-3.mp4', fixture('example-1.mp4'), 'video/mp4'], ['marketing-example-3.jpg', fixture('example-1.jpg'), 'image/jpeg'],
  ['marketing-example-3.json', json({ ...details, format: 'advanced', hook: null, brief: 'A quiet shot.' }), 'application/json'],
  ['marketing-example-1-product.png', png(), 'image/png'],
];

/** The example samples uploaded as an Admin for the body of `run`, and removed after. */
async function withSamples(page: Page, run: () => Promise<void>): Promise<void> {
  const asAdmin = async (each: (name: string, data: Buffer, type: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const [name, data, type] of samples) expect((await each(name, data, type)).ok(), name).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name, data, type) => page.request.put(`/api/admin/samples/${name}`, { data, headers: { 'content-type': type } }));
  try {
    await run();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
}

/** The mock models with the reference video the models API would give a fal model that takes one. */
async function withVideoRefs(page: Page): Promise<void> {
  await page.route('**/api/models?*', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { models: Record<string, unknown>[] };
    for (const m of body.models) m.videoRefs = { max: 1, minSec: 1, maxSec: 15, maxMb: 50, maxImages: null };
    await route.fulfill({ response: res, json: body });
  });
}

/** The body of the next Run; the job is answered as queued and never made, since the mock model would refuse the video. */
function nextRun(page: Page): Promise<{ assetIds: string[]; prompt: string; params: Record<string, string> }> {
  return new Promise((resolve) => {
    void page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      resolve(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: 'caught', status: 'queued' } });
    });
  });
}

/** Opens Ví dụ, then the details of the example with this index (1-based among the three) and returns its dialog. */
async function openExample(page: Page, n: number) {
  await openTab(page, 'Ví dụ');
  const gallery = page.getByRole('group', { name: 'Video Marketing Studio của công ty' });
  await expect(gallery.getByRole('link', { name: 'Xem chi tiết video mẫu' })).toHaveCount(3);
  await gallery.getByRole('link', { name: 'Xem chi tiết video mẫu' }).nth(n - 1).click();
  const dialog = page.getByRole('dialog', { name: 'Chi tiết: Nâng cao' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test('Advanced: an Example becomes the reference video, the prompt names it, and the Run sends it as params.videoAssetId', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withSamples(page, async () => {
    await signIn(page, 'mktv');
    await page.goto('/marketing-studio/advanced');
    await withVideoRefs(page);
    await page.reload();
    await expect(refsInput(page)).toBeEnabled(); // files set before hydration are dropped
    await refsInput(page).setInputFiles(file('product.png'));
    await brief(page).fill('A woman walks along the shore.');
    await expect(videoSlot(page)).toContainText('Tuỳ chọn');
    await expect(videoSlot(page).getByRole('button', { name: 'Tải lên video tham chiếu' })).toBeVisible();

    const detail = await openExample(page, 1);
    await detail.getByRole('button', { name: 'Dùng làm video tham chiếu' }).click();
    await expect(videoSlot(page).getByRole('list', { name: 'Video tham chiếu: video đã chọn' })).toBeVisible();
    await expect(videoSlot(page)).toContainText('2.0 giây'); // the copy is the member's own asset, with its length from the file
    await page.keyboard.press('Escape');
    await expect(page.getByText('pace of [Video1]')).toBeVisible(); // the prompt preview names it in one sentence
    await expect(reasonOf(page)).toHaveCount(0);

    await page.screenshot({ path: `${SHOTS}/r4-video-1280.png`, fullPage: false });
    const run = nextRun(page);
    await runButton(page).click();
    const sent = await run;
    expect(sent.params).toMatchObject({ format: 'advanced', videoAssetId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(sent.prompt).toContain('Follow the motion, camera framing and pace of [Video1];');
    expect(sent.assetIds).toHaveLength(1);
    const asset = (await (await page.request.get(`/api/assets/${sent.params.videoAssetId}`)).json()) as { kind: string; mime: string };
    expect([asset.kind, asset.mime]).toEqual(['input', 'video/mp4']); // the member's own input, not the sample

    // The phone layout: the form tab, with the video set.
    await page.setViewportSize({ width: 390, height: 844 });
    await openTab(page, 'Tạo');
    await videoSlot(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/r4-video-390.png`, fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test('Advanced: a model that takes no reference video says so and cannot Run until the video is removed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withSamples(page, async () => {
    await signIn(page, 'mktv');
    await page.goto('/marketing-studio/advanced');
    await expect(refsInput(page)).toBeEnabled();
    await refsInput(page).setInputFiles(file('product.png'));
    await brief(page).fill('A woman walks along the shore.');
    await expect(runButton(page)).toBeEnabled();

    const detail = await openExample(page, 1);
    await detail.getByRole('button', { name: 'Dùng làm video tham chiếu' }).click(); // Mock E2E has no videoRefs
    await page.keyboard.press('Escape');
    await expect(reasonOf(page)).toHaveText(NO_VIDEO);
    await expect(runButton(page)).toBeDisabled();
    await videoSlot(page).getByRole('button', { name: /^Bỏ video / }).click();
    await expect(reasonOf(page)).toHaveCount(0);
    await expect(runButton(page)).toBeEnabled();
  });
});

test('Example detail: Dùng hook này fills ① and ③ only, Lưu thành hook của tôi saves and chooses the hook, and both hide or disable where they do not apply', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withSamples(page, async () => {
    await signIn(page, 'mktw');
    await page.goto('/marketing-studio/advanced');
    await expect(refsInput(page)).toBeEnabled();
    await refsInput(page).setInputFiles(file('product.png'));
    await brief(page).fill('My own body about a bag.');

    // An example with a library hook and an ending: ① and ③ are filled, the photo and the body stay.
    let detail = await openExample(page, 1);
    await expect(detail.getByRole('button', { name: 'Lưu thành hook của tôi' })).toBeVisible();
    await detail.getByRole('button', { name: 'Dùng hook này' }).click();
    await page.keyboard.press('Escape');
    await expect(hookPart(page).getByRole('button', { name: /^Hook/ })).toContainText(hook.name);
    await expect(page.getByRole('textbox', { name: 'Cảnh kết (tuỳ chọn)' })).toHaveValue(ENDING);
    await expect(brief(page)).toHaveValue('My own body about a bag.');
    await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();

    // An example with its own hook words only: the words go in ① Hook text, the library hook is let go, the ending stays.
    detail = await openExample(page, 2);
    await detail.getByRole('button', { name: 'Dùng hook này' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Hook tự viết (tuỳ chọn)' })).toHaveValue(OWN_HOOK);
    await expect(hookPart(page).getByRole('button', { name: /^Hook/ })).not.toContainText(hook.name);
    await expect(page.getByRole('textbox', { name: 'Cảnh kết (tuỳ chọn)' })).toHaveValue(ENDING);

    // Saved as the member's own hook: listed, chosen, with the words as its phrase.
    detail = await openExample(page, 2);
    await detail.getByRole('button', { name: 'Lưu thành hook của tôi' }).click();
    await page.keyboard.press('Escape');
    await expect(hookPart(page).getByRole('button', { name: /^Hook/ })).toContainText('Nâng cao - ví dụ 2');
    const mine = (await (await page.request.get('/api/choices?kind=hook')).json()) as { hooks: { name: string; phrase: string; mine: boolean; imageAssetId: string | null }[] };
    expect(mine.hooks.find((h) => h.mine)).toMatchObject({ name: 'Nâng cao - ví dụ 2', phrase: OWN_HOOK, imageAssetId: expect.any(String) }); // the poster, copied as the member's asset

    // An example with no hook: nothing to save, and nothing to fill.
    detail = await openExample(page, 3);
    await expect(detail.getByRole('button', { name: 'Lưu thành hook của tôi' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Dùng hook này' })).toBeDisabled();
  });
});

test('Advanced: a clip of the member’s History becomes the reference video, copied as their own input', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'mktx');
  await runViaApi(page);
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs[0]?.status, { timeout: 60_000 }).toBe('succeeded');
  try {
    await page.goto('/marketing-studio/advanced');
    await expect(refsInput(page)).toBeEnabled();
    await videoSlot(page).getByRole('button', { name: 'Từ Lịch sử' }).click();
    await page.getByRole('dialog', { name: 'Chọn video từ Lịch sử' }).getByRole('button', { name: 'Dùng video 1 từ Lịch sử' }).click();
    await expect(videoSlot(page).getByRole('list', { name: 'Video tham chiếu: video đã chọn' })).toBeVisible();
    await expect(videoSlot(page).getByRole('button', { name: 'Từ Lịch sử' })).toHaveCount(0); // the slot is full
    const kept = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { outputAssetId: string }[] };
    const src = await videoSlot(page).locator('video').getAttribute('src');
    expect(src).toMatch(/^\/api\/assets\/[0-9a-f-]{36}\/content$/);
    expect(src).not.toContain(kept.jobs[0]!.outputAssetId); // a copy, not the output itself
  } finally {
    await clearMyJobs(page);
  }
});
