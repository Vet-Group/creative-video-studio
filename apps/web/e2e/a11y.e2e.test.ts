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

// On a touch phone every control on the member pages takes a tap across 44 x 44 px, drawn that tall or through an invisible ::after, and no
// control's hit area reaches over another's edge. Links and buttons inside a sentence are exempt (WCAG 2.5.8's inline exception), as is the skip link,
// which sits off screen until focused. The Library's filters stay on one scrolling row.
test.describe('touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('every control on the member pages takes a 44 px tap and none covers another', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, 'member8');
    for (const path of MEMBER_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle'); // the sample strips load late and push the form down
      const misses = await page.evaluate(async () => {
        const CONTROLS = 'a[href], button, summary, select, input:not([type=hidden]), [role=button]';
        const controls = [...document.querySelectorAll<HTMLElement>(CONTROLS)]
          .map((el) => (el.matches('input, select') && el.closest('label')) || el)
          .filter((el, i, all) => all.indexOf(el) === i && !el.matches('.skip-link') && !el.closest('[inert]'))
          .filter((el) => !el.closest('p')) // a link or button in a sentence
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; });
        const found: string[] = [];
        for (const el of controls) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          await new Promise(requestAnimationFrame);
          // The part on screen: a scrolling strip or the viewport may cut a card at its end.
          const r = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
          for (let a: Element | null = el; a; a = a.parentElement) {
            const b = a.getBoundingClientRect(), cs = getComputedStyle(a);
            if (a !== el && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
            r.left = Math.max(r.left, b.left); r.top = Math.max(r.top, b.top); r.right = Math.min(r.right, b.right); r.bottom = Math.min(r.bottom, b.bottom);
          }
          const width = r.right - r.left, height = r.bottom - r.top;
          const x = r.left + width / 2, y = r.top + height / 2;
          // A tap is the control's own, or lands on another control drawn over it there (the slot's corner link): an overlay, not a hit area reaching over.
          const own = (dx: number, dy: number) => {
            const t = document.elementFromPoint(x + dx, y + dy);
            if (el.contains(t)) return true;
            const b = t?.getBoundingClientRect();
            return !!t && !!b && t.closest(CONTROLS) !== null && x + dx >= b.left && x + dx <= b.right && y + dy >= b.top && y + dy <= b.bottom;
          };
          // How far the control answers from its middle in one direction, up to 30 px: two side-by-side buttons may split their gap unevenly.
          const reach = (sx: number, sy: number) => { let n = 0; while (n < 30 && own(sx * (n + 1), sy * (n + 1))) n++; return n; };
          const name = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`;
          const edgeX = Math.max(width / 2 - 2, 0), edgeY = Math.max(height / 2 - 2, 0);
          const taken = ([[0, 0], [0, -edgeY], [0, edgeY], [-edgeX, 0], [edgeX, 0]] as const).find(([dx, dy]) => !own(dx, dy));
          if (taken) { const t = document.elementFromPoint(x + taken[0]!, y + taken[1]!); found.push(`${name}: ${t?.tagName.toLowerCase()}.${[...(t?.classList ?? [])].join('.')} takes a tap at ${taken.join(',')} from its middle`); }
          else if (reach(0, -1) + reach(0, 1) + 1 < 43 || reach(-1, 0) + reach(1, 0) + 1 < 43) found.push(`${name}: ${Math.round(width)}x${Math.round(height)} takes ${reach(-1, 0) + reach(1, 0) + 1}x${reach(0, -1) + reach(0, 1) + 1}`);
        }
        return found;
      });
      expect.soft(misses, path).toEqual([]); // soft: one run lists every page's misses
      if (path === '/library') expect.soft(await page.locator('.library-filters').evaluate((e) => e.getBoundingClientRect().height), 'the Library filters on one row').toBeLessThanOrEqual(52);
    }
  });
});

// Text a member reads is never half shown or covered: Explore's tool cards end on a whole line of their description, and on Motion Control
// the History link drawn in the video slot's corner (it shows once the member has a finished clip) clears the slot's hint.
test("Explore's tool cards show whole lines, and the corner History link clears the video slot's hint", async ({ page }) => {
  await signIn(page, 'member8');
  const now = new Date().toISOString();
  const clip = { id: 'a11y-clip', status: 'succeeded', error: null, failureReason: null, twin: null, isMock: true, feature: 'video', ratio: '9:16', durationSec: 5, resolution: null, modelId: 'mock-e2e', retryOf: null, retried: false, outputAssetId: 'a11y-out', posterAssetId: 'a11y-poster', createdAt: now, startedAt: now, providerQueue: null, finishedAt: now, text: null, inputAssetIds: [], garments: null, traits: null, format: null, roles: null, favorite: false, estimateUsd: '0.5000', unbilled: false };
  await page.route(/\/api\/jobs\?mine/, async (route) => {
    const real = (await (await route.fetch()).json()) as { jobs: unknown[] };
    await route.fulfill({ json: { ...real, jobs: [clip, ...real.jobs] } });
  });
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/explore');
    const texts = page.locator('.explore-tool-text');
    await expect(texts.first()).toBeVisible();
    for (const box of await texts.all()) {
      const [shown, line] = await box.evaluate((el) => [el.clientHeight, parseFloat(getComputedStyle(el).lineHeight)]);
      expect(shown % line, `${await box.textContent()} at ${width} px`).toBe(0); // a whole number of lines, no sliver of the next
    }
    await page.goto('/apps/motion-control');
    const link = page.getByRole('button', { name: 'Từ Lịch sử' });
    await expect(link).toBeVisible();
    const hint = (await page.locator('.field', { has: link }).locator('.slot-hint').boundingBox())!;
    const corner = (await link.boundingBox())!;
    expect(hint.y + hint.height, `the hint ends above the link at ${width} px`).toBeLessThanOrEqual(corner.y);
  }
});
