import { expect, type Page, test } from '@playwright/test';
import { anglePrompt, CAMERA_ANGLES } from '../src/lib/camera-angles';
import { modelButton, png, signIn } from './support.test';

// Create's multi-angle option: each picked angle makes its own clip from the same prompt plus the angle's sentence; the e2e worker runs the mock model.

const BODY = 'The model turns slowly in soft light.';
const angles = (page: Page) => page.getByRole('group', { name: /^Nhiều góc máy/ });
const runButton = (page: Page, name: RegExp) => page.getByRole('button', { name });

async function ready(page: Page): Promise<void> {
  await page.goto('/create');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('img', { name: 'shirt.png' })).toBeVisible();
  await page.getByLabel('Mô tả chuyển động').fill(BODY);
}

async function prompts(page: Page): Promise<string[]> {
  const { jobs } = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] };
  return Promise.all(jobs.map(async (j) => ((await (await page.request.get(`/api/jobs/${j.id}`)).json()) as { prompt: string }).prompt));
}

test('Create: two camera angles start two clips with different prompts, and with none picked Run is one clip as before', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'angla');
  await ready(page);
  await expect(runButton(page, /^Tạo video/)).toBeEnabled();
  await expect(angles(page).getByRole('checkbox')).toHaveCount(CAMERA_ANGLES.length);

  const [first, , third] = CAMERA_ANGLES;
  await angles(page).getByText(first!.label, { exact: true }).click();
  await angles(page).getByText(third!.label, { exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^2 clip × \$[\d.]+ = \$[\d.]+$/ })).toBeVisible();
  await expect(page.locator('.prompt-preview p')).toHaveText([anglePrompt(BODY, first!), anglePrompt(BODY, third!)]);

  const posted: { prompt: string }[] = [];
  page.on('request', (r) => r.url().endsWith('/api/jobs') && r.method() === 'POST' && posted.push(r.postDataJSON()));
  await runButton(page, /^Tạo 2 clip/).click();
  await page.getByRole('dialog', { name: /^Tạo 2 clip/ }).getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.getByText('Đã gửi 2 clip')).toBeVisible();
  expect(posted.map((p) => p.prompt)).toEqual([anglePrompt(BODY, first!), anglePrompt(BODY, third!)]);
  expect((await prompts(page)).sort()).toEqual([anglePrompt(BODY, first!), anglePrompt(BODY, third!)].sort());
});

test('Create: a refused angle stops the rest and says how many clips went, and the chips fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page, 'anglb');
  await ready(page);
  for (const a of CAMERA_ANGLES.slice(0, 3)) await angles(page).getByText(a.label, { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  let posts = 0;
  await page.route('**/api/jobs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    if (posts === 2) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Bạn đã dùng hết số clip trong ngày hôm nay' }) });
    return route.continue();
  });
  await runButton(page, /^Tạo 3 clip/).click();
  await page.getByRole('dialog', { name: /^Tạo 3 clip/ }).getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.locator('.form-message').getByRole('alert')).toContainText('Bạn đã dùng hết số clip trong ngày hôm nay Đã gửi 1/3 clip.');
  expect(posts).toBe(2);
  expect(await prompts(page)).toEqual([anglePrompt(BODY, CAMERA_ANGLES[0]!)]);
});
