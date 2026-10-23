// UI parity (docs/UI-MOTION-PARITY.md): screenshot baselines on frozen data, the layout on both sides of the 1024 px breakpoint,
// the drawer, the tabs and the carousel by keyboard and drag, and the rule that choosing a preset creates no job.
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { freezeData } from './frozen.test';
import { signIn } from './support.test';

// Posters and a frozen clock: reduced motion keeps every clip on its poster, so a second run paints the same frame.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const SIZES = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 1024, height: 800 },
  { width: 1023, height: 800 },
  { width: 390, height: 844 },
];
const SHOT = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01, stylePath: fileURLToPath(new URL('./screenshot.css', import.meta.url)) } as const;

/** Create with everything loaded: the model, the presets and the stores. */
async function openCreate(page: Page): Promise<void> {
  await page.goto('/create');
  await expect(page.getByRole('radio', { name: /Mock E2E/ })).toBeChecked();
  await expect(page.getByLabel('Mẫu chuyển động').locator('option')).not.toHaveCount(1);
  await expect(page.getByLabel('Cửa hàng/Thương hiệu').locator('option')).not.toHaveCount(1);
  await expect(page.getByText('Tháng này bạn đã dùng: $0.0000')).toBeVisible();
}

const narrow = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`Create and Library match the baselines at ${at}`, async ({ page }) => {
    await page.setViewportSize(size);
    await freezeData(page);
    await signIn(page, 'member5');
    await openCreate(page);

    // Create: the form tab below 1024 px, History beside the form from 1024 px.
    if (narrow(page)) await expect(page).toHaveScreenshot(`create-form-${at}.png`, SHOT);
    await page.getByRole('tab', { name: 'Lịch sử' }).click();
    await expect(page.getByText('Hoàn tất')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Job của tôi' }).locator('img')).toHaveJSProperty('complete', true);
    await expect(page).toHaveScreenshot(`create-history-${at}.png`, SHOT);

    await page.getByRole('tab', { name: 'Ví dụ' }).click();
    await expect(page.getByRole('button', { name: /^Phát / })).toHaveCount(6);
    await expect(page.locator('.masonry video')).toHaveCount(6);
    await expect.poll(() => page.locator('.masonry video').evaluateAll((vs) => vs.every((v) => (v as HTMLVideoElement).poster !== '' && v.getBoundingClientRect().height > 0))).toBe(true);
    await expect(page).toHaveScreenshot(`create-examples-${at}.png`, SHOT);

    // The Library: the grid of clips with controls, poster, cost and verdict.
    await page.goto('/library');
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(page.getByText('Chi phí thật: $0.0000')).toHaveCount(3);
    await expect.poll(() => page.locator('.card video').evaluateAll((vs) => vs.every((v) => (v as HTMLVideoElement).readyState >= 1))).toBe(true);
    await expect(page).toHaveScreenshot(`library-${at}.png`, SHOT);

    // Below 1024 px the drawer is part of the baseline.
    if (narrow(page)) {
      await page.getByRole('button', { name: 'Mở menu' }).click();
      await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
      await expect(page).toHaveScreenshot(`drawer-${at}.png`, SHOT);
    }
  });
}

test('the layout flips at 1024 px: sidebar and two columns above, top bar, tabs and a sticky Run bar below', async ({ page }) => {
  await signIn(page, 'member5');
  await openCreate(page);
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const menu = page.getByRole('button', { name: 'Mở menu' });
  const tabs = page.getByRole('tab');
  const form = page.locator('.form-card');
  const run = page.getByRole('button', { name: 'Tạo video' });

  for (const size of SIZES) {
    await page.setViewportSize(size);
    await expect(page.locator('html')).toHaveJSProperty('clientWidth', size.width);
    // Nothing pushes the page sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (size.width >= 1024) {
      await expect(nav).toBeVisible();
      await expect(menu).toBeHidden();
      await expect(tabs).toHaveText(['Lịch sử', 'Ví dụ']);
      await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
      await expect(form).toBeVisible();
      // Two columns: the form card sits left of the pane.
      const card = (await form.boundingBox())!;
      const pane = (await page.locator('.side').boundingBox())!;
      expect(card.x + card.width).toBeLessThanOrEqual(pane.x);
    } else {
      await expect(nav).toBeHidden();
      await expect(menu).toBeVisible();
      await expect(tabs).toHaveText(['Tạo', 'Lịch sử', 'Ví dụ']);
      await expect(page.getByRole('tab', { name: 'Tạo', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(form).toBeVisible();
      await expect(page.locator('.side')).toBeHidden();
      // The Run bar sticks to the bottom edge while the form is taller than the screen.
      await page.evaluate(() => window.scrollTo(0, 0));
      const card = (await form.boundingBox())!;
      expect(card.height).toBeGreaterThan(size.height);
      const bar = (await page.locator('.runbar').boundingBox())!;
      expect(Math.abs(bar.y + bar.height - size.height)).toBeLessThanOrEqual(2);
      await expect(run).toBeInViewport();
    }
  }
});

test('below 1024 px the drawer opens and closes by keyboard and navigates without a mouse', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member5');
  const menu = page.getByRole('button', { name: 'Mở menu' });
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(page.locator('.topbar')).toContainText('Tạo video');

  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: 'Tạo video' })).toBeFocused();
  // The page behind the drawer is out of the focus order.
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('link', { name: 'Thư viện' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(nav).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/library$/);
  await expect(nav).toBeHidden();
  await expect(page.locator('.topbar')).toContainText('Thư viện');
});

for (const width of [1280, 1023]) {
  test(`the Create tabs switch with the arrow keys at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await signIn(page, 'member5');
    await openCreate(page);
    const order = width >= 1024 ? ['Lịch sử', 'Ví dụ'] : ['Tạo', 'Lịch sử', 'Ví dụ'];
    const tab = (name: string) => page.getByRole('tab', { name, exact: true });

    await tab(order[0]!).focus();
    for (const name of order.slice(1)) {
      await page.keyboard.press('ArrowRight');
      await expect(tab(name)).toHaveAttribute('aria-selected', 'true');
      await expect(tab(name)).toBeFocused();
    }
    await page.keyboard.press('ArrowRight');
    await expect(tab(order[0]!)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tab('Ví dụ')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.masonry')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(tab(order[0]!)).toHaveAttribute('aria-selected', 'true');
    if (width < 1024) await expect(page.locator('.form-card')).toBeVisible();
    else await expect(page.getByRole('complementary', { name: 'Job của tôi' })).toBeVisible();
  });
}

test('the preset carousel scrolls natively: 16 px edge, 12 px gaps, arrow keys and mouse drag at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member5');
  await openCreate(page);
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  const track = page.getByRole('list', { name: 'Danh sách mẫu' });
  const cards = track.getByRole('listitem');
  await expect(cards).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Cuộn sang phải' })).toBeHidden(); // arrows are for desktop; touch swipes

  const t = (await track.boundingBox())!;
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  expect(Math.abs(first.x - t.x - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.x - (first.x + first.width) - 12)).toBeLessThanOrEqual(1);

  await track.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  const afterKey = await track.evaluate((el) => el.scrollLeft);

  await page.mouse.move(t.x + 200, t.y + 60);
  await page.mouse.down();
  await page.mouse.move(t.x + 120, t.y + 60, { steps: 5 });
  await page.mouse.move(t.x + 40, t.y + 60, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(afterKey + 80);

  // Dragging is not choosing: the dialog is still open and the preset is unchanged.
  await expect(track).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(track).toBeHidden();
  await expect(page.getByRole('button', { name: 'Chọn mẫu khác' })).toBeFocused();
});

test('on a wide screen the carousel has arrow buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  await openCreate(page);
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  const track = page.getByRole('list', { name: 'Danh sách mẫu' });
  await expect(page.getByRole('button', { name: 'Cuộn sang trái' })).toBeVisible();
  await page.getByRole('button', { name: 'Cuộn sang phải' }).click();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Cuộn sang trái' }).click();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBe(0);
});

test('choosing a preset or using an example fills the form and creates no job', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/jobs') && posts.push(r.url()));
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  await openCreate(page);
  const presetSelect = page.getByLabel('Mẫu chuyển động');
  const before = await presetSelect.inputValue();

  // The picker: a card fills the preset and closes the dialog.
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  await page.getByRole('list', { name: 'Danh sách mẫu' }).getByRole('button', { name: 'Ánh sáng quét nhẹ', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Danh sách mẫu' })).toBeHidden();
  await expect(presetSelect).toHaveValue('light-sweep');
  expect(before).not.toBe('light-sweep');
  await expect(page.locator('.banner-text strong')).toHaveText('Ánh sáng quét nhẹ');

  // An example: a click shows the details with a "use this sample" button, which fills preset, ratio and duration.
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  await page.getByRole('button', { name: 'Xoay quanh chậm', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết mẫu' });
  await expect(detail).toContainText('Mẫu minh họa');
  await expect(presetSelect).toHaveValue('light-sweep');
  await detail.getByRole('button', { name: 'Dùng mẫu này' }).click();
  await expect(detail).toBeHidden();
  await expect(presetSelect).toHaveValue('slow-orbit');
  await expect(page.getByLabel('Tỉ lệ khung hình')).toHaveValue('1:1');

  // Nothing was submitted, and the history is still empty.
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await expect(page.getByText('Chưa có job nào.')).toBeVisible();
  expect(posts).toEqual([]);
});
