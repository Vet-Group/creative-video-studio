import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

const GENERAL = 'ChatGPT, Gemini hay công cụ AI tạo ảnh chung';

for (const [path, tool] of [['/try-on', 'Thử đồ'], ['/apps/jewelry-try-on', 'Thử trang sức'], ['/apps/lingerie-try-on', 'Thử đồ lót']] as const) {
  test(`${tool}: the About tab answers why not ${GENERAL}, with its comparison table`, async ({ page }) => {
    await signIn(page, 'member1');
    await page.goto(path);
    await page.getByRole('tab', { name: 'Giới thiệu' }).click();
    await expect(page.getByRole('heading', { name: `Vì sao dùng ${tool} thay vì ${GENERAL}?` })).toBeVisible();
    const table = page.locator('.about-table').filter({ hasText: GENERAL }).first();
    await expect(table.locator('th').nth(2)).toHaveText(GENERAL);
    await expect(table.locator('th').nth(1)).toHaveText(tool);
  });
}

test('an About ends on a way back to the form, the Tạo tab on a phone and the form itself on a computer; an app adds apps of its group', async ({ page }) => {
  await signIn(page, 'member1');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/apps/lingerie-try-on');
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  // On a phone the comparison table turns into one card a row, each value under its column name.
  const table = page.locator('.about-table').filter({ hasText: GENERAL }).first();
  expect((await table.boundingBox())!.width).toBeLessThanOrEqual(390);
  expect(await table.locator('td').nth(1).evaluate((e) => getComputedStyle(e, '::before').content)).toBe('"Thử đồ lót"');
  const start = page.getByRole('region', { name: 'Bắt đầu' });
  await expect(start.getByRole('link')).toHaveText(['Tạo người mẫu AI', 'Tạo tư thế người mẫu', 'Đổi nhân vật']);
  await expect(start.getByRole('link').first()).toHaveAttribute('href', '/apps/ai-fashion-model');
  await start.getByRole('button', { name: 'Mở form' }).click();
  await expect(page.getByRole('tab', { name: 'Tạo' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#app-panel-create')).toBeInViewport();
  await expect(page.locator('#app-panel-create :focus')).toHaveCount(1);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/try-on');
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('region', { name: 'Bắt đầu' }).getByRole('link')).toHaveCount(0); // a tool page has no app group
  await page.getByRole('region', { name: 'Bắt đầu' }).getByRole('button', { name: 'Mở form' }).click();
  await expect(page.locator('#tryon-panel-create :focus')).toHaveCount(1);
  // The do and don't tags, the update date and the end box read in both themes (as e2e/a11y).
  await expect(page.locator('.about-tag[data-tone="dont"]').first()).toHaveText('Không nên');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition || (a instanceof CSSAnimation && a.animationName === 'panel-in')).map((a) => a.finished.catch(() => {}))));
    expect((await new AxeBuilder({ page }).include('article.about').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  }
});
