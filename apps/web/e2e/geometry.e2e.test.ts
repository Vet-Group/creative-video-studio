// Geometry parity (docs/UI-MOTION-PARITY-M7B.md with the live values of UI-MOTION-PARITY-M7B-LIVE.md, which win where they differ):
// computed styles and boxes of every measured row. Sizes are within 2 px, colours are exact. Titles start with the row id.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { freezeData } from './frozen.test';
import { modelButton, png, select, signIn } from './support.test';

const DESKTOP = { width: 1440, height: 1000 };
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const SHADOW = 'rgba(0, 0, 0, 0.12) 0px 12px 40px 0px';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const box = async (loc: Locator): Promise<Box> => (await loc.boundingBox())!;
/** The computed values of these CSS properties, in order. */
const css = (loc: Locator, ...props: string[]): Promise<string[]> =>
  loc.evaluate((el, ps) => {
    const s = getComputedStyle(el);
    return ps.map((p) => s.getPropertyValue(p));
  }, props);
const near = (actual: number, expected: number, what: string, tol = 2) => expect(Math.abs(actual - expected), `${what}: ${actual}, expected ${expected} within ${tol}`).toBeLessThanOrEqual(tol);
const sized = (b: Box, width: number, height: number, what: string, tol = 2) => {
  near(b.width, width, `${what} width`, tol);
  near(b.height, height, `${what} height`, tol);
};

/** Create with everything loaded, on fixed data. */
async function openCreate(page: Page, size: { width: number; height: number }, options: { noJobs?: boolean } = {}): Promise<void> {
  await page.setViewportSize(size);
  await freezeData(page);
  if (options.noJobs) await page.route(/\/api\/jobs\?mine/, (r) => r.fulfill({ json: { jobs: [], workerOffline: false } }));
  await signIn(page, 'member7');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(select(page, 'Mẫu chuyển động')).not.toHaveText('Tự viết mô tả');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const image = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const nav = (page: Page) => page.locator('.sidebar nav');
/** Page titles a person can see: headings drawn larger than the screen-reader-only one, plus the top bar title. */
const visibleTitles = (page: Page) => page.evaluate(() => [...document.querySelectorAll('h1, .topbar strong')].filter((el) => el.getBoundingClientRect().width > 2 && el.getBoundingClientRect().height > 2).map((el) => el.textContent));

test.describe('1440x1000', () => {
  test.beforeEach(async ({ page }) => openCreate(page, DESKTOP));

  test('S1 sidebar: 240 px wide, rgb(250,250,250), no border, padding 16px 16px 32px, fixed, full height', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    sized(await box(sidebar), 240, 1000, 'sidebar');
    expect(await css(sidebar, 'background-color', 'position', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left')).toEqual([
      'rgb(250, 250, 250)', 'fixed', '0px', '0px', '0px', '0px', '16px', '16px', '32px', '16px',
    ]);
  });

  test('S2 nav items: 208x37, padding 8px 12px, 14px/21px weight 500, inactive label rgb(77,77,77)', async ({ page }) => {
    const item = nav(page).getByRole('link', { name: 'Thư viện' });
    sized(await box(item), 208, 37, 'nav item');
    expect(await css(item, 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'font-size', 'line-height', 'font-weight', 'color')).toEqual(['8px', '12px', '8px', '12px', '14px', '21px', '500', 'rgb(77, 77, 77)']);
  });

  test('S3 active nav item: rgb(242,242,242), radius 10, rgb(26,26,26) weight 500; hover uses the same background', async ({ page }) => {
    const active = nav(page).getByRole('link', { name: 'Tạo video' });
    expect(await css(active, 'background-color', 'border-top-left-radius', 'color', 'font-weight')).toEqual(['rgb(242, 242, 242)', '10px', 'rgb(26, 26, 26)', '500']);
    const other = nav(page).getByRole('link', { name: 'Thư viện' });
    expect((await css(other, 'background-color'))[0]).toBe('rgba(0, 0, 0, 0)');
    await other.hover();
    await expect.poll(async () => (await css(other, 'background-color'))[0]).toBe('rgb(242, 242, 242)');
  });

  test('S4 nav icons: a 14 px icon in a 20 px slot at x=28, grey when inactive and rgb(26,26,26) when active', async ({ page }) => {
    for (const [name, color] of [['Tạo video', 'rgb(26, 26, 26)'], ['Thư viện', 'rgb(128, 128, 128)']] as const) {
      const slot = nav(page).getByRole('link', { name }).locator('.nav-icon');
      const b = await box(slot);
      near(b.width, 20, `${name} slot width`);
      near(b.x, 28, `${name} slot x`);
      sized(await box(slot.locator('svg')), 14, 14, `${name} icon`);
      expect((await css(slot, 'color'))[0], name).toBe(color);
    }
  });

  test('S5 page frame: main padding 16px 48px 0, the card starts at x=288', async ({ page }) => {
    near((await box(page.locator('.form-card'))).x, 288, 'card x');
    expect(await css(page.locator('.frame'), 'padding-top', 'padding-right', 'padding-bottom')).toEqual(['16px', '48px', '0px']);
  });

  test('S6 page: white background, 16px/24px, rendered font is the self-hosted Inter', async ({ page }) => {
    expect(await css(page.locator('body'), 'background-color', 'font-size', 'line-height')).toEqual(['rgb(255, 255, 255)', '16px', '24px']);
    expect((await css(page.locator('body'), 'font-family'))[0]).toMatch(/^"Inter Variable", Inter, Arial, sans-serif$/);
    const loaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replaceAll('"', '') === 'Inter Variable' && f.status === 'loaded'));
    expect(loaded, 'an Inter Variable face is loaded from our own files').toBe(true);
  });

  test('C1 card: 320 px wide, radius 24, no border, shadow 0 12px 40px rgba(0,0,0,.12), padding 24', async ({ page }) => {
    const card = page.locator('.form-card');
    near((await box(card)).width, 320, 'card width');
    expect(await css(card, 'border-top-left-radius', 'border-top-width', 'box-shadow', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left')).toEqual(['24px', '0px', SHADOW, '24px', '24px', '24px', '24px']);
  });

  test('C2 card height and scroll: sticky at top 16, viewport minus 24 tall, Run pinned under a 1px rgb(204,204,204) divider', async ({ page }) => {
    const card = page.locator('.form-card');
    const b = await box(card);
    near(b.y, 16, 'card y');
    near(b.height, 976, 'card height');
    expect(await css(card, 'position', 'top')).toEqual(['sticky', '16px']);
    expect((await css(page.locator('.form-scroll'), 'overflow-y'))[0]).toBe('auto');
    const bar = page.locator('.runbar');
    expect(await css(bar, 'border-top-width', 'border-top-style', 'border-top-color', 'padding-top')).toEqual(['1px', 'solid', 'rgb(204, 204, 204)', '16px']);
    near((await box(bar)).height, 73, 'run wrapper height');
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  });

  test('C3 preset banner: 268x130, radius 18, centred 24px/600 white title, chip 26 tall with radius 16 and 12px/18px white text', async ({ page }) => {
    const banner = page.locator('.banner');
    sized(await box(banner), 268, 130, 'banner');
    expect((await css(banner, 'border-top-left-radius'))[0]).toBe('18px');
    const title = page.locator('.banner-text strong');
    expect(await css(title, 'font-size', 'font-weight', 'color', 'text-align')).toEqual(['24px', '600', 'rgb(255, 255, 255)', 'center']);
    const t = await box(title);
    const b = await box(banner);
    near(t.x + t.width / 2, b.x + b.width / 2, 'title centre x');
    near(t.y + t.height / 2, b.y + b.height / 2, 'title centre y');
    const chip = page.getByRole('button', { name: 'Chọn mẫu khác' });
    const c = await box(chip);
    near(c.height, 26, 'chip height');
    expect(c.x + c.width).toBeLessThanOrEqual(b.x + b.width);
    expect(c.y).toBeLessThan(b.y + 20); // top right
    expect(await css(chip, 'border-top-left-radius', 'padding-top', 'padding-right', 'font-size', 'line-height', 'color')).toEqual(['16px', '4px', '12px', '12px', '18px', 'rgb(255, 255, 255)']);
  });

  test('C4 no duplicated page title: no visible Create heading beside the sidebar', async ({ page }) => {
    expect(await visibleTitles(page)).toEqual([]);
  });

  test('U1 upload: the native file input is hidden behind a focusable dropzone; Enter and Space open the picker; drag and drop still uploads', async ({ page }) => {
    const input = page.getByLabel('Ảnh sản phẩm');
    expect((await css(input, 'display'))[0]).toBe('none');
    expect(await page.locator('.form-card input[type=file]').evaluate((el) => (el as HTMLInputElement).accept)).toContain('image/png');
    const pick = page.locator('.dropzone-pick');
    await page.keyboard.press('Tab'); // so the focus ring below is the keyboard one
    await pick.focus();
    await expect(pick).toBeFocused();
    const [first] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
    await first.setFiles(image('enter.png'));
    await expect(page.getByRole('img', { name: 'enter.png' })).toBeVisible();
    await pick.focus();
    const [second] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Space')]);
    await second.setFiles(image('space.png'));
    await expect(page.getByRole('img', { name: 'space.png' })).toBeVisible();

    const data = await page.evaluateHandle((b64) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'drop.png', { type: 'image/png' }));
      return dt;
    }, png().toString('base64'));
    const zone = page.locator('.dropzone');
    await zone.dispatchEvent('dragover', { dataTransfer: data });
    await expect(zone).toHaveAttribute('data-over', 'true');
    await zone.dispatchEvent('drop', { dataTransfer: data });
    await expect(page.getByRole('img', { name: 'drop.png' })).toBeVisible();
    await expect(zone).toHaveAttribute('data-over', 'false');
  });

  test('U2 dropzone: 268x130, 1px dashed rgb(153,153,153), radius 18, centred column with a 6px gap', async ({ page }) => {
    const zone = page.locator('.dropzone');
    sized(await box(zone), 268, 130, 'dropzone');
    expect(await css(zone, 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius')).toEqual(['1px', 'dashed', 'rgb(153, 153, 153)', '18px']);
    expect(await css(page.locator('.dropzone-pick'), 'flex-direction', 'align-items', 'justify-content', 'row-gap')).toEqual(['column', 'center', 'center', '6px']);
    expect((await css(zone, 'transition-property'))[0]).toContain('border-color');
  });

  test('U3 plus button: a 36 px circle rgba(0,0,0,.06) with an rgb(102,102,102) glyph above a 14px grey hint', async ({ page }) => {
    const plus = page.locator('.dropzone-plus');
    sized(await box(plus), 36, 36, 'plus');
    expect(await css(plus, 'border-top-left-radius', 'background-color', 'color')).toEqual(['50%', 'rgba(0, 0, 0, 0.06)', 'rgb(102, 102, 102)']);
    const hint = page.locator('.dropzone-hint');
    expect(await css(hint, 'font-size', 'color')).toEqual(['14px', 'rgb(102, 102, 102)']);
    expect((await box(hint)).y).toBeGreaterThan((await box(plus)).y + 36 - 1);
  });

  test('U4 thumbnails: two uploads show two thumbs inside the zone, radius 12, remove button top right', async ({ page }) => {
    await page.getByLabel('Ảnh sản phẩm').setInputFiles([image('a.png'), image('b.png')]);
    const thumbs = page.locator('.dropzone .thumbs img');
    await expect(thumbs).toHaveCount(2);
    const z = await box(page.locator('.dropzone'));
    for (const i of [0, 1]) {
      const t = await box(thumbs.nth(i));
      expect(t.x).toBeGreaterThanOrEqual(z.x);
      expect(t.x + t.width).toBeLessThanOrEqual(z.x + z.width);
      expect(t.y).toBeGreaterThanOrEqual(z.y);
      expect(t.y + t.height).toBeLessThanOrEqual(z.y + z.height);
      expect((await css(thumbs.nth(i), 'border-top-left-radius'))[0]).toBe('12px');
    }
    const remove = page.getByRole('button', { name: 'Bỏ ảnh a.png' });
    const t0 = await box(thumbs.nth(0));
    const r = await box(remove);
    expect(r.x + r.width / 2).toBeGreaterThan(t0.x + t0.width / 2);
    expect(r.y + r.height / 2).toBeLessThan(t0.y + t0.height / 2);
    await remove.click();
    await expect(thumbs).toHaveCount(1);
  });

  test('K1 labels: 14px/21px weight 500, black, 6px above the control', async ({ page }) => {
    const label = page.locator('label.field-label', { hasText: 'Thời lượng' });
    expect(await css(label, 'font-size', 'line-height', 'font-weight', 'color')).toEqual(['14px', '21px', '500', 'rgb(0, 0, 0)']);
    const l = await box(label);
    near((await box(select(page, 'Thời lượng'))).y - (l.y + l.height), 6, 'label to control', 1);
  });

  test('K2 selects: 39 tall, rgb(242,242,242), radius 8, 1px transparent border, padding 8px 10px, 14px/21px, no native select', async ({ page }) => {
    expect(await page.locator('.form-card select').count()).toBe(0);
    for (const label of ['Mẫu chuyển động', 'Tỉ lệ khung hình', 'Thời lượng', 'Cửa hàng/Thương hiệu']) {
      const trigger = select(page, label);
      const b = await box(trigger);
      sized(b, 268, 39, label);
      expect(await css(trigger, 'background-color', 'border-top-left-radius', 'border-top-width', 'border-top-color', 'padding-top', 'padding-right', 'font-size', 'line-height')).toEqual(['rgb(242, 242, 242)', '8px', '1px', 'rgba(0, 0, 0, 0)', '8px', '10px', '14px', '21px']);
      expect(await trigger.locator('svg').count(), `${label} has a leading icon and a chevron`).toBe(2);
    }
  });

  test('K2 select popover: 3px under the trigger, as wide, max-height 280, padding-top 6, heading row 36, options padding 10px 16px, selected rgba(0,0,0,.06), grey border and up chevron while open', async ({ page }) => {
    const trigger = select(page, 'Thời lượng');
    await trigger.click();
    const pop = page.locator('.select-pop');
    const t = await box(trigger);
    const p = await box(pop);
    near(p.y, t.y + t.height + 3, 'popover top');
    near(p.width, t.width, 'popover width', 1);
    expect(await css(pop, 'max-height', 'padding-top', 'overflow-y', 'border-top-left-radius')).toEqual(['280px', '6px', 'auto', '8px']);
    const heading = page.locator('.select-heading');
    near((await box(heading)).height, 36, 'heading height');
    expect(await css(heading, 'padding-top', 'padding-right', 'padding-bottom')).toEqual(['10px', '16px', '8px']);
    const options = page.getByRole('listbox', { name: 'Thời lượng', exact: true }).getByRole('option');
    expect(await css(options.first(), 'padding-top', 'padding-right', 'padding-bottom', 'padding-left')).toEqual(['10px', '16px', '10px', '16px']);
    const selected = options.and(page.locator('[aria-selected="true"]'));
    expect((await css(selected, 'background-color'))[0]).toBe('rgba(0, 0, 0, 0.06)');
    await expect.poll(async () => (await css(trigger, 'border-top-color'))[0]).toBe('rgb(204, 204, 204)'); // it fades in over .15s
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await trigger.locator('svg').count()).toBe(2); // leading icon and the up chevron
    await trigger.click();
    await expect(pop).toBeHidden();
  });

  test('K3 model picker: a 39 px select-style button and a floating panel 8px to its right (334 wide, radius 8, search 292x29, 56px rows, selected rgba(0,0,0,.06) with a check)', async ({ page }) => {
    const trigger = modelButton(page);
    sized(await box(trigger), 268, 39, 'model button');
    expect((await css(trigger, 'background-color'))[0]).toBe('rgb(242, 242, 242)');
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
    const t = await box(trigger);
    const p = await box(panel);
    near(p.x, t.x + t.width + 8, 'panel x');
    near(p.y, t.y, 'panel y');
    near(p.width, 334, 'panel width');
    expect(p.height).toBeLessThanOrEqual(446 + 2);
    expect(await css(panel, 'position', 'z-index', 'border-top-left-radius', 'box-shadow', 'background-color')).toEqual(['fixed', '200', '8px', 'rgba(0, 0, 0, 0.12) 0px 4px 16px 0px', 'rgb(255, 255, 255)']);
    const search = panel.locator('.model-search');
    sized(await box(search), 292, 29, 'search');
    expect(await css(search, 'background-color', 'border-top-left-radius')).toEqual(['rgb(242, 242, 242)', '8px']);
    expect(await css(panel.locator('input'), 'font-size')).toEqual(['14px']);
    expect(await css(panel.locator('.model-group').first(), 'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'color')).toEqual(['10px', '700', '0.5px', 'uppercase', 'rgb(153, 153, 153)']);
    const row = panel.getByRole('option', { name: /Mock E2E/ });
    near((await box(row)).height, 56, 'row height');
    expect(await css(row, 'padding-top', 'padding-left', 'background-color')).toEqual(['6px', '12px', 'rgba(0, 0, 0, 0.06)']);
    expect(await row.locator('svg').count(), 'a check on the selected row').toBe(1);
    await expect(panel.getByText('Tỉ lệ đạt: 80% (8/10)')).toBeVisible();
    await expect(panel.getByText('Ước tính: $0.8000')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('K4 prompt box: wrapper rgb(242,242,242) with a 1px rgb(230,230,230) border, radius 8, padding 0 8px 8px, 268x121; textarea 250x75, 14px/21px, transparent', async ({ page }) => {
    const wrapper = page.locator('.prompt-box');
    sized(await box(wrapper), 268, 121, 'prompt box', 2);
    expect(await css(wrapper, 'background-color', 'border-top-width', 'border-top-color', 'border-top-left-radius', 'padding-top', 'padding-right', 'padding-bottom')).toEqual(['rgb(242, 242, 242)', '1px', 'rgb(230, 230, 230)', '8px', '0px', '8px', '8px']);
    const area = page.getByLabel('Mô tả chuyển động');
    sized(await box(area), 250, 75, 'textarea');
    expect(await css(area, 'font-size', 'line-height', 'background-color')).toEqual(['14px', '21px', 'rgba(0, 0, 0, 0)']);
  });

  test('T1 pill tabs: 37 tall, padding 8px 20px, radius 8, 14px/600, active black on white, inactive rgb(102,102,102) on no background, no bottom border', async ({ page }) => {
    const active = tab(page, 'Lịch sử');
    const inactive = tab(page, 'Ví dụ');
    near((await box(active)).height, 37, 'tab height');
    expect(await css(active, 'padding-top', 'padding-right', 'border-top-left-radius', 'font-size', 'font-weight', 'background-color', 'color')).toEqual(['8px', '20px', '8px', '14px', '600', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
    expect(await css(inactive, 'background-color', 'color')).toEqual(['rgba(0, 0, 0, 0)', 'rgb(102, 102, 102)']);
    expect((await css(page.locator('.tabs'), 'border-bottom-width'))[0]).toBe('0px');
  });

  test('T2 tabs sit centred over the grid with their top at y=24', async ({ page }) => {
    const tabs = await box(page.locator('.tabs'));
    const side = await box(page.locator('.side'));
    near(tabs.y, 24, 'tabs top');
    near(tabs.x + tabs.width / 2, side.x + side.width / 2, 'tabs centre', 4);
  });

  test('G1 G2 G3 G4 examples grid: 3 columns of 245 with 8 px gaps, four tile heights, radius 14, no caption row, grid top at y=81 and a 48 px right edge', async ({ page }) => {
    await tab(page, 'Ví dụ').click();
    const grid = page.locator('.masonry');
    await expect(page.locator('.masonry video')).not.toHaveCount(0);
    const g = await box(grid);
    near(g.y, 81, 'grid top', 6);
    near(g.width, 752, 'grid width');
    near(g.x + g.width, await page.evaluate(() => document.documentElement.clientWidth - 48), 'grid right edge');

    const cols = await page.locator('.masonry-col').evaluateAll((els) => els.map((c) => [...c.children].map((li) => li.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }))));
    expect(cols).toHaveLength(3);
    for (const [i, col] of cols.entries()) {
      near(col[0]!.width, 245, `column ${i} width`);
      if (i > 0) near(col[0]!.x - (cols[i - 1]![0]!.x + cols[i - 1]![0]!.width), 8, 'column gap');
      for (const [j, tile] of col.entries()) if (j > 0) near(tile.y - (col[j - 1]!.y + col[j - 1]!.height), 8, 'row gap', 1);
    }
    const heights = cols.flat().map((t) => Math.round(t.height));
    for (const want of [138, 245, 327, 436]) expect(heights.some((h) => Math.abs(h - want) <= 3), `a tile of ${want} px in ${heights}`).toBe(true);
    // The first nine tiles in reading order (row by row across the columns) already differ in height.
    const firstNine = cols.flat().sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 9).map((t) => Math.round(t.height / 4));
    expect(new Set(firstNine).size).toBeGreaterThanOrEqual(3);

    const tile = page.locator('.example').first();
    expect(await css(tile, 'border-top-left-radius', 'overflow', 'cursor')).toEqual(['14px', 'hidden', 'pointer']);
    expect(await page.locator('.example').evaluateAll((els) => els.every((li) => li.lastElementChild!.getBoundingClientRect().bottom <= li.getBoundingClientRect().bottom + 0.5))).toBe(true);
    expect((await css(page.locator('.example-caption').first(), 'opacity'))[0]).toBe('0'); // the title shows on hover only
  });

  test('G3 hover: the tile lifts 3 px with a shadow and a 180x46 radius-8 button fades in 15 px from the bottom', async ({ page }) => {
    await tab(page, 'Ví dụ').click();
    const tile = page.locator('.example').filter({ hasText: 'Toàn cảnh trượt ngang' });
    const use = tile.getByRole('button', { name: 'Dùng mẫu này: Toàn cảnh trượt ngang' });
    await tile.scrollIntoViewIfNeeded();
    expect((await css(use, 'opacity'))[0]).toBe('0');
    await tile.hover();
    await expect.poll(async () => (await css(tile, 'transform'))[0]).toBe('matrix(1, 0, 0, 1, 0, -3)');
    await expect.poll(async () => (await css(use, 'opacity'))[0]).toBe('1');
    expect((await css(tile, 'box-shadow'))[0]).toBe('rgba(0, 0, 0, 0.13) 0px 8px 28px 0px');
    expect(await css(tile, 'transition-property', 'transition-duration')).toEqual(['transform, box-shadow', '0.2s, 0.2s']);
    expect(await css(use, 'border-top-left-radius', 'transition-property', 'transition-duration', 'transition-timing-function')).toEqual(['8px', 'opacity', '0.18s', 'ease-in-out']);
    const t = await box(tile);
    const b = await box(use);
    sized(b, 180, 46, 'use button');
    near(b.x + b.width / 2, t.x + t.width / 2, 'button centre');
    near(t.y + t.height - (b.y + b.height), 15, 'button from the bottom');
  });

  test('R1 R2 Run button: 272x56 at y=912, black, white 16px/500, radius 8, padding 12px 16px, cost inside', async ({ page }) => {
    const run = page.getByRole('button', { name: 'Tạo video' });
    await expect(run).toBeInViewport();
    const b = await box(run);
    sized(b, 272, 56, 'run');
    near(b.y, 912, 'run y');
    expect(await css(run, 'background-color', 'color', 'font-size', 'font-weight', 'border-top-left-radius', 'padding-top', 'padding-right', 'column-gap', 'justify-content')).toEqual(['rgb(0, 0, 0)', 'rgb(255, 255, 255)', '16px', '500', '8px', '12px', '16px', '12px', 'center']);
    await expect(run).toContainText('$0.8000');
  });

  test('history empty state: 14px rgb(102,102,102)', async ({ page }) => {
    await page.route(/\/api\/jobs\?mine/, (r) => r.fulfill({ json: { jobs: [], workerOffline: false } }));
    await page.reload();
    const empty = page.getByText('Chưa có job nào.');
    await expect(empty).toBeVisible();
    expect(await css(empty, 'font-size', 'color')).toEqual(['14px', 'rgb(102, 102, 102)']);
  });

  test('focus: the controls show a 2px outline when reached by keyboard', async ({ page }) => {
    await page.keyboard.press('Tab');
    for (const target of [select(page, 'Thời lượng'), page.locator('.dropzone-pick'), modelButton(page), tab(page, 'Lịch sử'), page.getByRole('button', { name: 'Chọn mẫu khác' })]) {
      await target.focus();
      expect(await css(target, 'outline-style', 'outline-width')).toEqual(['solid', '2px']);
    }
  });
});

test.describe('1280x800', () => {
  test.beforeEach(async ({ page }) => openCreate(page, LAPTOP));

  test('R1 C2 Run is visible at first paint and stays put while the form scrolls inside the card', async ({ page }) => {
    const run = page.getByRole('button', { name: 'Tạo video' });
    await expect(run).toBeInViewport();
    const b = await box(run);
    near(b.y, 712, 'run y');
    const card = await box(page.locator('.form-card'));
    near(card.height, 776, 'card height');
    const scroller = page.locator('.form-scroll');
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    near((await box(run)).y, b.y, 'run y after scrolling the form', 1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  });

  test('V01 example dialog at 1440: 1100x501 centred, radius 14, the clip left of a 219 px column with 32 px Previous/Next and a 36 px button', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await tab(page, 'Ví dụ').click();
    await page.getByRole('button', { name: 'Xoay quanh chậm', exact: true }).click({ position: { x: 12, y: 12 } });
    const dialog = page.getByRole('dialog', { name: 'Chi tiết mẫu' });
    const d = await box(dialog);
    sized(d, 1100, 501, 'dialog');
    near(d.x, 170, 'dialog x');
    near(d.y, 250, 'dialog y');
    expect(await css(dialog, 'border-top-left-radius', 'background-color')).toEqual(['14px', 'rgb(255, 255, 255)']);
    const info = await box(dialog.locator('.detail-info'));
    near(info.width, 219, 'details column width');
    near(info.x + info.width, d.x + d.width, 'details column right edge');
    const media = await box(dialog.locator('.detail-media .preview'));
    expect(media.x + media.width).toBeLessThanOrEqual(info.x + 0.5);
    near(media.height, 501, 'square clip height'); // a 1:1 clip fills the height
    for (const name of ['Mẫu trước', 'Mẫu sau']) {
      const b = dialog.getByRole('button', { name });
      sized(await box(b), 32, 32, name);
      expect(await css(b, 'border-top-left-radius', 'background-color', 'color')).toEqual(['6px', 'rgb(242, 242, 242)', 'rgb(77, 77, 77)']);
    }
    const use = dialog.getByRole('button', { name: 'Dùng mẫu này' });
    const u = await box(use);
    sized(u, 187, 36, 'use button');
    near(d.y + d.height - (u.y + u.height), 16, 'use button bottom inset', 3);
    near((await box(dialog.getByRole('button', { name: 'Mẫu sau' }))).y + 32 + 6, u.y, 'Previous/Next sit 6 px above the button');
    expect(await css(use, 'background-color', 'color', 'border-top-left-radius', 'font-size')).toEqual(['rgb(0, 0, 0)', 'rgb(255, 255, 255)', '8px', '12px']);
  });

  test('S5 T2 G4 the layout holds at 1280: card at x=288, tabs centred over a grid that starts at y=81', async ({ page }) => {
    near((await box(page.locator('.form-card'))).x, 288, 'card x');
    const tabs = await box(page.locator('.tabs'));
    const side = await box(page.locator('.side'));
    near(tabs.x + tabs.width / 2, side.x + side.width / 2, 'tabs centre', 4);
    await tab(page, 'Ví dụ').click();
    near((await box(page.locator('.masonry'))).y, 81, 'grid top', 6);
  });
});

test.describe('1536 px and wider', () => {
  const columns = (page: Page) => page.locator('.masonry-col');

  test('V09 the examples grid has 4 columns from 1536 px and 3 just below, filled shortest column first', async ({ page }) => {
    await openCreate(page, { width: 1536, height: 900 });
    await tab(page, 'Ví dụ').click();
    await expect(columns(page)).toHaveCount(4);
    // Every tile went to the column that was shortest so far, so no column ends more than one tile below another.
    const bottoms = await columns(page).evaluateAll((els) => els.map((c) => c.getBoundingClientRect().height));
    const tallest = await page.locator('.example').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().height)));
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(tallest + 8);
    await page.setViewportSize({ width: 1535, height: 900 });
    await expect(columns(page)).toHaveCount(3);
  });
});

test.describe('390x844', () => {
  test.beforeEach(async ({ page }) => openCreate(page, PHONE));

  test('N1 top bar: 57 tall, sticky, white, above the content, hairline bottom border, 40x40 radius-10 menu button, 18px/600 title at x=52', async ({ page }) => {
    const bar = page.locator('.topbar');
    near((await box(bar)).height, 57, 'top bar height');
    expect(await css(bar, 'position', 'background-color', 'z-index', 'border-bottom-width', 'border-bottom-color')).toEqual(['sticky', 'rgb(255, 255, 255)', '99', '1px', 'rgba(0, 0, 0, 0.1)']);
    const menu = page.getByRole('button', { name: 'Mở menu' });
    sized(await box(menu), 40, 40, 'menu button');
    expect(await css(menu, 'border-top-left-radius', 'border-top-width', 'background-color')).toEqual(['10px', '0px', 'rgba(0, 0, 0, 0)']);
    const title = bar.locator('strong');
    expect(await css(title, 'font-size', 'font-weight', 'color')).toEqual(['18px', '600', 'rgb(26, 26, 26)']);
    near((await box(title)).x, 52, 'title x');
  });

  test('N2 C4 one visible Create title: the top bar title only', async ({ page }) => {
    expect(await visibleTitles(page)).toEqual(['Tạo video']);
  });

  test('N3 card: x=16, 358 wide, radius 8, same shadow, padding 24, tabs at y=73', async ({ page }) => {
    const card = page.locator('.form-card');
    const b = await box(card);
    near(b.x, 16, 'card x');
    near(b.width, 358, 'card width');
    near(b.y, 119, 'card y');
    expect(await css(card, 'border-top-left-radius', 'box-shadow', 'padding-top', 'padding-left')).toEqual(['8px', SHADOW, '24px', '24px']);
    near((await box(page.locator('.tabs'))).y, 73, 'tabs top');
  });

  test('N4 Run: 358x60, radius 8, pinned 12px above the bottom of the screen, no separate bar, cost inside', async ({ page }) => {
    const run = page.getByRole('button', { name: 'Tạo video' });
    const b = await box(run);
    sized(b, 358, 60, 'run');
    near(b.y, 772, 'run y');
    near(b.y + b.height, 844 - 12, 'run bottom');
    expect(await css(run, 'border-top-left-radius', 'background-color')).toEqual(['8px', 'rgb(0, 0, 0)']);
    expect(await css(page.locator('.runbar'), 'box-shadow', 'background-color', 'border-top-width')).toEqual(['none', 'rgba(0, 0, 0, 0)', '0px']);
    await expect(run).toContainText('$0.8000');
  });

  test('T3 narrow tabs: three equal pills, 30 tall, padding 6px 4px, radius 8, 12px/600, 2px gaps, active black on white', async ({ page }) => {
    const names = ['Tạo', 'Lịch sử', 'Ví dụ'];
    const boxes = await Promise.all(names.map((n) => box(tab(page, n))));
    for (const [i, b] of boxes.entries()) {
      near(b.height, 30, `tab ${i} height`);
      near(b.width, boxes[0]!.width, `tab ${i} width`, 1);
      if (i > 0) near(b.x - (boxes[i - 1]!.x + boxes[i - 1]!.width), 2, 'tab gap', 1);
    }
    expect(await css(tab(page, 'Lịch sử'), 'padding-top', 'padding-right', 'border-top-left-radius', 'font-size', 'font-weight')).toEqual(['6px', '4px', '8px', '12px', '600']);
    expect(await css(tab(page, 'Tạo'), 'background-color', 'color')).toEqual(['rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
  });

  test('drawer motion: 85vw, .28s cubic-bezier(.2,.7,.2,1), overlay rgba(0,0,0,.5), body scroll lock, 300x37 nav items; an overlay click or Escape closes it', async ({ page }) => {
    const menu = page.getByRole('button', { name: 'Mở menu' });
    const drawer = page.locator('.sidebar');
    const overlay = page.locator('.scrim');
    await menu.click();
    await expect.poll(async () => (await box(drawer)).x).toBeGreaterThanOrEqual(-1);
    near((await box(drawer)).width, 0.85 * 390, 'drawer width');
    expect(await css(drawer, 'z-index', 'background-color', 'padding-top', 'padding-left', 'box-shadow', 'transition-property', 'transition-duration', 'transition-timing-function')).toEqual([
      '999', 'rgb(250, 250, 250)', '16px', '16px', 'none', 'transform', '0.28s', 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    ]);
    expect(await css(overlay, 'z-index', 'background-color', 'position', 'transition-property', 'transition-duration')).toEqual(['998', 'rgba(0, 0, 0, 0.5)', 'fixed', 'opacity', '0.28s']);
    expect(await css(page.locator('body'), 'overflow')).toEqual(['hidden']);
    sized(await box(nav(page).getByRole('link', { name: 'Thư viện' })), 300, 37, 'drawer nav item');

    await page.mouse.click(370, 400); // the overlay
    await expect(drawer).toBeHidden();
    expect(await css(page.locator('body'), 'overflow')).toEqual(['visible']);
    await menu.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
  });
});

test.describe('390x844 with touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('G3 on touch the tile caption and the "use this sample" button are always visible, in two columns', async ({ page }) => {
    await openCreate(page, PHONE);
    await tab(page, 'Ví dụ').click();
    await expect(page.locator('.masonry-col')).toHaveCount(2);
    const use = page.locator('.example-use').first();
    await use.scrollIntoViewIfNeeded();
    expect((await css(use, 'opacity'))[0]).toBe('1');
    expect((await css(page.locator('.example-caption').first(), 'opacity'))[0]).toBe('1');
  });
});

test.describe('the 1024 px switch', () => {
  test('S1 T1 T3 1024 px has the sidebar and 37 px pills; 1023 px has the top bar and 30 px pills', async ({ page }) => {
    await openCreate(page, { width: 1024, height: 800 });
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.topbar')).toBeHidden();
    near((await box(tab(page, 'Lịch sử'))).height, 37, 'tab height at 1024');
    await page.setViewportSize({ width: 1023, height: 800 });
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
    near((await box(tab(page, 'Lịch sử'))).height, 30, 'tab height at 1023');
  });
});
