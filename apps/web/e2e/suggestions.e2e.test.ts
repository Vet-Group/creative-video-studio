import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// Suggestions come from the e2e worker's stand-in (CVS_FAKE_SUGGEST, no fal key): "Option n: <the member's text>".
test('Gợi ý mô tả fills the brief with the picked option, and Gợi ý lời thoại fills the lines on Advanced', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/marketing-studio');
  const brief = page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' });
  await brief.fill('váy linen mùa hè');
  await page.getByRole('button', { name: 'Gợi ý mô tả' }).click();
  const options = page.getByRole('group', { name: 'Gợi ý mô tả' }).getByRole('button');
  await expect(options).toHaveText(['Option 1: váy linen mùa hè', 'Option 2: váy linen mùa hè', 'Option 3: váy linen mùa hè'], { timeout: 20_000 });
  await options.nth(1).click();
  await expect(brief).toHaveValue('Option 2: váy linen mùa hè');
  await expect(page.getByRole('group', { name: 'Gợi ý mô tả' })).toHaveCount(0);

  await page.goto('/marketing-studio/advanced');
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('ra mắt áo khoác');
  await page.getByRole('button', { name: 'Gợi ý lời thoại' }).click();
  await page.getByRole('group', { name: 'Gợi ý lời thoại' }).getByRole('button').first().click({ timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' })).toHaveValue('Option 1: ra mắt áo khoác');
});

test('a refused or failed run says so in Vietnamese', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/marketing-studio');
  await page.route('/api/suggestions', (r) => r.fulfill({ status: 429, json: { error: 'Bạn đã dùng hết 20 lượt gợi ý hôm nay. Mai hãy thử lại.' } }));
  await page.getByRole('button', { name: 'Gợi ý mô tả' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bạn đã dùng hết 20 lượt gợi ý hôm nay.' })).toBeVisible();
  await page.unroute('/api/suggestions');
  await page.route('/api/suggestions', (r) => r.fulfill({ status: 503, json: { error: 'suggestions are unavailable right now' } }));
  await page.getByRole('button', { name: 'Gợi ý mô tả' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa lấy được gợi ý lúc này, hãy thử lại sau.' })).toBeVisible();
});
