import { expect, type Page, test } from '@playwright/test';
import { png, runInUi, signIn } from './support.test';

// Native audio is on by default on Create video and on Marketing Studio's UGC format, as on Fash, for a model that can make it (the mock endpoint has
// an audio price); the switch flips, the job carries params.audio, and a model without audio shows the switch off and fixed.
const audio = (page: Page) => page.getByRole('switch', { name: 'Tạo âm thanh' });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });

/** The body of the next POST /api/jobs and the id of the job it made. */
const nextJob = (page: Page) =>
  page
    .waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/jobs'))
    .then(async (r) => ({ ...(r.request().postDataJSON() as { params: unknown; prompt: string }), id: ((await r.json()) as { id: string }).id }));

/** Deletes the spec's clip once it is done, so the shared Library the later specs filter holds none of it. */
async function remove(page: Page, id: string): Promise<void> {
  await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
  expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
}

test('Create video: Tạo âm thanh is on by default, flips, and the job carries params.audio', async ({ page }) => {
  await signIn(page, 'auda');
  await expect(audio(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.switch-row')).toContainText('Bật');
  await audio(page).click();
  await expect(audio(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.switch-row')).toContainText('Tắt');
  await audio(page).click();
  await expect(audio(page)).toHaveAttribute('aria-checked', 'true');
  const body = nextJob(page);
  await runInUi(page);
  const sent = await body;
  expect(sent.params).toEqual({ audio: 'on' });
  await remove(page, sent.id);
});

test('a model that cannot make audio shows the switch off and fixed, and its job is silent', async ({ page }) => {
  await page.route('**/api/models?*', async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { models: { audioEstimateUsd: string | null }[] };
    for (const m of json.models) m.audioEstimateUsd = null;
    await route.fulfill({ response: res, json });
  });
  await signIn(page, 'audb');
  await expect(audio(page)).toBeDisabled();
  await expect(audio(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.switch-row')).toContainText('Tắt');
  const body = nextJob(page);
  await runInUi(page);
  const sent = await body;
  expect(sent.params).toEqual({ audio: 'off' });
  await remove(page, sent.id);
});

test('Marketing Studio UGC: Tạo âm thanh is on by default and the job asks for phone sound', async ({ page }) => {
  await signIn(page, 'auda');
  await nav(page).getByRole('link', { name: 'Marketing Studio' }).click();
  await expect(page).toHaveURL(/\/marketing-studio$/);
  await expect(audio(page)).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Ảnh người mẫu').setInputFiles({ name: 'model.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await audio(page).click();
  await expect(audio(page)).toHaveAttribute('aria-checked', 'false');
  await audio(page).click();
  const body = nextJob(page);
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  const sent = await body;
  expect(sent.params).toEqual({ audio: 'on' });
  expect(sent.prompt).toMatch(/Natural sound recorded on the phone/);
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await remove(page, sent.id);
});
