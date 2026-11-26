import { expect, type Page, test } from '@playwright/test';
import { png, signIn } from './support.test';

// The 2026-11-18 motion pass: a dialog fades in at its final box, a not-ready Run is a readable grey, a ready one lights up, and a press shrinks a control.
const luminance = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const contrast = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
const rgb = (css: string) => css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);

const openGuide = async (page: Page) => {
  // The opacity and scale showModal() starts from, read in the same task, before the first frame.
  await page.evaluate(() => {
    const open = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function showModal() {
      open.call(this);
      const style = getComputedStyle(this);
      (window as unknown as { entered: object }).entered = { opacity: Number(style.opacity), scale: style.scale };
    };
  });
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Chọn công cụ nào?' }).click();
  return page.getByRole('dialog', { name: 'Chọn công cụ nào?' });
};
const entered = (page: Page) => page.evaluate(() => (window as unknown as { entered: { opacity: number; scale: string } }).entered);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await signIn(page, 'motion');
    });

    test('a dialog fades in at its final centred box, unscaled from the first frame', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
      const guide = await openGuide(page);
      await expect(guide).toBeVisible();
      const start = await entered(page);
      expect(start.opacity).toBeLessThan(1);
      expect(start.scale).toBe('none'); // only the opacity moves, so nothing in the dialog changes size or place while it opens
      // Settled: opaque, nothing still running, and the box is the CSS width (52rem) centred on the screen.
      await expect.poll(() => guide.evaluate((el) => el.getAnimations().length)).toBe(0);
      expect(await guide.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).scale])).toEqual(['1', 'none']);
      const box = (await guide.boundingBox())!;
      expect(box.width).toBe(832);
      expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(1);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
    });

    test('a dialog opens straight to its final state under reduced motion', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const guide = await openGuide(page);
      await expect(guide).toBeVisible();
      expect(await entered(page)).toEqual({ opacity: 1, scale: 'none' });
      expect(await guide.evaluate((el) => el.getAnimations().length)).toBe(0);
    });

    test('Run is a grey the label reads on until the form is complete, then lights up to the brand colour', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
      const run = page.getByRole('button', { name: 'Tạo video' });
      await expect(run).toBeDisabled();
      const colours = () => run.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color, opacity: getComputedStyle(el).opacity }));
      const off = await colours();
      expect(off.opacity).toBe('1');
      expect(off.bg).not.toBe('rgb(220, 38, 38)');
      expect(contrast(rgb(off.fg), rgb(off.bg))).toBeGreaterThanOrEqual(4.5);
      // The reason line stays and still describes the button.
      await expect(run).toHaveAccessibleDescription(/\S/);
      // A press on a disabled control does not shrink it.
      const b = (await run.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      expect(await run.evaluate((el) => getComputedStyle(el).scale)).toBe('none');
      await page.mouse.up();
      await page.mouse.move(0, 0); // off Run, so the ready colour below is not its hover colour

      await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'run.png', mimeType: 'image/png', buffer: png() });
      await page.getByLabel('Mô tả chuyển động').fill('Slow turn of the shirt.');
      await expect(run).toBeEnabled();
      // A fade, not a switch: the colour is still on its way right after, and the brand colour once it has run.
      expect(await run.evaluate((el) => getComputedStyle(el).transitionProperty.includes('background-color'))).toBe(true);
      await expect(run).toHaveCSS('background-color', 'rgb(220, 38, 38)');
    });

    test('a press shrinks an enabled control to 0.97 and lets go on release', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
      const control = page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Chọn công cụ nào?' });
      const b = (await control.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await expect.poll(() => control.evaluate((el) => getComputedStyle(el).scale)).toBe('0.97');
      await page.mouse.move(0, 0); // let go away from the control, so no click opens the dialog
      await page.mouse.up();
      await expect.poll(() => control.evaluate((el) => getComputedStyle(el).scale)).toBe('none');
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      expect(await control.evaluate((el) => getComputedStyle(el).scale)).toBe('none');
      await page.mouse.move(0, 0);
      await page.mouse.up();
    });
  });
}

// A person's tab switch cross-fades the panels in a view transition at the fast duration (WorkTabs); the shown tab, a switch under reduced motion and
// About's back-to-form button (a click from code, which reads the form in the next frame) switch at once, as before.
test('a tab switch cross-fades in a short view transition at 1440 and 390 px, and not under reduced motion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Counts the transitions and keeps the durations of the last one's animations.
  await page.addInitScript(() => {
    const w = window as unknown as { fades: number; durations?: number[] };
    const start = document.startViewTransition.bind(document);
    w.fades = 0;
    document.startViewTransition = (update?: Parameters<typeof start>[0]) => {
      w.fades++;
      const t = start(update);
      t.ready.then(
        () => (w.durations = document.documentElement.getAnimations({ subtree: true }).filter((a) => (a.effect as KeyframeEffect).pseudoElement?.startsWith('::view-transition')).map((a) => Number(a.effect!.getTiming().duration))),
        () => {},
      );
      return t;
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await signIn(page, 'motion');
  const fades = () => page.evaluate(() => (window as unknown as { fades: number }).fades);
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });

  await tab('Lịch sử').click();
  await expect(tab('Lịch sử')).toHaveAttribute('aria-selected', 'true');
  expect(await fades()).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { durations?: number[] }).durations?.length ?? 0)).toBeGreaterThan(0);
  expect(new Set(await page.evaluate(() => (window as unknown as { durations: number[] }).durations))).toEqual(new Set([150]));
  // The keyboard fades too; the tab already shown does not.
  await page.keyboard.press('ArrowRight');
  await expect(tab('Ví dụ')).toHaveAttribute('aria-selected', 'true');
  await tab('Ví dụ').click();
  expect(await fades()).toBe(2);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tab('Giới thiệu').click();
  await expect(tab('Giới thiệu')).toHaveAttribute('aria-selected', 'true');
  expect(await fades()).toBe(2);

  // On a phone the form is a tab of its own.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await tab('Tạo').click();
  await expect(tab('Tạo')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#create-panel-create')).toBeVisible();
  expect(await fades()).toBe(3);
  await tab('Giới thiệu').click();
  await page.getByRole('region', { name: 'Bắt đầu' }).getByRole('button', { name: 'Mở form' }).click();
  await expect(tab('Tạo')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#create-panel-create :focus')).toHaveCount(1);
  expect(await fades()).toBe(4);
  expect(errors).toEqual([]);
});
