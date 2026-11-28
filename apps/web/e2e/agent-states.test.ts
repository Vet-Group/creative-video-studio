// The state check the Settings "Connect AI" specs share (agent-access.e2e, agent-access-v2.e2e). Named .test.ts like support.test.ts; Playwright runs
// only *.e2e.test.ts and Vitest leaves e2e/ alone.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

const WIDTHS = [390, 820, 1280] as const;
const SCHEMES = ['light', 'dark'] as const;

/**
 * Every width and theme of one state: no sideways scroll, every visible control in the section at least 44 px each way, no serious axe problem.
 * CVS_E2E_SHOTS=<folder> keeps the screenshots there.
 */
export async function checkState(page: Page, section: Locator, state: string, shown?: Locator) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1400 }); // tall, so the screenshot shows most of the section
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await expect(section).toBeVisible();
      const overflow = await page.evaluate(() =>
        [document.documentElement, ...document.querySelectorAll('.settings-panel, .agent-access')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName),
      );
      expect.soft(overflow, `${state} ${width} ${scheme}: horizontal scroll`).toEqual([]);
      const small = await section.locator('button, input, select, a[href]').evaluateAll((els) =>
        els
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0)
          .filter(({ box }) => box.height < 44 || box.width < 44)
          .map(({ el, box }) => `${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim()} ${Math.round(box.width)}x${Math.round(box.height)}`),
      );
      expect.soft(small, `${state} ${width} ${scheme}: taps under 44 px`).toEqual([]);
      const axe = (await new AxeBuilder({ page }).include('.settings').analyze()).violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
      expect.soft(axe, `${state} ${width} ${scheme}: axe`).toEqual([]);
      await shown?.scrollIntoViewIfNeeded(); // the dialog scrolls inside: bring the part this state is about into the screenshot
      const dir = process.env.CVS_E2E_SHOTS;
      await page.screenshot({ path: dir ? `${dir}/${state}-${width}-${scheme}.png` : test.info().outputPath(`${state}-${width}-${scheme}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}
