import { expect, test } from '@playwright/test';

test('the web app manifest names the app and serves the VET Group logo at 192 and 512 px, maskable too, with no session', async ({ page }) => {
  await page.goto('/login');
  const href = await page.locator('head link[rel="manifest"]').getAttribute('href');
  const res = await page.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect([m.name, m.short_name, m.start_url, m.display]).toEqual(['Creative Video Studio', 'Video Studio', '/', 'standalone']);
  expect(m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes} ${i.purpose ?? 'any'}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  for (const icon of m.icons as { src: string }[]) {
    const r = await page.request.get(icon.src, { maxRedirects: 0 });
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type'], icon.src).toBe('image/png');
  }
});

test('the tab shows the VET Group logo of the sidebar brand: 32 and 16 px icons and a 180 px Apple touch icon, served with no session', async ({ page }) => {
  await page.goto('/login');
  const links = await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => `${l.getAttribute('rel')} ${l.getAttribute('sizes')} ${l.getAttribute('type')}`));
  expect(links.sort()).toEqual(['apple-touch-icon 180x180 image/png', 'icon 16x16 image/png', 'icon 32x32 image/png']);
  for (const href of await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => l.getAttribute('href')!))) {
    const res = await page.request.get(href, { maxRedirects: 0 });
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toBe('image/png');
  }
});
