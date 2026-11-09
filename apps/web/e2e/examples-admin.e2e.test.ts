// An Admin's tools for the results on the Examples tabs: the Library's "on Examples" filter and chip, and the tab's own order.
import { expect, type Page, test } from '@playwright/test';
import { addExamples, png, signIn } from './support.test';

async function marketingClip(page: Page): Promise<string> {
  const ids: string[] = [];
  for (const name of ['order-person.png', 'order-product.png']) {
    const up = await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } });
    expect(up.status()).toBe(201);
    ids.push(((await up.json()) as { assets: { id: string }[] }).assets[0]!.id);
  }
  const res = await page.request.post('/api/jobs', { data: { feature: 'marketing', modelId: 'mock-e2e', assetIds: ids, ratio: '9:16', durationSec: 5, prompt: 'composed', params: { audio: 'off' } } });
  expect(res.status(), await res.text()).toBe(201);
  const id = ((await res.json()) as { id: string }).id;
  await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
  return id;
}

const tabOrder = async (page: Page) => ((await (await page.request.get('/api/examples?feature=marketing')).json()) as { examples: { id: string; posterAssetId: string }[] }).examples;

test('an Admin filters the Library to the results on Ví dụ, each with its chip, and orders a tab by moving a row', async ({ page, browser }) => {
  await signIn(page, 'admin');
  const older = await marketingClip(page);
  const newer = await marketingClip(page);
  await addExamples(browser, [older, newer]);

  // The Library: only results on a tab, each marked.
  await page.goto('/library');
  const listed = page.waitForResponse((r) => r.url().includes('/api/library?') && r.url().includes('example=1'));
  await page.getByRole('checkbox', { name: 'Đang ở Ví dụ' }).check();
  const body = (await (await listed).json()) as { clips: { id: string; example: boolean }[] };
  expect(body.clips.map((c) => c.id)).toEqual(expect.arrayContaining([older, newer]));
  expect(body.clips.every((c) => c.example)).toBe(true);
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(body.clips.length);
  for (const card of await cards.all()) await expect(card.locator('.lib-chip', { hasText: 'Ví dụ' })).toBeVisible();

  // The tab: added last means shown first, until an Admin moves the older one ahead and saves.
  const before = (await tabOrder(page)).map((e) => e.id);
  expect(before.indexOf(newer)).toBeLessThan(before.indexOf(older));
  const poster = (await tabOrder(page)).find((e) => e.id === older)!.posterAssetId;
  await page.goto('/marketing-studio');
  await page.getByRole('button', { name: 'Sắp xếp ví dụ' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sắp xếp ví dụ' });
  const row = dialog.getByRole('listitem').filter({ has: page.locator(`img[src="/api/assets/${poster}/thumb"]`) });
  await expect(row).toHaveCount(1);
  for (let i = before.indexOf(older); i > before.indexOf(newer); i--) await row.getByRole('button', { name: /^Lên trước/ }).click();
  await dialog.getByRole('button', { name: 'Lưu thứ tự' }).click();
  await expect(dialog).toBeHidden();
  const after = (await tabOrder(page)).map((e) => e.id);
  expect(after.indexOf(older)).toBeLessThan(after.indexOf(newer));
  expect(after).toHaveLength(before.length);
  const shown = ((await (await page.request.get('/api/library?kind=marketing&example=1')).json()) as { clips: { id: string }[] }).clips.map((c) => c.id);
  expect(shown.slice(0, after.length)).toEqual(after);
});

test('a member sees neither the Library filter nor the order button', async ({ page }) => {
  await signIn(page, 'member6');
  await page.goto('/library');
  await expect(page.getByRole('checkbox', { name: 'Chỉ mục yêu thích' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Đang ở Ví dụ' })).toHaveCount(0);
  await page.goto('/marketing-studio');
  await expect(page.getByRole('tab', { name: 'Ví dụ' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Sắp xếp ví dụ' })).toHaveCount(0);
});
