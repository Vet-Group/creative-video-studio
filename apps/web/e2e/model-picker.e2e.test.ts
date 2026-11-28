// The model picker on Create video with a long list served by a route (no real model is enabled or run): the panel stays open and follows its button
// while the page scrolls (owner request 2026-11-28: a stray wheel outside the panel lost the search), and closes once the button has left the screen.
import { expect, type Page, test } from '@playwright/test';
import { modelButton, pickModel, signIn } from './support.test';

const model = (id: string, label: string, score: number, more: object = {}) => ({
  id, label, pairIds: [id], provider: 'fal', isMock: false, ratios: ['9:16', '1:1'], durationsSec: [4, 8, 15], maxImages: 4, maxPromptChars: 2000, resolution: '1080p',
  estimateUsd: '1.0000', audioEstimateUsd: null, endFrame: false, endMaxSec: null, textOnly: false, audioClips: null, passRate: null, passes: 8, total: 10,
  score, recommended: false, isNew: false, supported: true, ...more,
});
// A model makes audio when it has an audio price (CreateForm's mapping).
const MODELS = [
  model('seedance-2.0', 'Seedance 2.0', 80, { recommended: true, audioEstimateUsd: '1.5000' }),
  model('seedance-1.5-pro', 'Seedance 1.5 Pro', 60, { resolution: '720p', estimateUsd: '0.4000' }),
  model('kling-2.5-turbo-pro', 'Kling 2.5 Turbo Pro', 70, { durationsSec: [5, 10] }),
  model('kling-2.6', 'Kling 2.6', 40, { resolution: '720p', durationsSec: [5, 10], isNew: true }),
  model('veo-3.1', 'Veo 3.1', 65, { audioEstimateUsd: '2.0000', estimateUsd: '3.2000' }),
  model('veo-3.1-lite', 'Veo 3.1 Lite', 55, { audioEstimateUsd: '1.0000', resolution: '720p', estimateUsd: '0.8000' }),
  model('wan-2.6', 'Wan 2.6', 50),
  model('minimax-hailuo-02', 'Hailuo 02', 45, { resolution: '768p', durationsSec: [6, 10] }),
  model('grok-imagine-1.5', 'Grok Imagine 1.5', 30, { isNew: true }),
];

async function openCreate(page: Page, size: { width: number; height: number }) {
  await page.route(/\/api\/models\?/, (r) => r.fulfill({ json: { models: MODELS, defaultModelId: 'seedance-2.0', monthToDate: { usd: '0.0000', provisional: false } } }));
  await page.setViewportSize(size);
  await signIn(page, 'pickra');
  await expect(modelButton(page)).toContainText('Seedance 2.0');
}

test('the panel stays open and follows its button while the page scrolls, and closes once the button leaves the screen', async ({ page }, testInfo) => {
  await openCreate(page, { width: 1440, height: 560 });
  const button = modelButton(page);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
  const search = panel.getByRole('combobox', { name: 'Tìm mô hình' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/\$1\.50(?!\d)/); // a price reads as the forms' usd() prints it, never as the raw four decimals
  await expect(panel).not.toContainText('$1.5000');
  await search.fill('kling');
  const attached = async () => {
    const b = (await button.boundingBox())!;
    const p = (await panel.boundingBox())!;
    expect(Math.abs(p.x - (b.x + b.width + 8))).toBeLessThanOrEqual(2); // beside the button, as on a desktop
    expect(Math.abs(p.y - Math.max(8, Math.min(b.y, 560 - 446 - 8)))).toBeLessThanOrEqual(2); // at the button's top, kept on the screen
  };
  await attached();
  const opened = (await panel.boundingBox())!;

  // A wheel over the form (outside the panel) scrolls the page; the panel stays, keeps the search and follows the button.
  const start = (await button.boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + start.height / 2);
  await page.mouse.wheel(0, 80);
  await expect.poll(async () => (await button.boundingBox())!.y).toBeLessThan(start.y - 40);
  await expect(panel).toBeVisible();
  await expect(search).toHaveValue('kling');
  await expect.poll(async () => { try { await attached(); return true; } catch { return false; } }).toBe(true);
  // Past the line where the panel sat clamped to keep the whole list on the screen, it moves with the button.
  for (let i = 0; i < 10 && (await button.boundingBox())!.y >= opened.y - 20; i++) await page.mouse.wheel(0, 40);
  await expect.poll(async () => { try { await attached(); return true; } catch { return false; } }).toBe(true);
  expect((await panel.boundingBox())!.y).toBeLessThan(opened.y - 10);
  await page.screenshot({ path: testInfo.outputPath('picker-follows-scroll.png') });

  // A wheel over the list at its end does not carry on into the page.
  const list = panel.getByRole('listbox', { name: 'Mô hình' });
  await expect(list).toHaveCSS('overscroll-behavior-y', 'contain');

  // A height-only resize (a touch keyboard) keeps it open.
  await page.setViewportSize({ width: 1440, height: 540 });
  await expect(panel).toBeVisible();

  // Once the button has scrolled off the screen, the panel closes, and the focus is not pulled back to the button (nor the page with it).
  await page.mouse.move(start.x + 20, 300);
  for (let i = 0; i < 20 && (await panel.isVisible()); i++) await page.mouse.wheel(0, 200);
  await expect(panel).toBeHidden();
  const b = (await button.boundingBox())!;
  expect(b.y + b.height).toBeLessThan(0);
  await expect(button).not.toBeFocused();

  // A width change closes it, as the side it opened on may no longer fit.
  await page.mouse.wheel(0, -4000);
  await expect.poll(async () => (await button.boundingBox())!.y).toBeGreaterThan(0);
  await button.click();
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 1400, height: 540 });
  await expect(panel).toBeHidden();
});

test('a page scroll closes a family flyout beside the panel and puts the active row back on the family, so Enter does not pick by the flyout index', async ({ page }) => {
  await openCreate(page, { width: 1440, height: 560 });
  const button = modelButton(page);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
  const search = panel.getByRole('combobox', { name: 'Tìm mô hình' });
  await panel.getByRole('button', { name: /^Nâng cao/ }).click();
  const kling = panel.getByRole('group', { name: 'Tất cả mô hình' }).getByRole('option').filter({ hasText: /^Kling/ });
  await kling.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // the list's scroll event lands first: a list scroll closes a side flyout
  await kling.click();
  const fly = panel.getByRole('group', { name: 'Kling', exact: true });
  await fly.getByRole('option', { name: /^Kling 2\.6/ }).hover();
  await expect(search).toHaveAttribute('aria-activedescendant', (await fly.getByRole('option', { name: /^Kling 2\.6/ }).getAttribute('id'))!);

  const b = (await button.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.mouse.wheel(0, 80);
  await expect(fly).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(search).toHaveAttribute('aria-activedescendant', (await kling.getAttribute('id'))!);
  await search.press('ArrowRight'); // the family opens again from its row
  await expect(fly).toBeVisible();
});

test('a search forgives typos and marks the matched letters, chips filter, and an empty result says why with a suggestion and a way back', async ({ page }) => {
  await openCreate(page, { width: 1440, height: 900 });
  await modelButton(page).click();
  const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
  const search = panel.getByRole('combobox', { name: 'Tìm mô hình' });
  const options = panel.getByRole('listbox', { name: 'Mô hình' }).getByRole('option');

  await search.fill('klnig'); // two letters swapped
  await expect(options).toHaveText([/^Kling 2\.5 Turbo Pro/, /^Kling 2\.6/]);
  await search.fill('kling');
  await expect(options.first().locator('mark')).toHaveText('Kling');

  const audio = panel.getByRole('button', { name: 'Có âm thanh' });
  await search.fill('');
  await audio.click();
  await expect(audio).toHaveAttribute('aria-pressed', 'true');
  await expect(options).toHaveText([/^Seedance 2\.0/, /^Veo 3\.1(?! Lite)/, /^Veo 3\.1 Lite/]);

  // Nothing with audio is called Kling: the panel says so, suggests nothing outside the filter, and one button clears both.
  await search.fill('kling');
  await expect(options).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText('Không thấy mô hình khớp “kling” trong bộ lọc đã chọn.');
  await expect(panel.getByRole('button', { name: /^Ý bạn là/ })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Xoá tìm kiếm và bộ lọc' }).click();
  await expect(search).toHaveValue('');
  await expect(audio).toHaveAttribute('aria-pressed', 'false');
  await expect(options.first()).toBeVisible();

  // A long pasted query wraps inside the panel.
  await search.fill('x'.repeat(200));
  await expect(panel.getByRole('status')).toBeVisible();
  expect(await panel.getByRole('status').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  // A query that matches nothing offers the closest name, which picks it.
  await search.fill('kling 9');
  await expect(options).toHaveCount(0);
  await panel.getByRole('button', { name: 'Ý bạn là Kling 2.5 Turbo Pro?' }).click();
  await expect(panel).toBeHidden();
  await expect(modelButton(page)).toContainText('Kling 2.5 Turbo Pro');
});

test('the last picks lead the list under Dùng gần đây; a click outside keeps the search and filters for the next open, Escape starts afresh', async ({ page }) => {
  await openCreate(page, { width: 1440, height: 900 });
  await pickModel(page, /Veo 3.1 Lite/);
  await pickModel(page, /Wan 2.6/);
  await modelButton(page).click();
  const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
  const search = panel.getByRole('combobox', { name: 'Tìm mô hình' });
  await expect(panel.getByRole('group', { name: 'Dùng gần đây' }).getByRole('option')).toHaveText([/^Wan 2\.6/, /^Veo 3\.1 Lite/]);
  await expect(search).toHaveAttribute('aria-activedescendant', (await panel.getByRole('option', { name: /^Wan 2\.6/ }).getAttribute('id'))!); // on the chosen model

  const fresh = panel.getByRole('button', { name: 'Mới' });
  await search.fill('kling');
  await fresh.click();
  await expect(panel.getByRole('option')).toHaveText([/^Kling 2\.6/]);
  await page.getByText('Cài đặt video').click(); // a stray click beside the panel
  await expect(panel).toBeHidden();
  await modelButton(page).click();
  await expect(search).toHaveValue('kling');
  await expect(fresh).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('option')).toHaveText([/^Kling 2\.6/]);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await modelButton(page).click();
  await expect(search).toHaveValue('');
  await expect(fresh).toHaveAttribute('aria-pressed', 'false');

  // The whole list scrolled part way comes back where it was after a stray click.
  const list = panel.getByRole('listbox', { name: 'Mô hình' });
  await panel.getByRole('button', { name: /^Nâng cao/ }).click();
  await list.evaluate((el) => { el.scrollTop = 150; });
  await page.getByText('Cài đặt video').click();
  await expect(panel).toBeHidden();
  await modelButton(page).click();
  await expect(panel.getByRole('button', { name: /^Nâng cao/ })).toHaveCount(0);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(150);
});
