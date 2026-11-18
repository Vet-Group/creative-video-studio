import { expect, test } from '@playwright/test';
import { addExamples, clearMyJobs, openTab, signIn } from './support.test';

test("Create's Examples shows the loading skeleton, not the built-in test patterns, until its lists have answered", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const stills: string[] = [];
  page.on('request', (r) => r.url().includes('/fixtures/examples/') && r.url().endsWith('.jpg') && stills.push(new URL(r.url()).pathname));
  await signIn(page, 'quicka');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  // Neither the sample list nor the company's clips answer until the gate opens.
  await page.route('**/api/samples', async (r) => (await gate, r.fallback()));
  await page.route(/\/api\/library\?kind=video&example=1/, async (r) => (await gate, r.fallback()));
  await page.goto('/create');
  await expect(page.getByRole('tab', { name: 'Ví dụ' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.side .library-skeleton')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Video ví dụ' })).toHaveCount(0);
  await page.waitForTimeout(1_000); // a stand-in would be requested within this time
  expect(stills).toEqual([]);

  release();
  await expect(page.getByRole('group', { name: 'Video ví dụ' })).toBeVisible();
  await expect(page.locator('.side .library-skeleton')).toHaveCount(0);
  await expect(page.locator('.example').first()).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test("an image result's Examples tile loads the small preview, fades in, and its Dùng ví dụ này pill fits inside the tile on a phone", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'quicka');
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt: 'a picture for the tile', enhance: false, params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  try {
    await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
    const done = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; posterAssetId: string | null; outputAssetId: string }[] }).jobs.find((j) => j.id === id)!;
    const shown = done.posterAssetId ?? done.outputAssetId;
    await addExamples(browser, [id]);
    const originals: string[] = [];
    page.on('request', (r) => r.url().includes(`/api/assets/${shown}/content`) && originals.push(r.url()));
    await page.goto('/image-generation');
    await openTab(page, 'Ví dụ');
    const tile = page.locator(`.gallery-item:has(img[src="/api/assets/${shown}/thumb"])`);
    await expect(tile).toBeVisible();
    // The grid takes the 512 px preview; the original is for the details.
    expect(originals).toEqual([]);
    const picture = tile.locator('img');
    await expect(picture).toHaveClass(/loaded/);
    expect(await picture.evaluate((img) => [getComputedStyle(img).opacity, getComputedStyle(img).transitionProperty])).toEqual(['1', 'opacity']);
    const [pill, box] = [await tile.locator('.gallery-use').boundingBox(), await tile.boundingBox()];
    expect(pill).not.toBeNull();
    expect(pill!.x).toBeGreaterThanOrEqual(box!.x);
    expect(pill!.x + pill!.width).toBeLessThanOrEqual(box!.x + box!.width);
    expect(pill!.y + pill!.height).toBeLessThanOrEqual(box!.y + box!.height);
  } finally {
    await clearMyJobs(page);
  }
});
