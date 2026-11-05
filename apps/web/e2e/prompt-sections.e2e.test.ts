import { expect, type Page, test } from '@playwright/test';
import { ENDINGS, HOOKS } from '../src/lib/marketing';
import { PROMPT_TEMPLATES } from '../src/lib/prompt-starters';
import { modelButton, png, signIn } from './support.test';

// The sectioned prompt (owner 2026-11-05) on Create and Marketing Studio: ① Hook, ② Body (the page's own prompt box) and ③ Ending,
// a templates menu that fills all three, the English preview of what Run sends, Reuse, and free writing. Suggestions come from the e2e worker's
// stand-in (CVS_FAKE_SUGGEST): "Option n: <the member's text or the field>".

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const mode = (page: Page) => page.getByRole('radiogroup', { name: 'Cách viết prompt' });
const part = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const hookBox = (page: Page) => page.getByRole('textbox', { name: 'Hook tự viết (tuỳ chọn)' });
const endingBox = (page: Page) => page.getByRole('textbox', { name: 'Cảnh kết (tuỳ chọn)' });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const preview = (page: Page) => page.locator('.prompt-preview p');
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function useTemplate(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Mẫu prompt' }).click();
  await page.getByRole('group', { name: 'Mẫu prompt' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

/** The member's newest job of `feature` once it is done, as GET /api/jobs/:id answers it. */
async function newest(page: Page, feature: string): Promise<Record<string, unknown>> {
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string; feature: string }[] }).jobs.filter((j) => j.feature === feature);
  await expect.poll(async () => (await mine())[0]?.status, { timeout: 60_000 }).toBe('succeeded');
  return (await (await page.request.get(`/api/jobs/${(await mine())[0]!.id}`)).json()) as Record<string, unknown>;
}

test('Create: the sections show by default, Mẫu prompt fills all three, the preview is what the job gets, and Dùng lại refills the sections', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'secta');
  await page.goto('/create');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(mode(page).getByRole('radio', { name: 'Theo phần' })).toBeChecked();
  for (const name of ['① Hook · 0–2 giây đầu', '② Diễn biến', '③ Kết · cảnh cuối']) await expect(part(page, name)).toBeVisible();
  // ② is the page's own prompt box, with its own rule line.
  await expect(part(page, '② Diễn biến').getByLabel('Mô tả chuyển động')).toBeVisible();
  await expect(part(page, '② Diễn biến')).toContainText('Một hành động chính, thì hiện tại, nói rõ ánh sáng và máy quay.');
  await expect(page.getByRole('group', { name: 'Gợi ý nhanh' })).toHaveCount(0); // the templates replace the starter chips

  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('shirt.png'));
  await expect(page.getByRole('img', { name: 'shirt.png' })).toBeVisible();
  const t = PROMPT_TEMPLATES.video[0]!;
  await useTemplate(page, t.name);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(t.body);
  await expect(endingBox(page)).toHaveValue(t.ending);

  // ③ asks for its own suggestions, with the other sections as the rest of the clip, and a pick fills it.
  let sent: Record<string, unknown> | undefined;
  page.on('request', (r) => r.url().endsWith('/api/suggestions') && r.method() === 'POST' && (sent = r.postDataJSON()));
  await page.getByRole('button', { name: 'Gợi ý cảnh kết' }).click();
  await page.getByRole('group', { name: 'Gợi ý cảnh kết' }).getByRole('button', { name: /^Gợi ý 2/ }).click({ timeout: 20_000 });
  expect(sent).toMatchObject({ field: 'ending', text: t.ending, rest: `${t.hook} ${t.body}`, model: 'mock-e2e' });
  await expect(endingBox(page)).toHaveValue(`Option 2: ${t.ending}`);
  // The library fills ③ with a built-in ending's phrase and names it.
  await page.getByRole('button', { name: /^Cảnh kết có sẵn/ }).click();
  await page.getByRole('dialog', { name: 'Chọn cảnh kết' }).getByRole('option', { name: ENDINGS[2]!.name, exact: true }).click();
  await expect(endingBox(page)).toHaveValue(ENDINGS[2]!.phrase);
  await expect(page.getByRole('button', { name: /^Cảnh kết có sẵn/ })).toContainText(ENDINGS[2]!.name);

  const composed = `${t.hook} ${t.body} ${ENDINGS[2]!.phrase}`;
  await page.getByText('Xem prompt gửi đi').click();
  await expect(preview(page)).toHaveText([composed]);
  await expect(page.locator('.prompt-preview-count')).toHaveText(`${composed.length}/2000 ký tự`);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  const job = await newest(page, 'video');
  expect(job).toMatchObject({ prompt: composed, hookText: t.hook, ending: ENDINGS[2]!.phrase });

  await page.goto(`/create?reuse=${job.id}`);
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(t.body);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(endingBox(page)).toHaveValue(ENDINGS[2]!.phrase);

  // free writing takes the composed prompt in today's one box; back in the sections, they are as they were. The choice is remembered.
  await mode(page).getByText('Viết tự do').click();
  await expect(part(page, '① Hook · 0–2 giây đầu')).toHaveCount(0);
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(composed);
  await page.getByLabel('Mô tả chuyển động').fill('a slow turn');
  await mode(page).getByText('Theo phần').click();
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(t.body);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await mode(page).getByText('Viết tự do').click();
  await expect(page.getByLabel('Mô tả chuyển động')).toHaveValue(composed);
  await page.getByLabel('Mô tả chuyển động').fill('a slow turn');
  await page.reload();
  await expect(mode(page).getByRole('radio', { name: 'Viết tự do' })).toBeChecked();
  await expect(page.getByLabel('Mô tả chuyển động')).toBeVisible();
  await expect(hookBox(page)).toHaveCount(0);
});

test('Marketing Studio: the own hook counts only with no hook chosen, the job keeps the sections, Dùng lại refills them, and Viết tự do still runs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'sectb');
  await page.goto('/marketing-studio');
  await expect(page.getByLabel('Ảnh người mẫu')).toBeEnabled();
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(page.getByRole('img', { name: 'model.png' })).toBeVisible();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(modelButton(page)).toContainText('Mock E2E');
  // ③ holds the end text box beside the last shot.
  await expect(part(page, '③ Kết · cảnh cuối').getByLabel('Chữ trên khung cuối (tuỳ chọn)')).toBeVisible();

  const t = PROMPT_TEMPLATES.marketing[0]!;
  await useTemplate(page, t.name);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue(t.body);
  await expect(endingBox(page)).toHaveValue(t.ending);
  await page.getByText('Xem prompt gửi đi').click();
  await expect(preview(page)).toContainText(`${t.hook} Creator notes: ${t.body} ${t.ending}`);

  // A chosen hook wins over the own words, and the section says so.
  await page.getByRole('button', { name: /^Hook/ }).click();
  await page.getByRole('dialog', { name: 'Chọn hook' }).getByRole('option', { name: HOOKS[0]!.name, exact: true }).click();
  await expect(part(page, '① Hook · 0–2 giây đầu')).toContainText('Đang dùng hook đã chọn ở ô Hook phía trên');
  await expect(preview(page)).toContainText(HOOKS[0]!.phrase);
  await expect(preview(page)).not.toContainText(t.hook);
  await page.getByRole('button', { name: 'Bỏ Hook' }).click();
  await expect(preview(page)).toContainText(t.hook);

  const shown = await preview(page).innerText();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  const job = await newest(page, 'marketing');
  expect(job).toMatchObject({ prompt: shown, hookText: t.hook, brief: t.body, ending: t.ending, hook: null });

  await page.goto(`/marketing-studio?reuse=${job.id}`);
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue(t.body);
  await expect(hookBox(page)).toHaveValue(t.hook);
  await expect(endingBox(page)).toHaveValue(t.ending);

  // free writing: the sections' words in today's one box, the end text still there, and Run sends the box's words as the brief.
  await mode(page).getByText('Viết tự do').click();
  await expect(hookBox(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue(`${t.hook} ${t.body} ${t.ending}`);
  await expect(page.getByLabel('Chữ trên khung cuối (tuỳ chọn)')).toBeVisible();
  await page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' }).fill('mở hộp và cười');
  const sentJob = new Promise<{ prompt: string; params: Record<string, unknown> }>((resolve) => {
    void page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      resolve(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: 'caught', status: 'queued' } });
    });
  });
  await runButton(page).click();
  const body = await sentJob;
  expect(body.params).toMatchObject({ brief: 'mở hộp và cười' });
  expect(body.params).not.toHaveProperty('hookText');
  expect(body.params).not.toHaveProperty('ending');
  expect(body.prompt).toContain('Creator notes: mở hộp và cười');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('at 390 px the sections, the templates menu and the preview fit with no sideways scroll, on Create and Marketing Studio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'secta');
  for (const [path, name] of [['/create', PROMPT_TEMPLATES.video[4]!.name], ['/marketing-studio', PROMPT_TEMPLATES.marketing[2]!.name]] as const) {
    await page.goto(path);
    await expect(part(page, '② Diễn biến')).toBeVisible();
    await page.getByRole('button', { name: 'Mẫu prompt' }).click();
    expect(await fits(page)).toBe(true);
    await page.getByRole('group', { name: 'Mẫu prompt' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await page.getByText('Xem prompt gửi đi').click();
    await expect(preview(page).first()).toBeVisible();
    expect(await fits(page)).toBe(true);
    for (const section of ['① Hook · 0–2 giây đầu', '③ Kết · cảnh cuối']) {
      const box = (await part(page, section).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
  }
});
