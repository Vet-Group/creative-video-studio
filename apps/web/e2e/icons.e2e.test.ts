import { expect, test } from '@playwright/test';

test('the tab shows the VET Group icon, as on VET Studio: 32 and 16 px icons and a 180 px Apple touch icon, served with no session', async ({ page }) => {
  await page.goto('/login');
  const links = await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => `${l.getAttribute('rel')} ${l.getAttribute('sizes')} ${l.getAttribute('type')}`));
  expect(links.sort()).toEqual(['apple-touch-icon 180x180 image/png', 'icon 16x16 image/png', 'icon 32x32 image/png']);
  for (const href of await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => l.getAttribute('href')!))) {
    const res = await page.request.get(href, { maxRedirects: 0 });
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toBe('image/png');
  }
});
