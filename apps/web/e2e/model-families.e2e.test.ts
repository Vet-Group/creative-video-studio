// The model picker on a long list, as Fash shows it: the featured models, then one row per family whose models open in a flyout
// (beside the panel on a desktop, under the family's row at 390 px); a search shows a flat list. The list is the API's shape with
// real-looking ids, served by a route, so no real model is enabled or run.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { modelButton, pickModel, signIn } from './support.test';

const model = (id: string, label: string, score: number, more: object = {}) => ({
  id, label, provider: 'fal', isMock: false, ratios: ['9:16', '1:1'], durationsSec: [4, 8, 15], maxImages: 4, maxPromptChars: 2000, resolution: '1080p',
  estimateUsd: '1.0000', audioEstimateUsd: null, endFrame: false, textOnly: false, audioClips: null, passRate: null, passes: 0, total: 0,
  score, recommended: false, isNew: false, supported: true, ...more,
});
const MODELS = [
  model('seedance-2.0', 'Seedance 2.0', 80, { recommended: true, audioEstimateUsd: '1.5000' }),
  model('seedance-2.0-replicate', 'Seedance 2.0 (Replicate)', 75),
  model('kling-3.0-pro', 'Kling 3.0 Pro', 70, { isNew: true }),
  model('kling-2.6', 'Kling 2.6', 40, { resolution: '720p', durationsSec: [5, 10] }),
  model('veo-3.1', 'Google VEO 3.1', 65, { audioEstimateUsd: '2.0000' }),
  model('gemini-omni-flash', 'Gemini Omni Flash', 60),
  model('grok-imagine-1.5', 'Grok Imagine 1.5', 30),
  model('wan-2.7', 'WAN 2.7', 90, { supported: false }), // the best score, but ruled out: not featured, still listed and marked
  model('minimax-h3-max', 'Minimax H3 Max', 20),
  model('mock-e2e', 'Mock E2E', 50, { provider: 'mock', isMock: true, estimateUsd: '0.0000' }),
];

async function open(page: Page, width: number): Promise<{ panel: Locator; list: Locator }> {
  await page.route(/\/api\/models\?/, (r) => r.fulfill({ json: { models: MODELS, defaultModelId: 'seedance-2.0', monthToDate: { usd: '0.0000', provisional: false } } }));
  await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
  await signIn(page, 'famsa');
  await expect(modelButton(page)).toContainText('Seedance 2.0');
  await modelButton(page).click();
  const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
  const heading = panel.locator('.model-group').first();
  await expect(heading.locator('.icon')).toHaveCSS('display', 'inline-block');
  expect((await heading.boundingBox())!.height).toBe(27); // one 15px label line plus 8px/4px padding
  return { panel, list: panel.getByRole('listbox', { name: 'Mô hình' }) };
}

test('the picker opens on the featured models and the families; a family opens beside the panel by pointer and by keyboard', async ({ page }, testInfo) => {
  const { panel, list } = await open(page, 1440);
  const featured = list.getByRole('group', { name: 'Model nổi bật' }).getByRole('option');
  await expect(featured).toHaveText([/^Seedance 2\.0Có âm thanhĐề xuất/, /^Seedance 2\.0 \(Replicate\)/, /^Kling 3\.0 ProMỚI/, /^Google VEO 3\.1Có âm thanh/, /^Gemini Omni Flash/]);
  await expect(featured.first()).toContainText('1080p4s-15s$1.5000Điểm 80'); // the audio estimate, as the form starts with audio on
  await expect(featured.first()).toHaveAttribute('aria-selected', 'true');
  const families = list.getByRole('group', { name: 'Tất cả model' }).getByRole('option');
  await expect(families).toHaveText([/^Seedance/, /^Kling/, /^Google/, /^xAI/, /^Alibaba/, /^MiniMax/, /^Khác/]);
  await page.screenshot({ path: testInfo.outputPath('picker-desktop-initial.png') });

  // Hovering a family opens its models beside the panel, the supported first; picking one closes the panel.
  await families.filter({ hasText: /^Kling/ }).hover();
  const kling = list.getByRole('group', { name: 'Kling' });
  await expect(kling.getByRole('option')).toHaveText([/^Kling 3\.0 Pro/, /^Kling 2\.6.*720p5s-10s/]);
  const p = (await panel.boundingBox())!;
  const f = (await kling.boundingBox())!;
  expect(Math.abs(f.x - (p.x + p.width + 8))).toBeLessThanOrEqual(2);
  await families.filter({ hasText: /^Alibaba/ }).scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await families.filter({ hasText: /^Alibaba/ }).hover();
  await expect(list.getByRole('group', { name: 'Alibaba' }).getByRole('option', { name: /WAN 2\.7/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(kling).toHaveCount(0);
  // Include contrast: section labels must remain readable, not just match the reference.
  const axe = await new AxeBuilder({ page }).include('.model-pop').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await families.filter({ hasText: /^Kling/ }).hover();
  await expect(families.filter({ hasText: /^Kling/ })).toHaveAttribute('data-open', 'true');
  await expect(featured.first().getByText('Điểm 80')).toBeVisible();
  await expect(featured.first().locator('.model-sub')).toHaveText('1080p4s-15s$1.5000Điểm 80');
  await page.screenshot({ path: testInfo.outputPath('picker-desktop-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(panel).toHaveCSS('background-color', 'rgb(32, 32, 36)');
  const darkAxe = await new AxeBuilder({ page }).include('.model-pop').analyze();
  expect(darkAxe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('picker-desktop-dark.png') });
  await kling.getByRole('option', { name: /Kling 2\.6/ }).click();
  await expect(panel).toBeHidden();
  await expect(modelButton(page)).toContainText('Kling 2.6');

  // By keyboard: the panel opens on the family that holds the chosen model; ArrowRight enters it on that model, ArrowLeft leaves it.
  await page.mouse.move(0, 0); // clear of the panel, so no hover moves the active option
  await page.keyboard.press('Enter');
  const search = panel.getByRole('combobox', { name: 'Tìm mô hình' });
  const activeIs = async (option: Locator) => expect(search).toHaveAttribute('aria-activedescendant', (await option.getAttribute('id'))!);
  await activeIs(families.filter({ hasText: /^Kling/ }));
  await page.keyboard.press('ArrowRight');
  await activeIs(kling.getByRole('option', { name: /Kling 2\.6/ }));
  await page.keyboard.press('ArrowLeft');
  await expect(kling).toHaveCount(0);
  await activeIs(families.filter({ hasText: /^Kling/ }));
  await page.keyboard.press('ArrowDown');
  await activeIs(families.filter({ hasText: /^Google/ }));
  await page.keyboard.press('Enter'); // Enter opens a family too
  const google = list.getByRole('group', { name: 'Google' });
  await activeIs(google.getByRole('option', { name: /Google VEO 3\.1/ }));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape'); // closes the flyout only
  await expect(google).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(modelButton(page)).toContainText('Gemini Omni Flash');
  await expect(modelButton(page)).toBeFocused();
});

test('a search shows a flat list with no sections, and the e2e helper picks a model that is only in a family', async ({ page }) => {
  const { panel, list } = await open(page, 1440);
  await panel.getByRole('combobox', { name: 'Tìm mô hình' }).fill('kling');
  await expect(list.getByRole('group', { name: 'Model nổi bật' })).toHaveCount(0);
  await expect(list.getByRole('group', { name: 'Tất cả model' })).toHaveCount(0);
  await expect(list.getByRole('option')).toHaveText([/^Kling 3\.0 Pro/, /^Kling 2\.6/]);
  await page.keyboard.press('Escape');
  await pickModel(page, /Minimax H3 Max/);
  await expect(modelButton(page)).toContainText('Minimax H3 Max');
});

test('at 390 px a family opens under its row, inside the screen', async ({ page }, testInfo) => {
  const { panel, list } = await open(page, 390);
  await expect(list.getByRole('group', { name: 'Model nổi bật' }).getByRole('option').first().getByText('Điểm 80')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('picker-390-initial.png') });
  const p = (await panel.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(390);
  const kling = list.getByRole('group', { name: 'Kling' });
  await list.getByRole('group', { name: 'Tất cả model' }).getByRole('option', { name: /^Kling/ }).click();
  await expect(kling.getByRole('option')).toHaveCount(2);
  for (const option of await kling.getByRole('option').all()) {
    const o = (await option.boundingBox())!;
    expect(o.x).toBeGreaterThanOrEqual(p.x);
    expect(o.x + o.width).toBeLessThanOrEqual(p.x + p.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await kling.getByRole('option').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('picker-390.png') });
  await kling.getByRole('option', { name: /Kling 3\.0 Pro/ }).click();
  await expect(modelButton(page)).toContainText('Kling 3.0 Pro');
});
