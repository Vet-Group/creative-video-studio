import { expect, test } from '@playwright/test';
import { addExamples, runViaApi, signIn } from './support.test';

test('Explore greets the member by given name and lists a job they start under Continue, without pushing a phone page sideways', async ({ page }) => {
  await signIn(page, 'explorea');
  await page.goto('/explore');
  // E2E Explore Lan: Vietnamese names put the given name last.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Chào buổi (sáng|chiều|tối), Lan$/);
  const status = page.locator('.explore-status');
  const [, left, cap] = (await status.textContent())!.match(/^Hôm nay bạn còn (\d+)\/(\d+) clip video$/)!;
  await expect(page.getByText('Bạn chưa tạo clip hay ảnh nào', { exact: false })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Việc gần đây' })).toHaveCount(0);

  await runViaApi(page);
  await page.reload();
  const recent = page.getByRole('list', { name: 'Việc gần đây' }).getByRole('link');
  await expect(recent).toHaveCount(1);
  await expect(recent).toHaveAttribute('href', '/create');
  await expect(recent).toContainText('Tạo video');
  await expect(page.getByText('Bạn chưa tạo clip hay ảnh nào', { exact: false })).toHaveCount(0);

  // The mock clip takes a few seconds; once done the card shows its poster and the day's count includes it.
  await expect.poll(async () => (await page.reload(), await recent.getAttribute('data-status')), { timeout: 60_000 }).toBe('succeeded');
  await expect(recent.locator('img')).toHaveAttribute('src', /^\/api\/assets\/[^/]+\/thumb$/);
  await expect(status).toHaveText(`Hôm nay bạn còn ${Number(left) - 1}/${cap} clip video`);

  // Finished, the card opens the result in the Library's detail view.
  await expect(recent).toHaveAttribute('href', /^\/library\?item=[0-9a-f-]+$/);
  await recent.click();
  await expect(page).toHaveURL(/\/library\?item=/);
  await expect(page.getByRole('dialog', { name: /^Chi tiết: / })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // A phone: the sideways rows fade at the edge, and each motion template shows its name without a hover.
  for (const row of [page.getByRole('list', { name: 'Việc gần đây' }), page.getByRole('list', { name: 'Mô hình' })]) await expect(row).toHaveCSS('mask-image', /linear-gradient/);
  const tile = page.getByRole('link', { name: 'Tự viết mô tả' });
  await tile.scrollIntoViewIfNeeded();
  await expect(tile.locator('.explore-prompt-hover')).toHaveCSS('opacity', '1');
});

test('the job buttons open their tools, the TikTok video on the hook effects app, in one tap a phone can hit', async ({ page }) => {
  await signIn(page, 'explorea');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  const jobs = page.getByRole('list', { name: 'Bắt đầu theo việc' }).getByRole('link');
  // Smart Remake joins only when the REA flags are on (tool-guide.test.ts), so the rest are checked whatever this machine sets.
  const hrefs = await jobs.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.filter((h) => h !== '/apps/smart-remake')).toEqual(['/apps/hook-effects', '/apps/listing-set', '/apps/mockup-pack', '/try-on', '/image-generation', '/marketing-studio']);
  for (const height of await jobs.evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) expect(height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await jobs.first().click();
  await expect(page).toHaveURL(/\/apps\/hook-effects$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hiệu ứng mở đầu' })).toBeAttached(); // the app's heading is for screen readers
});

test("a running job's elapsed time under Continue keeps counting without a reload", async ({ page }) => {
  await signIn(page, 'exploreb');
  await page.goto('/explore'); // compiled now, so the reload below is quick and finds the 4-second mock job still unfinished
  await page.clock.install();
  await runViaApi(page);
  await page.reload();
  const note = page.getByRole('list', { name: 'Việc gần đây' }).getByRole('link').first().locator('span.muted');
  await expect(note).toHaveText('Đang tạo · vừa gửi');
  // The page never polls: only the note's own one-minute tick can move the label.
  await page.clock.fastForward('02:00');
  await expect(note).toHaveText(/^Đang tạo · đã (chờ|chạy) 2 phút$/);
});

test("the day line counts what the member made today across kinds, beside the clips left of their cap", async ({ page }) => {
  await signIn(page, 'exploremix');
  await runViaApi(page);
  const image = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt: 'a picture for the day line', enhance: false, params: { resolution: '1K' } } });
  expect(image.status(), await image.text()).toBe(201);
  await page.goto('/explore');
  await expect(page.locator('.explore-status')).toHaveText(/(^| · )Hôm nay bạn còn \d+\/\d+ clip video · 1 ảnh$/); // a running job's note may come first
});

test('a first-time member sees three picture cards and a way into Try On with sample photos', async ({ page }) => {
  await signIn(page, 'explorenew', { welcome: true });
  await page.goto('/explore');
  const card = page.getByRole('region', { name: 'Bắt đầu trong 3 bước' });
  await expect(card.getByRole('listitem')).toHaveCount(3);
  await expect(card.locator('.welcome-pic')).toHaveCount(3);
  for (const pic of await card.locator('.welcome-pic img, .welcome-pic video').all()) await expect(pic).toBeVisible();
  await card.getByRole('link', { name: 'Thử ngay với ảnh mẫu' }).click();
  await expect(page).toHaveURL(/\/try-on$/);
  await expect(page.getByLabel('Ảnh trang phục')).toBeEnabled();
});

test("the hero strip shows only the Examples' thumbnails, and stands still under reduced motion", async ({ page, browser }) => {
  await signIn(page, 'explorestrip');
  const made = async (prompt: string) => {
    const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt, enhance: false, params: { resolution: '1K' } } });
    expect(res.status(), await res.text()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
    const job = (await (await page.request.get(`/api/jobs/${id}`)).json()) as { outputAssetId: string; posterAssetId: string | null };
    return { id, assets: [job.outputAssetId, job.posterAssetId].filter((a): a is string => a !== null), shown: job.posterAssetId ?? job.outputAssetId };
  };
  const shared = await made('a picture on Examples');
  const own = await made('a picture only I made');
  await addExamples(browser, [shared.id]);
  try {
    await page.goto('/explore');
    const strip = page.locator('.explore-strip');
    await expect(strip).toHaveAttribute('aria-hidden', 'true');
    const srcs = await strip.locator('img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
    expect(srcs).toContain(`/api/assets/${shared.shown}/thumb`);
    expect(srcs.some((s) => own.assets.some((a) => s?.includes(a)))).toBe(false); // a result nobody put on Examples never shows
    const track = strip.locator('.explore-strip-track');
    await expect.poll(() => track.evaluate((e) => getComputedStyle(e).animationName)).toBe('explore-strip');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => track.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    await expect(strip.locator('li[data-copy]').first()).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    const context = await browser.newContext();
    try {
      const admin = await context.newPage();
      await signIn(admin, 'admin');
      await admin.request.delete(`/api/jobs/${shared.id}/example`);
    } finally {
      await context.close();
    }
  }
});
