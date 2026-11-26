// Between 1024 and 1279 px the form and the About side by side leave the About about 340 px; while it is shown the page is one column instead.
import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

const PAGES = [
  ['/create', 'create'],
  ['/try-on', 'tryon'],
  ['/marketing-studio', 'marketing'],
  ['/apps/lingerie-try-on', 'app'],
] as const;

for (const [path, prefix] of PAGES) {
  test(`${path}: at 1024 px the About reads at full width under the tabs, and Mở form reaches the form below it`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signIn(page, 'member1');
    await page.goto(path);
    await page.getByRole('tab', { name: 'Giới thiệu' }).click();
    const about = page.locator('article.about');
    await expect(about).toBeVisible();
    expect((await about.boundingBox())!.width).toBeGreaterThanOrEqual(600);
    const tabs = (await page.locator('.create-grid > .tabs').boundingBox())!;
    const box = (await about.boundingBox())!;
    expect(box.y).toBeLessThan(768);
    expect(box.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
    const form = (await page.locator(`#${prefix}-panel-create`).boundingBox())!;
    expect(form.y).toBeGreaterThan(box.y + box.height - 1); // the form sits below the About
    await about.getByRole('button', { name: 'Mở form' }).click();
    await expect(page.locator(`#${prefix}-panel-create :focus`)).toHaveCount(1);
    await expect(page.locator(`#${prefix}-panel-create`)).toBeInViewport();
  });

  test(`${path}: at 1280 px the About stays beside the form`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, 'member1');
    await page.goto(path);
    await page.getByRole('tab', { name: 'Giới thiệu' }).click();
    await expect(page.locator('article.about')).toBeVisible();
    const form = (await page.locator(`#${prefix}-panel-create`).boundingBox())!;
    expect((await page.locator('article.about').boundingBox())!.x).toBeGreaterThan(form.x + form.width);
  });
}

test('at 1100 px the other tabs keep the form beside them and only the About goes full width', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await signIn(page, 'member1');
  await page.goto('/try-on');
  const form = (await page.locator('#tryon-panel-create').boundingBox())!;
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  expect((await page.locator('.side').boundingBox())!.x).toBeGreaterThan(form.x + form.width);
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  const width = (await page.locator('article.about').boundingBox())!.width;
  expect(width).toBeGreaterThanOrEqual(600);
  expect(width).toBeLessThanOrEqual(736); // Try On's About reads at the same 46rem as the others in one column
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  expect((await page.locator('#tryon-panel-create').boundingBox())!.y).toBeLessThan(400);
});
