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
