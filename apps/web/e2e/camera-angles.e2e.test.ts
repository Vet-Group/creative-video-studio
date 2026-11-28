import { expect, type Page, test } from '@playwright/test';
import { anglePrompt, CAMERA_ANGLES } from '../src/lib/camera-angles';
import { modelButton, png, signIn } from './support.test';

// Create's multi-angle option: each picked angle makes its own clip from the same prompt plus the angle's sentence; the e2e worker runs the mock model.

const BODY = 'The model turns slowly in soft light.';
const angles = (page: Page) => page.getByRole('group', { name: /^Nhiều góc máy/ });
const runButton = (page: Page, name: RegExp) => page.getByRole('button', { name });
const tile = (page: Page, label: string) => angles(page).locator('label', { has: page.getByText(label, { exact: true }) });
/** The tiles whose shirt is moving, by their place in the list. */
const moving = (page: Page) => angles(page).locator('.cam-world').evaluateAll((ws) => ws.flatMap((w, i) => (w.getAnimations().length > 0 ? [i] : [])));

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
  // Picked in reverse: Run still makes the clips in the list's order, and each picked tile shows its clip's number in it.
  await angles(page).getByText(third!.label, { exact: true }).click();
  await angles(page).getByText(first!.label, { exact: true }).click();
  await expect(tile(page, first!.label).locator('.cam-order')).toHaveText('1');
  await expect(tile(page, third!.label).locator('.cam-order')).toHaveText('2');
  await expect(angles(page).locator('.cam-order')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: /^2 clip × \$[\d.]+ = \$[\d.]+$/ })).toBeVisible();
  // The preview names each clip's prompt by its angle.
  await expect(page.locator('.prompt-preview p')).toHaveText([`${first!.label}: ${anglePrompt(BODY, first!)}`, `${third!.label}: ${anglePrompt(BODY, third!)}`]);

  const posted: { prompt: string; params: { batch?: string } }[] = [];
  page.on('request', (r) => r.url().endsWith('/api/jobs') && r.method() === 'POST' && posted.push(r.postDataJSON()));
  await runButton(page, /^Tạo 2 clip/).click();
  await page.getByRole('dialog', { name: /^Tạo 2 clip/ }).getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.getByText('Đã gửi 2 clip')).toBeVisible();
  expect(posted.map((p) => p.prompt)).toEqual([anglePrompt(BODY, first!), anglePrompt(BODY, third!)]);
  // One Run of two clips: one shared batch id, by which the week's Run count counts it once.
  expect(new Set(posted.map((p) => p.params.batch)).size).toBe(1);
  expect(posted[0]!.params.batch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect((await prompts(page)).sort()).toEqual([anglePrompt(BODY, first!), anglePrompt(BODY, third!)].sort());
});

test('Create: a refused angle stops the rest and says how many clips went, and the tiles fit a phone', async ({ page }) => {
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

test('Create: a camera tile plays its move on hover, on keyboard focus and while picked, Space picks it, and under reduced motion nothing moves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await signIn(page, 'anglc');
  await ready(page);
  await angles(page).scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect.poll(() => moving(page)).toEqual([]);
  await angles(page).getByText(CAMERA_ANGLES[2]!.label, { exact: true }).hover();
  await expect.poll(() => moving(page)).toEqual([2]);

  // The keyboard reaches each tile as a checkbox: the focused one plays, Space picks it, and a picked one keeps playing once the focus moves on.
  await page.mouse.move(0, 0);
  const boxes = angles(page).getByRole('checkbox');
  await boxes.nth(1).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(boxes.first()).toBeFocused();
  await expect.poll(() => moving(page)).toEqual([0]);
  await page.keyboard.press('Space');
  await expect(boxes.first()).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(boxes.nth(1)).toBeFocused();
  await expect.poll(() => moving(page)).toEqual([0, 1]);

  // Reduced motion: nothing plays, picked, focused or hovered, and every tile keeps its arrow as the hint.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await angles(page).getByText(CAMERA_ANGLES[3]!.label, { exact: true }).hover();
  await expect.poll(() => moving(page)).toEqual([]);
  for (const glyph of await angles(page).locator('.cam-glyph').all()) await expect(glyph).toBeVisible();
});
