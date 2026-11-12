import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// The analysis page's push-prompt action opens Create with the shot's English prompt already in the free prompt box (?prompt=).
// Flag-independent: ?prompt= is a Create capability, so this spec does not need REA_ANALYZE_ENABLED.
test('a prompt in the Create link seeds the free prompt box', async ({ page }) => {
  const text = 'Model poses to showcase a plain white t-shirt in soft studio light.';
  await signIn(page, 'cvpr');
  await page.goto(`/create?prompt=${encodeURIComponent(text)}`);
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(text);
  // The seed shows free mode for this visit only; it must not persist over the member's remembered prompt-mode.
  expect(await page.evaluate(() => localStorage.getItem('cvs.prompt-mode.video'))).toBeNull();
});
