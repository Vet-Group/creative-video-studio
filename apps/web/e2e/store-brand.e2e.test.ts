import { expect, test } from '@playwright/test';
import { optionsOf, select, selectText, signIn } from './support.test';

// The store brand kit: a template editor fills a store's kit from the store picker on Image Generation, and a member who picks that store and turns on
// the brand kit switch runs on the mock model; the server adds the kit to the stored prompt, and the page remembers the store and the switch.

test('an editor fills a store brand kit, and a member run with the switch on stores the brand block in the job prompt and is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'branded');
  await page.goto('/image-generation');
  const store = 'Cửa hàng/Thương hiệu';
  const brand = page.getByRole('button', { name: 'Dùng bộ nhận diện', exact: true });
  await selectText(page, store, 'E2E Brand Shop');
  await expect(brand).toBeDisabled(); // no kit yet
  await page.getByRole('button', { name: 'Bộ nhận diện', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Bộ nhận diện' });
  await form.getByLabel('Phong cách thương hiệu').fill('Minimal, warm, natural light');
  await form.getByLabel('Màu thương hiệu (mã hex, cách nhau bằng dấu phẩy)').fill('#c8102e, #FFFFFF');
  await form.getByLabel('Khẩu hiệu hoặc lời kêu gọi').fill('Mặc là đẹp');
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/stores/store-brand') && r.request().method() === 'PATCH' && r.ok()),
    form.getByRole('button', { name: 'Lưu', exact: true }).click(),
  ]);
  await expect(form).toBeHidden();
  await expect(brand).toBeEnabled();

  await page.context().clearCookies(); // signed out, so /login shows its form
  await signIn(page, 'brandm');
  await page.goto('/image-generation');
  await selectText(page, store, 'E2E Brand Shop');
  await expect(page.getByRole('button', { name: 'Bộ nhận diện', exact: true })).toHaveCount(0); // only an editor or an Admin edits a kit
  await brand.click();
  await expect(brand).toHaveAttribute('aria-pressed', 'true');
  const card = page.locator('.form-card');
  await card.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen shirt on a chair');
  // the prompt preview shows the brand block the server adds, and that Enhance (on by default) rewrites it before the model gets it.
  const preview = card.locator('.prompt-preview');
  await expect(preview.locator('p')).toContainText('a linen shirt on a chair Brand style: Minimal, warm, natural light.');
  await expect(preview).toContainText('Cải thiện đang bật');
  const shown = await preview.locator('p').innerText();
  const [sent] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/jobs') && r.request().method() === 'POST'),
    card.getByRole('button', { name: /^Tạo ảnh/ }).click(),
  ]);
  expect(sent.status()).toBe(201);
  const { id } = (await sent.json()) as { id: string };
  const job = (await (await page.request.get(`/api/jobs/${id}`)).json()) as { prompt: string; brief: string; storeId: string; brand: boolean };
  expect(job.prompt).toBe(shown);
  expect(job.prompt).toBe(
    "a linen shirt on a chair Brand style: Minimal, warm, natural light. Brand colours: #C8102E, #FFFFFF, as accents in the setting and styling only; keep the product's own colours exactly as in the photos. If the prompt asks for on-screen text, use the brand tagline \"Mặc là đẹp\"; otherwise add no text.",
  );
  expect(job).toMatchObject({ brief: 'a linen shirt on a chair', storeId: 'store-brand', brand: true });

  // The page opens as the member last ran it: the store and the switch too.
  await page.reload();
  await expect(select(page, store)).toHaveText('E2E Brand Shop');
  await expect(brand).toHaveAttribute('aria-pressed', 'true');
});

// The picker's quick search folds Vietnamese diacritics, and typing then pressing Enter picks the first matching store, not the leading empty choice.
test('the store picker finds a store typed without diacritics, and Enter picks that store not the empty choice', async ({ page }) => {
  await signIn(page, 'admin');
  const code = `MP${Date.now() % 100000}`;
  expect((await page.request.post('/api/admin/stores', { data: { name: 'Mỹ Phẩm Hàn Quốc', code } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled(); // wait for hydration so the picker opens on click
  const label = 'Cửa hàng/Thương hiệu';
  await select(page, label).click();
  const search = page.getByRole('searchbox', { name: 'Chọn cửa hàng hoặc thương hiệu' });
  await search.fill('my pham'); // no diacritics
  await expect(optionsOf(page, label).filter({ hasText: 'Mỹ Phẩm Hàn Quốc' })).toHaveCount(1);
  await search.press('Enter');
  await expect(select(page, label)).toHaveText('Mỹ Phẩm Hàn Quốc');
});
