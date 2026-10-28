// UI parity (docs/UI-MOTION-PARITY.md): screenshot baselines on frozen data, the layout on both sides of the 1024 px breakpoint,
// the drawer, the tabs, the preset picker grid, and the rule that choosing a preset creates no job.
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { EXAMPLES } from '../src/lib/examples';
import { freezeData } from './frozen.test';
import { expectOptions, jpg, modelButton, optionsOf, pickModel, png, presetOf, select, selectValue, signIn } from './support.test';

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
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(page.locator('.banner')).toHaveAttribute('aria-busy', 'false'); // the presets have loaded
  await select(page, 'Cửa hàng/Thương hiệu').click();
  await expect(optionsOf(page, 'Cửa hàng/Thương hiệu')).not.toHaveCount(1); // the empty choice and at least one store
  await select(page, 'Cửa hàng/Thương hiệu').click();
  // Opening the store list scrolled the form and left the focus on it; the specs and baselines start from a fresh load.
  await page.reload();
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(page.locator('.banner')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Tháng này bạn đã dùng: $0.0000')).toBeVisible();
}

const narrow = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** Opens a sample's details: the whole tile is the button, but its centre holds the play button under reduced motion, so click a corner. */
const openTile = (page: Page, title: string) => page.getByRole('button', { name: title, exact: true }).click({ position: { x: 12, y: 12 } });

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
    // The History card shows the clip's video with its poster: wait for the poster to load so the screenshot is stable.
    const poster = await page.getByRole('complementary', { name: 'Job của tôi' }).locator('video').getAttribute('poster');
    await page.evaluate((src) => new Promise((done) => Object.assign(new Image(), { onload: done, src })), poster!);
    await expect(page).toHaveScreenshot(`create-history-${at}.png`, SHOT);

    await page.getByRole('tab', { name: 'Ví dụ' }).click();
    await expect(page.getByRole('button', { name: /^Phát / })).toHaveCount(EXAMPLES.length);
    await expect(page.locator('.masonry video')).toHaveCount(EXAMPLES.length);
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
      await expect(tabs).toHaveText(['Lịch sử', 'Ví dụ', 'Giới thiệu']);
      await expect(page.getByRole('tab', { name: 'Ví dụ' })).toHaveAttribute('aria-selected', 'true');
      await expect(form).toBeVisible();
      // Two columns: the form card sits left of the pane.
      const card = (await form.boundingBox())!;
      const pane = (await page.locator('.side').boundingBox())!;
      expect(card.x + card.width).toBeLessThanOrEqual(pane.x);
      // The card fits the screen and the Run button is pinned in it, visible without scrolling.
      expect(card.y + card.height).toBeLessThanOrEqual(size.height);
      await expect(run).toBeInViewport();
    } else {
      await expect(nav).toBeHidden();
      await expect(menu).toBeVisible();
      await expect(tabs).toHaveText(['Tạo', 'Lịch sử', 'Ví dụ', 'Giới thiệu']);
      await expect(page.getByRole('tab', { name: 'Tạo', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(form).toBeVisible();
      await expect(page.locator('.side')).toBeHidden();
      // The Run button stays at the bottom edge while the form, taller than the card, scrolls inside it.
      await page.evaluate(() => window.scrollTo(0, 0));
      const scroller = page.locator('.form-scroll');
      expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const bar = (await page.locator('.runbar').boundingBox())!;
      expect(Math.abs(bar.y + bar.height - (size.height - 12))).toBeLessThanOrEqual(2);
      await expect(run).toBeInViewport();
      await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      expect(Math.abs((await page.locator('.runbar').boundingBox())!.y - bar.y)).toBeLessThanOrEqual(1);
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
  await expect(nav.getByRole('link', { name: 'Khám phá' })).toBeFocused();
  // The page behind the drawer is out of the focus order.
  for (const name of ['Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện']) {
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name })).toBeFocused();
  }

  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(nav).toBeVisible();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
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
    const order = width >= 1024 ? ['Ví dụ', 'Giới thiệu', 'Lịch sử'] : ['Tạo', 'Lịch sử', 'Ví dụ', 'Giới thiệu']; // from the open tab; the arrows wrap
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
    await expect(tab('Giới thiệu')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Tạo video sản phẩm từ ảnh' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(tab('Ví dụ')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.masonry')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(tab(width >= 1024 ? 'Lịch sử' : 'Tạo')).toHaveAttribute('aria-selected', 'true'); // the first tab in the row
    if (width < 1024) await expect(page.locator('.form-card')).toBeVisible();
    else await expect(page.getByRole('complementary', { name: 'Job của tôi' })).toBeVisible();
  });
}

test('the preset picker is a vertically scrolling grid like the live one: 4 columns wide, 2 on a phone, the chosen card ringed', async ({ page }) => {
  for (const [width, height, columns] of [[1280, 800, 4], [390, 844, 2]] as const) {
    await page.setViewportSize({ width, height });
    if (width === 1280) await signIn(page, 'member5');
    await openCreate(page);
    await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
    const grid = page.getByRole('list', { name: 'Danh sách mẫu' });
    const cards = grid.getByRole('listitem');
    await expect(cards).toHaveCount(26); // 6 company presets, the 19 motion templates of migration 0020 and the free prompt
    const tops = await cards.evaluateAll((li) => li.slice(0, 8).map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops.filter((t) => t === tops[0]).length).toBe(columns);
    expect(await grid.evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
    const chosen = cards.filter({ has: page.locator('button[aria-pressed="true"]') });
    await expect(chosen).toHaveCount(1);
    await expect(cards.first().locator('button[aria-pressed="true"]')).toHaveText('Tự viết mô tả'); // the default comes first and ringed, as "General" does live
    expect(await chosen.locator(':scope > :first-child').evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
    // As on the live picker: the first row 16 px under the header rule, each clip flush with its card and its name 6 px under it.
    const sub = (await page.locator('dialog[open] .modal-sub').boundingBox())!;
    const card = (await cards.first().boundingBox())!;
    const clip = (await cards.first().locator(':scope > :first-child').boundingBox())!;
    const name = (await cards.first().locator(':scope > button').boundingBox())!;
    expect(Math.round(card.y - (sub.y + sub.height))).toBe(16);
    expect(Math.round(clip.y - card.y)).toBe(0);
    expect(Math.round(name.y - (clip.y + clip.height))).toBe(6);
    await page.keyboard.press('Escape');
    await expect(grid).toBeHidden();
    await expect(page.getByRole('button', { name: 'Chọn mẫu khác' })).toBeFocused();
  }
});

test('Create starts on a free prompt as on the live form: the prompt box open and Enhance on', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  await openCreate(page);
  await expect(presetOf(page)).toHaveAttribute('data-value', '');
  await expect(page.getByLabel('Mô tả chuyển động')).toBeEnabled();
  const enhance = page.getByRole('button', { name: 'Cải thiện mô tả bằng AI' });
  await expect(enhance).toHaveAttribute('aria-pressed', 'true');
  await expect(enhance).toHaveCSS('background-color', 'rgb(26, 26, 26)'); // filled when on, so its white label reads
});

test('choosing a preset or using an example fills the form and creates no job', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/jobs') && posts.push(r.url()));
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  await openCreate(page);
  const presetSelect = presetOf(page);
  const ratioSelect = select(page, 'Tỉ lệ khung hình');
  const before = (await presetSelect.getAttribute('data-value'))!;

  // The picker: a card fills the preset and closes the dialog.
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  await page.getByRole('list', { name: 'Danh sách mẫu' }).getByRole('button', { name: 'Ánh sáng quét nhẹ', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Danh sách mẫu' })).toBeHidden();
  await expect(presetSelect).toHaveAttribute('data-value', 'light-sweep');
  expect(before).not.toBe('light-sweep');
  await expect(page.locator('.banner-text strong')).toHaveText('Ánh sáng quét nhẹ');

  // An example: a click shows the details with a "use this sample" button, which fills preset, ratio and duration.
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  await openTile(page, 'Xoay quanh chậm');
  const detail = page.getByRole('dialog', { name: 'Chi tiết mẫu' });
  await expect(detail).toContainText('Mẫu minh họa');
  await expect(presetSelect).toHaveAttribute('data-value', 'light-sweep');
  await detail.getByRole('button', { name: 'Dùng mẫu này' }).click();
  await expect(detail).toBeHidden();
  await expect(presetSelect).toHaveAttribute('data-value', 'slow-orbit');
  await expect(ratioSelect).toHaveAttribute('data-value', '1:1');

  // The hover button on a tile does the same without the dialog; a 16:9 sample has no matching form ratio, so the form keeps its own.
  const tile = (title: string) => page.locator('.example').filter({ hasText: title });
  await tile('Cầm trên tay').hover();
  await tile('Cầm trên tay').getByRole('button', { name: 'Dùng mẫu này: Cầm trên tay' }).click();
  await expect(presetSelect).toHaveAttribute('data-value', 'handheld-product');
  await expect(ratioSelect).toHaveAttribute('data-value', '9:16');
  await tile('Toàn cảnh trượt ngang').hover();
  await tile('Toàn cảnh trượt ngang').getByRole('button', { name: 'Dùng mẫu này: Toàn cảnh trượt ngang' }).click();
  await expect(presetSelect).toHaveAttribute('data-value', 'light-sweep');
  await expect(ratioSelect).toHaveAttribute('data-value', '9:16');

  // Nothing was submitted, and the history is still empty.
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await expect(page.getByText('Chưa có job nào.')).toBeVisible();
  expect(posts).toEqual([]);
});

test('V01 Previous and Next step through every sample in order and stop at the ends; the tools and the use button submit nothing', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/jobs') && posts.push(r.url()));
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  await openCreate(page);
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  await openTile(page, EXAMPLES[0]!.title);
  const detail = page.getByRole('dialog', { name: 'Chi tiết mẫu' });
  const title = detail.getByRole('heading', { level: 2 });
  const specs = detail.getByRole('list', { name: 'Thông số' });
  const prev = detail.getByRole('button', { name: 'Mẫu trước' });
  const next = detail.getByRole('button', { name: 'Mẫu sau' });
  await expect(title).toHaveText(EXAMPLES[0]!.title);
  await expect(specs).toContainText(EXAMPLES[0]!.aspect);
  await expect(prev).toBeHidden(); // the first sample has no Previous, as on live
  for (const ex of EXAMPLES.slice(1)) {
    await next.click();
    await expect(title).toHaveText(ex.title);
    await expect(specs).toContainText(`${ex.durationSec}s`);
  }
  await expect(next).toBeHidden(); // and the last has no Next
  await expect(prev).toBeFocused(); // Next disappeared under the focus, which moved to Previous
  await prev.click();
  await expect(title).toHaveText(EXAMPLES.at(-2)!.title);
  await expect(prev).toBeFocused(); // the button keeps the focus while the sample changes
  const download = detail.getByRole('link', { name: 'Tải video mẫu' });
  await expect(download).toHaveAttribute('href', EXAMPLES.at(-2)!.src);
  await expect(download).toHaveAttribute('download', '');
  await expect(detail.getByRole('link', { name: 'Mở trong tab mới' })).toHaveAttribute('target', '_blank');
  await detail.getByRole('button', { name: 'Dùng mẫu này' }).click();
  await expect(detail).toBeHidden();
  expect(posts).toEqual([]);
});

test('V02 the upload limit and its hint follow the chosen model', async ({ page }) => {
  await page.route(/\/api\/models\?/, (r) => {
    const base = { provider: 'mock', isMock: true, estimateUsd: '0.1000', passRate: null, passes: 0, total: 0, ratios: ['9:16', '1:1'], durationsSec: [5, 8], supported: true };
    const models = [
      { ...base, id: 'two', label: 'Two image model', maxImages: 2 },
      { ...base, id: 'one', label: 'One image model', maxImages: 1 },
      { ...base, id: 'four', label: 'Four image model', maxImages: 4 },
    ];
    return r.fulfill({ json: { models, defaultModelId: 'two', monthToDate: { usd: '0.0000', provisional: false } } });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  const pick = page.locator('.dropzone-pick');
  await expect(modelButton(page)).toContainText('Two image model');
  await expect(pick).toContainText('Tối đa 2 ảnh sản phẩm');
  await pickModel(page, /One image model/);
  await expect(pick).toContainText('Tối đa 1 ảnh sản phẩm');
  await pickModel(page, /Two image model/);
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(['a.png', 'b.png'].map((name) => ({ name, mimeType: 'image/png', buffer: png() })));
  await expect(pick).toContainText('Đã đủ 2 ảnh');
  await expect(pick).toBeDisabled();
  await pickModel(page, /Four image model/);
  await expect(pick).toContainText('2/4 ảnh, bấm hoặc kéo thêm');
  await expect(pick).toBeEnabled();
  await pickModel(page, /One image model/);
  await expect(page.getByText('Mô hình này nhận tối đa 1 ảnh.')).toBeVisible(); // too many for this model: Run stays off until one goes
  await expect(page.getByRole('button', { name: /^Tạo video/ })).toBeDisabled();
});

test('as on Fash, a sample with a details file shows its prompt, input photos, settings and date, and Dùng lại refills the form from it', async ({ page }) => {
  const details = { prompt: 'A slow orbit around the bottle.', images: [{ sample: 'example-2-input.png' }, { sample: 'example-2-ref.jpg' }], presetId: null, enhance: false, audio: 'off', ratio: '1:1', aspect: '1:1', durationSec: 8, modelId: null, storeId: null, date: '2026-08-18' };
  const files: [string, Buffer, string][] = [['example-2.json', Buffer.from(JSON.stringify(details)), 'application/json'], ['example-2-input.png', png(), 'image/png'], ['example-2-ref.jpg', jpg(), 'image/jpeg']];
  const asAdmin = async (each: (name: string, data: Buffer, type: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const [name, data, type] of files) expect((await each(name, data, type)).ok(), name).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name, data, type) => page.request.put(`/api/admin/samples/${name}`, { data, headers: { 'content-type': type } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'cvexa');
    await openCreate(page);
    await page.getByRole('tab', { name: 'Ví dụ' }).click();
    await openTile(page, 'Xoay quanh chậm');
    const detail = page.getByRole('dialog', { name: 'Chi tiết mẫu' });
    await expect(detail.locator('.detail-prompt')).toHaveText(details.prompt);
    await expect(detail.getByRole('list', { name: 'Ảnh đầu vào' }).getByRole('img')).toHaveCount(2);
    await expect(detail.getByRole('list', { name: 'Thông số' })).toHaveText('8s1:1');
    await expect(detail.locator('.detail-date')).toHaveText('18 thg 8, 2026');
    // The next sample has no details file: its own facts and the in-place "use this sample" as before.
    await detail.getByRole('button', { name: 'Mẫu sau' }).click();
    await expect(detail).toContainText('Mẫu minh họa');
    await expect(detail.getByRole('button', { name: 'Dùng mẫu này' })).toBeVisible();
    await expect(detail.locator('.detail-prompt')).toHaveCount(0);
    await detail.getByRole('button', { name: 'Mẫu trước' }).click();

    await detail.getByRole('link', { name: 'Dùng lại' }).click();
    await expect(page).toHaveURL(/\/create\?example=example-2$/);
    await expect(page.getByRole('img', { name: 'example-2-input.png' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'example-2-ref.jpg' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Mô tả chuyển động' })).toHaveValue(details.prompt);
    await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '1:1');
    await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '8');
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('a dialog closes on its backdrop, not on a click inside it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  await openCreate(page);
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  await openTile(page, 'Xoay quanh chậm');
  const detail = page.getByRole('dialog', { name: 'Chi tiết mẫu' });
  await expect(detail).toBeVisible();

  // The padding beside the video and the text under it are inside the dialog.
  await detail.locator('.modal-body').click({ position: { x: 20, y: 200 } });
  await detail.getByText('Mẫu minh họa').click();
  await expect(detail).toBeVisible();

  await page.mouse.click(5, 5); // the backdrop
  await expect(detail).toBeHidden();
});

test('the drawer closes on any link, even the current page, and on its close button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member5');
  const menu = page.getByRole('button', { name: 'Mở menu' });
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toHaveCount(0); // a dialog only while it is open

  await menu.click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await nav.getByRole('link', { name: 'Tạo video' }).click(); // the page already open
  await expect(nav).toBeHidden();
  await expect(page).toHaveURL(/\/create$/);

  await menu.click();
  await drawer.getByRole('button', { name: 'Đóng menu' }).click();
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();

  // The close button is for the drawer only.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('button', { name: 'Đóng menu' })).toBeHidden();
});

test('changing the model changes the ratio and duration options to the ones it supports', async ({ page }) => {
  await page.route(/\/api\/models\?/, (r) => {
    const q = new URL(r.request().url()).searchParams;
    const base = { provider: 'mock', isMock: true, maxImages: 4, estimateUsd: '0.1000', passRate: null, passes: 0, total: 0 };
    const models = [
      { ...base, id: 'wide', label: 'Wide model', ratios: ['9:16', '1:1'], durationsSec: [5, 8, 10] },
      { ...base, id: 'short', label: 'Short model', ratios: ['9:16'], durationsSec: [5] },
    ].map((m) => ({ ...m, supported: m.ratios.includes(q.get('ratio')!) && m.durationsSec.includes(Number(q.get('durationSec'))) }));
    return r.fulfill({ json: { models, defaultModelId: 'wide', monthToDate: { usd: '0.0000', provisional: false } } });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  const durations = (texts: string[]) => expectOptions(page, 'Thời lượng', texts);
  const ratios = (texts: string[]) => expectOptions(page, 'Tỉ lệ khung hình', texts);

  await expect(modelButton(page)).toContainText('Wide model');
  await durations(['5 giây', '8 giây', '10 giây']);
  await ratios(['9:16 (dọc)', '1:1 (vuông)']);
  await modelButton(page).click();
  await expect(page.getByRole('option', { name: /Wide model/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('option', { name: /Short model/ })).toHaveAttribute('aria-disabled', 'true'); // it has no 8 s clips
  await page.getByRole('option', { name: /Short model/ }).click({ force: true }); // a disabled model cannot be picked, even by a forced click
  await expect(modelButton(page)).toContainText('Wide model');
  await page.keyboard.press('Escape');
  await selectValue(page, 'Thời lượng', '5');
  await pickModel(page, /Short model/);
  await expect(modelButton(page)).toContainText('Short model');
  await durations(['5 giây']);
  await ratios(['9:16 (dọc)']);
  await pickModel(page, /Wide model/);
  await expect(modelButton(page)).toContainText('Wide model');
  await durations(['5 giây', '8 giây', '10 giây']);
  await ratios(['9:16 (dọc)', '1:1 (vuông)']);
});

test('the custom selects work by keyboard: arrows, Home, End, Enter, Space and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'member5');
  await openCreate(page);
  const duration = select(page, 'Thời lượng');
  const store = select(page, 'Cửa hàng/Thương hiệu');

  // Arrow keys open the list on the chosen option and move through it; Enter picks.
  await duration.focus();
  await expect(duration).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowDown');
  await expect(duration).toHaveAttribute('aria-expanded', 'true');
  await expect(optionsOf(page, 'Thời lượng').nth(1)).toHaveAttribute('aria-selected', 'true'); // 8 s is the default
  await page.keyboard.press('ArrowUp');
  await expect(duration).toHaveAttribute('aria-activedescendant', (await optionsOf(page, 'Thời lượng').first().getAttribute('id'))!);
  await page.keyboard.press('Enter');
  await expect(duration).toHaveAttribute('aria-expanded', 'false');
  await expect(duration).toHaveAttribute('data-value', '5');
  await expect(duration).toBeFocused();

  // Escape closes without choosing and keeps the focus.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(duration).toHaveAttribute('aria-expanded', 'false');
  await expect(duration).toHaveAttribute('data-value', '5');
  await expect(duration).toBeFocused();

  // Home and End jump to the ends; Space picks. The last store is the last option, "Không chọn" the first.
  await store.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Space');
  await expect(store).not.toHaveAttribute('data-value', '');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(store).toHaveAttribute('data-value', '');
});

test('the model picker opens a panel beside its button, searches, and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member5');
  await openCreate(page);
  const trigger = modelButton(page);

  await trigger.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
  const search = panel.getByRole('combobox', { name: 'Tìm mô hình' });
  await expect(search).toBeFocused();
  const t = (await trigger.boundingBox())!;
  const p = (await panel.boundingBox())!;
  expect(Math.abs(p.x - (t.x + t.width + 8))).toBeLessThanOrEqual(2); // 8 px right of the button
  expect(Math.abs(p.y - t.y)).toBeLessThanOrEqual(2); // top aligned with it

  await search.fill('zzz');
  await expect(panel.getByText('Không có mô hình nào khớp.')).toBeVisible();
  // The page scrolling under the fixed panel closes it, and the next open starts with an empty search.
  await page.mouse.move(1200, 600); // over the Examples, clear of the panel
  await page.mouse.wheel(0, 400);
  await expect(panel).toBeHidden();
  await trigger.click();
  await expect(search).toHaveValue('');
  await expect(panel.getByRole('option', { name: /Mock E2E/ })).toBeVisible();
  await search.fill('mock');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText('Mock E2E');
});

for (const width of [1440, 1280, 390]) {
  test(`the app shell keeps a sensible focus order and works by keyboard at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await signIn(page, 'member5');
    await openCreate(page);
    const wideScreen = width >= 1024;
    // The focused control's name as a screen reader gets it: its aria-label, else its text without the aria-hidden parts (the "Mới" pill).
    const focused = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const copy = el.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
        return el.getAttribute('aria-label') ?? copy.textContent?.trim();
      });
    const order = wideScreen ? ['Thu gọn thanh bên', 'Cài đặt', 'Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện', 'Ví dụ'] : ['Mở menu', 'Tạo']; // the open tab takes the tab stop

    for (const name of order) {
      await page.keyboard.press('Tab');
      await expect.poll(focused).toBe(name);
    }

    if (wideScreen) {
      // The persistent sidebar navigates without a mouse.
      await page.goto('/create');
      await expect(page.getByRole('tab', { name: 'Lịch sử' })).toBeVisible();
      for (let i = 0; i < 9; i++) await page.keyboard.press('Tab');
      await expect.poll(focused).toBe('Thư viện');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/library$/);
    }
  });
}
