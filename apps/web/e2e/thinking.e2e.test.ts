import { expect, test } from '@playwright/test';
import { modelButton, optionsOf, pickModel, select, selectText, signIn } from './support.test';

// As on Fash's Nano Banana 2.1, a model that lists thinking levels (serve.ts gives the mock Solo row 2.1's three) shows the select, Minimal first,
// and Run sends the chosen level; a model without levels shows none and sends none.
test('Image Generation offers the thinking level only on a model that lists one, and Run sends the chosen level', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'thinka');
  await page.goto('/image-generation');
  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  const thinking = select(page, 'Mức suy luận');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(thinking).toHaveCount(0);

  await pickModel(page, /Mock image Solo/);
  await expect(thinking).toHaveAttribute('data-value', 'minimal');
  await thinking.click();
  await expect(optionsOf(page, 'Mức suy luận')).toHaveText(['Tối thiểu', 'Vừa', 'Cao']);
  await thinking.click();
  await selectText(page, 'Mức suy luận', 'Cao');
  await expect(thinking).toHaveAttribute('data-value', 'high');

  await bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('a linen dress on a hanger');
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/jobs') && r.request().method() === 'POST');
  await bar.getByRole('button', { name: /^Tạo ảnh/ }).click();
  const res = await sent;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON()).toMatchObject({ modelId: 'mock-image-solo', params: { resolution: '1K', thinking: 'high' } });

  await pickModel(page, /Mock image E2E/);
  await expect(thinking).toHaveCount(0);
});
