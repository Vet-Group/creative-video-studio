import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// The main pages, in both themes, carry no serious or critical axe violation (the 2026-11-04 accessibility pass).
const MEMBER_PAGES = ['/explore', '/create', '/try-on', '/image-generation', '/marketing-studio', '/apps', '/apps/ai-fashion-model', '/apps/motion-control', '/library', '/account/sign-in-methods'];
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

// WCAG 2.5.8: a text button drawn under 24 px tall still takes a click across 24 px, and 44 px on a phone, through its invisible ::after;
// the page answers a click at the edge of that band with the button itself.
test('the small text buttons on a form take a click across 24 px, and 44 px on a phone', async ({ page }) => {
  await signIn(page, 'member8');
  for (const [width, height, band] of [[1440, 900, 24], [390, 844, 44]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/try-on');
    await page.waitForLoadState('networkidle'); // the sample strips load late and push the form down
    const controls = [
      page.getByRole('button', { name: 'Thiết lập đã lưu' }),
      page.getByRole('button', { name: 'Lưu thiết lập' }),
      page.getByRole('button', { name: 'Ảnh đã tải cho Trang phục' }),
      page.locator('.prompt-preview summary'),
    ];
    for (const control of controls) {
      // What takes a click at the top and the bottom edge of the band, when it is not the control: scrolled to the middle and measured in one frame.
      const others = await control.evaluate(async (el, edge) => {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise(requestAnimationFrame);
        const r = el.getBoundingClientRect();
        return [-edge, edge].map((dy) => document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2 + dy)).filter((t) => !el.contains(t)).map((t) => t?.outerHTML.slice(0, 80) ?? `nothing at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}`);
      }, band / 2 - 1);
      expect(others, `${await control.textContent()} at ${width} px`).toEqual([]);
    }
  }
});
