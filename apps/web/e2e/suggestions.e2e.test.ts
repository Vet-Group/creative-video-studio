import { expect, test } from '@playwright/test';
import { openPromptTemplates, signIn } from './support.test';

// Suggestions come from the e2e worker's stand-in (CVS_FAKE_SUGGEST, no fal key): "Option n: <the member's text>" with the reading
// "Reading n: <the member's text>", and a translation is "Translation: <text>". A card is named by its number, its reading, then the option.
test('Gợi ý AI fills the brief with the picked option and can be undone, and Gợi ý lời thoại fills the lines on Advanced', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'sugga');
  await page.goto('/marketing-studio');
  // The label stays one line with its Optional chip; the tools sit in the box's toolbar, under the text.
  const label = (await page.locator('label', { hasText: 'Mô tả' }).first().boundingBox())!;
  expect(label.height).toBeLessThanOrEqual(22);
  const brief = page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' });
  const ai = page.getByRole('button', { name: 'Gợi ý AI' });
  expect((await ai.boundingBox())!.y).toBeGreaterThan((await brief.boundingBox())!.y);
  expect((await page.getByRole('button', { name: 'Mở rộng' }).boundingBox())!.y).toBeGreaterThan((await brief.boundingBox())!.y);
  // The templates menu replaced the starter chips: a template fills the brief, the hook and the ending at once.
  await expect(page.getByRole('group', { name: 'Gợi ý nhanh' })).toHaveCount(0);
  await (await openPromptTemplates(page)).getByRole('group', { name: 'Khung prompt' }).getByRole('button', { name: /^Trước \/ sau/ }).click();
  await expect(brief).toHaveValue(/^The creator turns slowly to show the new look/);
  await brief.fill('váy linen mùa hè');
  await ai.click();
  const options = page.getByRole('group', { name: 'Gợi ý AI' }).getByRole('button', { name: /^Gợi ý \d/ });
  await expect(options).toHaveText([/Option 1: váy linen mùa hè$/, /Option 2: váy linen mùa hè$/, /Option 3: váy linen mùa hè$/], { timeout: 20_000 });
  // The list is the box's last row, under the toolbar and as wide as the box, so it pushes the fields below down instead of covering them.
  const box = (await brief.locator('..').boundingBox())!;
  const list = (await page.getByRole('group', { name: 'Gợi ý AI' }).boundingBox())!;
  expect(list.y).toBeGreaterThan((await ai.boundingBox())!.y);
  expect(list.y + list.height).toBeLessThanOrEqual(box.y + box.height + 1);
  expect(Math.abs(list.x - box.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(list.width - box.width)).toBeLessThanOrEqual(3);
  let asks = 0;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && asks++);
  await options.nth(1).click();
  await expect(brief).toHaveValue('Option 2: váy linen mùa hè');
  await expect(brief).toBeFocused(); // the pick puts the caret back in the box
  await expect(page.getByRole('group', { name: 'Gợi ý AI' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(brief).toHaveValue('váy linen mùa hè');
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toHaveCount(0);
  // The three options are still there: opening the list again costs no run of the daily cap, and Escape hands the focus back.
  await ai.click();
  await expect(options).toHaveCount(3);
  expect(asks).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Gợi ý AI' })).toHaveCount(0);
  await expect(ai).toBeFocused();
  // The clear button empties the box and can be undone too.
  await page.getByRole('button', { name: 'Xoá mô tả' }).click();
  await expect(brief).toHaveValue('');
  await expect(brief).toBeFocused();
  await expect(page.getByRole('button', { name: 'Xoá mô tả' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(brief).toHaveValue('váy linen mùa hè');

  await page.goto('/marketing-studio/advanced');
  await page.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('ra mắt áo khoác');
  await page.getByRole('button', { name: 'Gợi ý lời thoại' }).click();
  await page.getByRole('group', { name: 'Gợi ý lời thoại' }).getByRole('button', { name: /^Gợi ý 1/ }).click({ timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' })).toHaveValue('Option 1: ra mắt áo khoác');
});

test('every other prompt asks for its own tool: Create sends the video feature and fills the box', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/create');
  let sent: unknown;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && (sent = r.postDataJSON()));
  await page.getByLabel('Mô tả chuyển động').fill('slow turn');
  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  await page.getByRole('group', { name: 'Gợi ý AI' }).getByRole('button', { name: /^Gợi ý 3/ }).click({ timeout: 20_000 });
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue('Option 3: slow turn');
  expect(sent).toMatchObject({ field: 'prompt', feature: 'video', text: 'slow turn' });
});

test('a long suggestion shows its whole text in the narrow form column, with no inner scroll box', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'sugga');
  await page.goto('/create');
  const long = Array.from({ length: 12 }, (_, i) => `the creator turns the product slowly in soft window light, beat ${i + 1}`).join(', ');
  await page.getByLabel('Mô tả chuyển động').fill(long);
  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  const group = page.getByRole('group', { name: 'Gợi ý AI' });
  const first = group.getByRole('button', { name: /^Gợi ý 1/ });
  await expect(first).toHaveText(/Option 1: the creator turns .*, beat \d+$/, { timeout: 20_000 });
  // Every line shows: far more than the old three-line clamp, and nothing cut off inside the option or the list.
  const fit = await first.evaluate((e) => ({ h: e.clientHeight, sh: e.scrollHeight, lh: parseFloat(getComputedStyle(e).lineHeight) }));
  expect(fit.sh).toBeLessThanOrEqual(fit.h);
  expect(fit.h).toBeGreaterThan(fit.lh * 6);
  expect(await group.evaluate((e) => e.scrollHeight <= e.clientHeight)).toBe(true);
  // The header reads at body size.
  expect(await group.getByText('Chọn một gợi ý').evaluate((e) => getComputedStyle(e).fontSize)).toBe('13px');
});

test('each card is numbered with its direction and length, with the Vietnamese summary first and the English it puts in the box under it, smaller and at most six lines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'sugga');
  await page.goto('/create');
  const box = page.getByLabel('Mô tả chuyển động');
  await box.fill('slow turn');
  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  const group = page.getByRole('group', { name: 'Gợi ý AI' });
  const cards = group.getByRole('button', { name: /^Gợi ý \d/ });
  await expect(cards).toHaveCount(3, { timeout: 20_000 });
  for (const n of [1, 2, 3]) {
    const card = cards.nth(n - 1);
    const english = `Option ${n}: slow turn`;
    await expect(card.getByText(`Gợi ý ${n} · ${['Sát ý bạn', 'Sáng tạo', 'Nổi bật'][n - 1]} · ${english.length} ký tự`, { exact: true })).toBeVisible();
    const vi = card.getByText(`Reading ${n}: slow turn`, { exact: true });
    const en = card.getByText(`Option ${n}: slow turn`, { exact: true });
    expect((await vi.boundingBox())!.y).toBeLessThan((await en.boundingBox())!.y);
    expect(await vi.evaluate((e) => getComputedStyle(e).fontSize)).toBe('13px');
    expect(await en.evaluate((e) => getComputedStyle(e).fontSize)).toBe('12px');
    await expect(en).toHaveAttribute('lang', 'en');
    expect(await en.evaluate((e) => getComputedStyle(e).webkitLineClamp)).toBe('6'); // an option of thousands of characters stays a short card
  }
  await cards.nth(1).click();
  await expect(box).toHaveValue('Option 2: slow turn'); // the English goes in, never the reading
});

test('with an empty prompt box on Create, the first card is labelled Cơ bản and the other two keep their direction', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/create');
  const box = page.getByLabel('Mô tả chuyển động');
  await box.fill('');
  let sent: unknown;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && (sent = r.postDataJSON()));
  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  const cards = page.getByRole('group', { name: 'Gợi ý AI' }).getByRole('button', { name: /^Gợi ý \d/ });
  await expect(cards).toHaveCount(3, { timeout: 20_000 });
  expect(sent).toMatchObject({ field: 'prompt', feature: 'video', text: '' });
  for (const [n, label] of [[1, 'Cơ bản'], [2, 'Sáng tạo'], [3, 'Nổi bật']] as const) {
    await expect(cards.nth(n - 1).getByText(`Gợi ý ${n} · ${label} · ${`Option ${n}: prompt`.length} ký tự`, { exact: true })).toBeVisible();
  }
  await expect(cards.first().getByText(/Sát ý bạn/)).toHaveCount(0);
});

test('Gợi ý AI stays off until the page knows its model, then asks with the model and its room, on Create, Marketing Studio and Image', async ({ page }) => {
  await signIn(page, 'sugga');
  let sent: unknown;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && (sent = r.postDataJSON()));
  for (const path of ['/create', '/marketing-studio', '/image-generation']) {
    // Hold the model list, as on a slow line: a click then would ask without the model's room and get options longer than the box takes.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/api\/(image-)?models/, async (route) => (await held, route.continue()));
    await page.goto(path);
    const ai = page.getByRole('button', { name: 'Gợi ý AI' });
    await expect(ai).toBeDisabled();
    release();
    await expect(ai).toBeEnabled();
    await page.unroute(/\/api\/(image-)?models/);
    sent = undefined;
    await ai.click();
    await expect(page.getByRole('group', { name: 'Gợi ý AI' }).getByRole('button', { name: /^Gợi ý \d/ })).toHaveCount(3, { timeout: 20_000 });
    expect(sent, path).toMatchObject({ model: expect.any(String), room: expect.any(Number) });
  }
});

test('Dịch shows a Vietnamese reading of English words under the box, asks once per text, and is not offered for Vietnamese words', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/create');
  let asks = 0;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && asks++);
  const box = page.getByLabel('Mô tả chuyển động');
  await box.fill('slow turn in window light');
  // The box's own Translate: the preview under the model, open on a computer, has one for the composed prompt too.
  const translate = page.getByRole('group', { name: '② Diễn biến', exact: true }).getByRole('button', { name: 'Dịch', exact: true });
  await translate.click();
  const reading = page.getByRole('group', { name: 'Bản dịch tiếng Việt' });
  await expect(reading.getByText('Translation: slow turn in window light')).toBeVisible({ timeout: 20_000 });
  await expect(reading.getByText('Chỉ để đọc. Prompt gửi đi vẫn là tiếng Anh.')).toBeVisible();
  await expect(box).toHaveValue('slow turn in window light'); // the prompt stays English
  // Closing and opening again shows the same reading without another run.
  await translate.click();
  await expect(reading).toHaveCount(0);
  await translate.click();
  await expect(reading.getByText('Translation: slow turn in window light')).toBeVisible();
  expect(asks).toBe(1);
  // New words close the reading; Vietnamese words need none.
  await box.fill('xoay chậm dưới ánh nắng');
  await expect(reading).toHaveCount(0);
  await expect(translate).toHaveCount(0);
});

test('a History card translates its English prompt on Dịch and hides it again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'sugga');
  const prompt = 'a model turning slowly by the window, soft morning light, a quiet room with linen curtains, a wooden chair and a small table with a cup of tea, shot on film with a shallow depth of field and gentle grain';
  expect((await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt, enhance: false, params: { resolution: '1K' } } })).status()).toBe(201);
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'turning slowly by the window' });
  await card.getByRole('button', { name: 'Dịch', exact: true }).click({ timeout: 60_000 });
  const reading = card.getByRole('group', { name: 'Bản dịch tiếng Việt' });
  await expect(reading).toHaveText(`Translation: ${prompt}`, { timeout: 20_000 });
  // In the narrow card each tool label stays on one line (the row wraps instead): an 18px line-height, so under 1.6x of it.
  const tools = card.locator('.job-prompt-tools button');
  expect(await tools.count()).toBe(3); // show more, copy, hide translation
  for (const tool of await tools.all()) expect((await tool.boundingBox())!.height).toBeLessThan(18 * 1.6);
  await card.getByRole('button', { name: 'Ẩn bản dịch' }).click();
  await expect(reading).toHaveCount(0);
});

test('a refused or failed run says so in Vietnamese', async ({ page }) => {
  await signIn(page, 'sugga');
  await page.goto('/marketing-studio');
  await page.route('/api/suggestions', (r) => r.fulfill({ status: 429, json: { error: 'Bạn đã dùng hết 20 lượt gợi ý hôm nay. Mai hãy thử lại.' } }));
  await page.getByRole('button', { name: 'Gợi ý AI' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bạn đã dùng hết 20 lượt gợi ý hôm nay.' })).toBeVisible();
  await page.unroute('/api/suggestions');
  await page.route('/api/suggestions', (r) => r.fulfill({ status: 503, json: { error: 'suggestions are unavailable right now' } }));
  await page.getByRole('button', { name: 'Gợi ý khác' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa lấy được gợi ý lúc này, hãy thử lại sau.' })).toBeVisible();
});
