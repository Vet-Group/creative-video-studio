import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { modelButton, openTab, png, select, signIn } from './support.test';

// Image Generation's prompt bar, as Fash's: on a wide screen it floats at the foot of the screen over the full-width tabs and gallery, and holds every
// control of the old left form; below 1024 px it is the Create tab's card, in the page's flow.

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const near = (actual: number, expected: number, what: string) => expect(Math.abs(actual - expected), `${what}: ${actual}, expected ${expected}`).toBeLessThanOrEqual(1);
const blocking = async (page: Page) =>
  (await new AxeBuilder({ page }).include('.imagebar').analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
/** The focused control's accessible name, as a screen reader reads it. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> };
    const by = el.getAttribute('aria-labelledby');
    const name = by ? by.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : (el.getAttribute('aria-label') ?? (el.labels?.[0]?.textContent || el.textContent));
    return (name ?? '').replace(/\s+/g, ' ').trim();
  });
/** Nothing covers the element: the middle of each of its parts takes a click there, so no wrapper clips it and no layer paints over it. */
const uncovered = (el: Locator) =>
  el.evaluate((root) =>
    [root, ...root.querySelectorAll('[role=option], button')].every((part) => {
      const r = part.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= innerHeight && !!hit && root.contains(hit);
    }),
  );

test('at 1440 the prompt bar floats under the full-width tabs and holds every control; the prompt runs Run, focus goes prompt, chips, Run, and no menu is clipped', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'pbara');
  await page.goto('/image-generation');
  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  await expect(modelButton(page)).toContainText('Mock image E2E');
  // No left column: the hint, the tabs and the gallery span the page's column, and the bar is docked at the foot of the screen.
  await expect(page.locator('.form-card')).toHaveCount(0);
  const column = (await page.locator('.imagegen').boundingBox())!;
  near((await page.getByRole('complementary', { name: 'Khi nào dùng Tạo ảnh' }).boundingBox())!.width, column.width, 'hint width');
  near((await page.locator('.imagegen > .side').boundingBox())!.width, column.width, 'pane width');
  const b = (await bar.boundingBox())!;
  near(b.y + b.height, 900 - 24, 'bar bottom');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

  // Every control of the old form is in the bar and on screen.
  const prompt = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  const run = bar.getByRole('button', { name: /^Tạo ảnh/ });
  for (const control of [
    bar.getByRole('button', { name: 'Tải lên Ảnh tham chiếu' }),
    bar.getByRole('button', { name: 'Ảnh đã tải cho Ảnh tham chiếu' }),
    prompt,
    bar.getByRole('group', { name: 'Gợi ý nhanh' }),
    bar.getByRole('button', { name: 'Cải thiện mô tả bằng AI' }),
    bar.getByRole('button', { name: 'Gợi ý AI' }),
    bar.getByRole('button', { name: 'Mở rộng' }),
    bar.getByRole('button', { name: 'Phong cách', exact: true }),
    bar.getByRole('button', { name: /^Mô hình / }),
    bar.getByRole('combobox', { name: 'Tỉ lệ', exact: true }),
    bar.getByRole('combobox', { name: 'Độ phân giải', exact: true }),
    bar.getByRole('combobox', { name: 'Cửa hàng/Thương hiệu', exact: true }),
    bar.getByRole('button', { name: 'Dùng bộ nhận diện', exact: true }),
    bar.getByRole('button', { name: 'Thiết lập đã lưu' }),
    bar.getByRole('button', { name: 'Lưu thiết lập' }),
    run,
  ]) {
    await expect(control).toBeVisible();
    await expect(control).toBeInViewport();
  }
  // Before a prompt the reason is for screen readers and Run's description, not a line in the bar.
  await expect(run).toBeDisabled();
  await expect(bar.locator('#imagegen-reason')).toHaveText('Nhập mô tả cảnh bạn muốn tạo.');
  await expect(run).toHaveAttribute('aria-describedby', 'imagegen-reason');

  // A reference photo shows as a thumbnail in the bar, and goes with its remove button.
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('bar-ref.png'));
  const thumb = bar.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' }).getByRole('img', { name: 'bar-ref.png' });
  await expect(thumb).toBeVisible();
  await expect(thumb).toBeInViewport();
  await prompt.fill('a linen shirt on a wooden chair');
  await expect(run).toBeEnabled();
  await expect(run).not.toHaveAttribute('aria-describedby');

  // Keyboard: from the prompt, its tools, then the chips in their row, then Run.
  await prompt.focus();
  const order: string[] = [];
  for (let i = 0; i < 20 && !/^Tạo ảnh/.test(order.at(-1) ?? ''); i++) {
    await page.keyboard.press('Tab');
    order.push(await focusedName(page));
  }
  const chips = order.slice(order.indexOf('Phong cách'));
  expect(chips.map((n) => n.replace(/ .*/, ''))).toEqual(['Phong', 'Mô', 'Tỉ', 'Độ', 'Tạo']);
  expect(chips[1]).toMatch(/^Mô hình Mock image E2E/);
  expect(order.slice(0, order.indexOf('Phong cách'))).toEqual(expect.arrayContaining(['Cải thiện mô tả bằng AI', 'Gợi ý AI', 'Mở rộng']));
  await expect(run).toBeFocused();

  // The menus open over the gallery, upward from the foot of the screen, whole: the bar clips none of them.
  await select(page, 'Tỉ lệ').focus();
  await page.keyboard.press('Enter');
  const ratios = page.getByRole('listbox', { name: 'Tỉ lệ' });
  await expect(ratios).toBeVisible();
  expect((await ratios.boundingBox())!.y + (await ratios.boundingBox())!.height).toBeLessThanOrEqual((await select(page, 'Tỉ lệ').boundingBox())!.y);
  expect(await uncovered(page.locator('.select-pop'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(ratios).toHaveCount(0);
  await modelButton(page).click();
  const models = page.getByRole('dialog', { name: 'Chọn mô hình' });
  await expect(models).toBeVisible();
  expect(await uncovered(models)).toBe(true);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Gợi ý AI' }).click();
  const ideas = page.getByRole('group', { name: 'Gợi ý AI' });
  await expect(ideas.getByRole('button', { name: /^Gợi ý \d/ })).toHaveCount(3, { timeout: 20_000 });
  expect((await ideas.boundingBox())!.y + (await ideas.boundingBox())!.height).toBeLessThanOrEqual((await prompt.boundingBox())!.y); // over the gallery, not growing the bar
  expect(await uncovered(ideas)).toBe(true);
  await page.keyboard.press('Escape');

  // Ctrl+Enter in the prompt runs, as on the old form, and History opens with the job.
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/jobs') && r.request().method() === 'POST');
  await prompt.press('Control+Enter');
  expect((await sent).status()).toBe(201);
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(bar.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect(bar).toBeInViewport(); // still docked over History
});

test('at 390 the prompt bar is the Tạo tab, in the page flow with Run on screen, and the other tabs give the screen to their pane', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'pbarb');
  await page.goto('/image-generation');
  const bar = page.getByRole('tabpanel', { name: 'Tạo' });
  await expect(page.getByRole('tab')).toHaveText(['Tạo', 'Lịch sử', 'Ví dụ', 'Giới thiệu']);
  await expect(page.getByRole('tab', { name: 'Tạo' })).toHaveAttribute('aria-selected', 'true');
  await expect(bar).toHaveClass(/imagebar/);
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('static'); // not docked: the Tạo tab gives it the screen
  const prompt = bar.getByRole('textbox', { name: 'Mô tả', exact: true });
  const run = bar.getByRole('button', { name: /^Tạo ảnh/ });
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('phone-ref.png'));
  await expect(bar.getByRole('img', { name: 'phone-ref.png' })).toBeVisible();
  await prompt.fill('a linen shirt on a wooden chair');
  await expect(run).toBeEnabled();
  await expect(run).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect.soft(await blocking(page), 'the bar at 390').toEqual([]);

  await openTab(page, 'Lịch sử');
  await expect(bar).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' })).toBeVisible();
  await openTab(page, 'Tạo');
  await expect(prompt).toHaveValue('a linen shirt on a wooden chair'); // the bar keeps its words across the tabs
  await expect(bar.getByRole('img', { name: 'phone-ref.png' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the prompt bar has no serious accessibility problem, filled and with a menu open (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, 'pbarc');
    await page.goto('/image-generation');
    const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
    await expect(modelButton(page)).toContainText('Mock image E2E');
    expect.soft(await blocking(page), 'empty').toEqual([]);
    await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file(`axe-${scheme}.png`));
    await expect(bar.getByRole('img', { name: `axe-${scheme}.png` })).toBeVisible();
    await bar.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen shirt on a wooden chair');
    await select(page, 'Độ phân giải').click();
    await expect(page.getByRole('listbox', { name: 'Độ phân giải' })).toBeVisible();
    expect.soft(await blocking(page), 'filled, with a menu open').toEqual([]);
  });
}
