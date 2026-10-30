import { expect, test } from '@playwright/test';
import { modelButton, optionsOf, pickModel, select, selectText, signIn } from './support.test';

// As on Fash's Nano Banana 2.1, a model that lists thinking levels (serve.ts gives the mock Solo row 2.1's three) shows the select, Minimal first,
// and Run sends the chosen level; a model without levels shows none and sends none. The Run button's estimate follows the level: a mock model is
// priced at 0, so the spec gives the levels of its answer the 2.1 fal 1K prices.
test('Image Generation offers the thinking level only on a model that lists one, prices the Run at the chosen level, and Run sends it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'thinka');
  const price: Record<string, string> = { minimal: '0.0400', medium: '0.0473', high: '0.0618' };
  await page.route('**/api/image-models?feature=image', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { models: { id: string; prices: Record<string, string>; thinkingPrices: Record<string, Record<string, string>> }[] };
    const solo = body.models.find((m) => m.id === 'mock-image-solo')!;
    expect(solo.thinkingPrices).toEqual({ minimal: { '1K': '0.0000' }, medium: { '1K': '0.0000' }, high: { '1K': '0.0000' } });
    solo.prices = { '1K': price.minimal! };
    solo.thinkingPrices = Object.fromEntries(Object.entries(price).map(([t, usd]) => [t, { '1K': usd }]));
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/image-generation');
  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  const thinking = select(page, 'Mức suy luận');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(thinking).toHaveCount(0);

  await pickModel(page, /Mock image Solo/);
  const cost = bar.getByRole('button', { name: /^Tạo ảnh/ }).locator('.run-cost');
  await expect(thinking).toHaveAttribute('data-value', 'minimal');
  await expect(cost).toHaveText('· $0.0400');
  await thinking.click();
  await expect(optionsOf(page, 'Mức suy luận')).toHaveText(['Tối thiểu', 'Vừa', 'Cao']);
  await thinking.click();
  await selectText(page, 'Mức suy luận', 'Vừa');
  await expect(cost).toHaveText('· $0.0473');
  await selectText(page, 'Mức suy luận', 'Cao');
  await expect(thinking).toHaveAttribute('data-value', 'high');
  await expect(cost).toHaveText('· $0.0618');

  await bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('a linen dress on a hanger');
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/jobs') && r.request().method() === 'POST');
  await bar.getByRole('button', { name: /^Tạo ảnh/ }).click();
  const res = await sent;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON()).toMatchObject({ modelId: 'mock-image-solo', params: { resolution: '1K', thinking: 'high' } });

  await pickModel(page, /Mock image E2E/);
  await expect(thinking).toHaveCount(0);
});
