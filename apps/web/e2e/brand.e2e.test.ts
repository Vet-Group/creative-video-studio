import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// VET identity: the logo in the shell and the red primary and link colours. The parity screenshots keep the Fash colours (e2e/screenshot.css), so these checks hold the brand.

test.describe('wide', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('the sidebar brand shows the 28x28 VET logo, the primary button is VET red and links are the darker red', async ({ page }) => {
    await signIn(page, 'member1');
    const logo = page.locator('.brand .vet-logo');
    await expect(logo).toBeVisible();
    const b = (await logo.boundingBox())!;
    expect([Math.round(b.width), Math.round(b.height)]).toEqual([28, 28]);
    const run = page.getByRole('button', { name: 'Tạo video' });
    expect(await run.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(220, 38, 38)');
    const link = await page.evaluate(() => {
      const a = document.body.appendChild(Object.assign(document.createElement('a'), { href: '#x', textContent: 'x' }));
      const color = getComputedStyle(a).color;
      a.remove();
      return color;
    });
    expect(link).toBe('rgb(185, 28, 28)');
  });
});

test.describe('narrow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the top bar shows the VET logo at its right end and keeps the title at x=52', async ({ page }) => {
    await signIn(page, 'member1');
    const logo = page.locator('.topbar > .vet-logo');
    await expect(logo).toBeVisible();
    const b = (await logo.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(390 - 6 + 0.5);
    expect(Math.round((await page.locator('.topbar strong').boundingBox())!.x)).toBe(52);
  });
});
