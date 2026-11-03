import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// Suggestions come from the e2e worker's stand-in (CVS_FAKE_SUGGEST, no fal key): "Option n: <the member's text>".
test('Gợi ý AI fills the brief with the picked option and can be undone, and Gợi ý lời thoại fills the lines on Advanced', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'sugga');
  await page.goto('/marketing-studio');
  // The label stays one line with its Optional chip; the tools sit in the box's toolbar, under the text.
  const label = (await page.locator('label', { hasText: 'Prompt' }).first().boundingBox())!;
  expect(label.height).toBeLessThanOrEqual(22);
  const brief = page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' });
  const ai = page.getByRole('button', { name: 'Gợi ý AI' });
  expect((await ai.boundingBox())!.y).toBeGreaterThan((await brief.boundingBox())!.y);
  expect((await page.getByRole('button', { name: 'Mở rộng' }).boundingBox())!.y).toBeGreaterThan((await brief.boundingBox())!.y);
  // Starter chips while the box is empty; one click fills it, and they go.
  const starters = page.getByRole('group', { name: 'Gợi ý nhanh' });
  await starters.getByRole('button', { name: 'Mở hộp' }).click();
  await expect(brief).toHaveValue(/^Người sáng tạo mở hộp/);
  await expect(starters).toHaveCount(0);
  await brief.fill('váy linen mùa hè');
  await ai.click();
  const options = page.getByRole('group', { name: 'Gợi ý AI' }).getByRole('button', { name: /^Option/ });
  await expect(options).toHaveText(['Option 1: váy linen mùa hè', 'Option 2: váy linen mùa hè', 'Option 3: váy linen mùa hè'], { timeout: 20_000 });
  // The list hangs under the box, as wide as it.
  const box = (await brief.locator('..').boundingBox())!;
  const list = (await page.getByRole('group', { name: 'Gợi ý AI' }).boundingBox())!;
  expect(list.y).toBeGreaterThan(box.y);
  expect(Math.abs(list.x - box.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(list.width - box.width)).toBeLessThanOrEqual(3);
  let asks = 0;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && asks++);
  await options.nth(1).click();
  await expect(brief).toHaveValue('Option 2: váy linen mùa hè');
  await expect(brief).toBeFocused(); // the pick puts the caret back in the box
  await expect(page.getByRole('group', { name: 'Gợi ý AI' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(brief).toHaveValue('váy linen mùa hè');
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toHaveCount(0);
  // The three options are still there: opening the list again costs no run of the daily cap, and Escape hands the focus back.
  await ai.click();
  await expect(options).toHaveCount(3);
  expect(asks).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Gợi ý AI' })).toHaveCount(0);
  await expect(ai).toBeFocused();
  // The clear button empties the box (back to the starter chips) and can be undone too.
  await page.getByRole('button', { name: 'Xoá prompt' }).click();
  await expect(brief).toHaveValue('');
  await expect(brief).toBeFocused();
  await expect(starters).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá prompt' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(brief).toHaveValue('váy linen mùa hè');

  await page.goto('/marketing-studio/advanced');
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('ra mắt áo khoác');
  await page.getByRole('button', { name: 'Gợi ý lời thoại' }).click();
  await page.getByRole('group', { name: 'Gợi ý lời thoại' }).getByRole('button', { name: /^Option/ }).first().click({ timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' })).toHaveValue('Option 1: ra mắt áo khoác');
});

test('every other prompt asks for its own tool: Create sends the video feature and fills the box', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/create');
  let sent: unknown;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && (sent = r.postDataJSON()));
  await page.getByLabel('Mô tả chuyển động').fill('slow turn');
  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  await page.getByRole('group', { name: 'Gợi ý AI' }).getByRole('button', { name: /^Option 3/ }).click({ timeout: 20_000 });
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue('Option 3: slow turn');
  expect(sent).toMatchObject({ field: 'prompt', feature: 'video', text: 'slow turn' });
});

test('a refused or failed run says so in Vietnamese', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/marketing-studio');
  await page.route('/api/suggestions', (r) => r.fulfill({ status: 429, json: { error: 'Bạn đã dùng hết 20 lượt gợi ý hôm nay. Mai hãy thử lại.' } }));
  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bạn đã dùng hết 20 lượt gợi ý hôm nay.' })).toBeVisible();
  await page.unroute('/api/suggestions');
  await page.route('/api/suggestions', (r) => r.fulfill({ status: 503, json: { error: 'suggestions are unavailable right now' } }));
  await page.getByRole('button', { name: 'Gợi ý khác' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa lấy được gợi ý lúc này, hãy thử lại sau.' })).toBeVisible();
});
