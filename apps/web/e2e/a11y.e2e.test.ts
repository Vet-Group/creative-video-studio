import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// The main pages, in both themes, carry no serious or critical axe violation (the 2026-11-04 accessibility pass).
const MEMBER_PAGES = ['/explore', '/create', '/try-on', '/image-generation', '/marketing-studio', '/apps', '/library', '/account/sign-in-methods'];
const ADMIN_PAGES = ['/admin', '/admin/users', '/admin/audit', '/admin/costs', '/admin/settings'];

const blocking = async (page: import('@playwright/test').Page) =>
  (await new AxeBuilder({ page }).exclude('nextjs-portal').analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);

for (const scheme of ['light', 'dark'] as const) {
  test(`member pages have no serious accessibility problem (${scheme})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, 'member8');
    for (const path of MEMBER_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect.soft(await blocking(page), path).toEqual([]); // soft: one run lists every page's problems
    }
  });

  test(`Admin pages have no serious accessibility problem (${scheme})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, 'admin');
    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect.soft(await blocking(page), path).toEqual([]); // soft: one run lists every page's problems
    }
  });
}
