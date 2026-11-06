import { expect, type Page, test } from '@playwright/test';
import { FORMAT_NAME, type MarketingFormat } from '../src/lib/marketing';
import { PROMPT_TEMPLATES } from '../src/lib/prompt-starters';
import { modelButton, openPromptTemplates, png, signIn } from './support.test';

// Marketing Studio's Unboxing (/marketing-studio/unboxing) and Review (/marketing-studio/review) formats on the mock models (e2e/serve.ts): Mock E2E takes
// 4 images and, being the mock endpoint, the audio switch at 0 USD.
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const runButton = (page: Page) => page.getByRole('button', { name: /^Tạo video/ });
const reasonOf = (page: Page) => page.locator('.form-message').getByRole('status');
const preview = (page: Page) => page.locator('.prompt-preview p');
const audio = (page: Page) => page.getByRole('switch', { name: 'Tạo âm thanh' });
const script = (page: Page) => page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' });
const line = (page: Page, n: number) => page.getByRole('textbox', { name: `Điểm nổi bật ${n}` });
const PATH: Record<MarketingFormat, RegExp> = { ugc: /\/marketing-studio$/, advanced: /\/marketing-studio\/advanced$/, unboxing: /\/marketing-studio\/unboxing$/, review: /\/marketing-studio\/review$/ };

/** Opens Marketing Studio and picks the format in the picker, as a member does. */
async function pick(page: Page, format: MarketingFormat): Promise<void> {
  if (!/\/marketing-studio/.test(page.url())) {
    await nav(page).getByRole('link', { name: 'Marketing Studio' }).click();
    await expect(runButton(page)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Đổi định dạng' }).click();
  const formats = page.getByRole('dialog', { name: 'Chọn định dạng' });
  await formats.getByRole('button', { name: FORMAT_NAME[format], exact: true }).click();
  await expect(page).toHaveURL(PATH[format]);
  await expect(page.locator('.app-head strong')).toHaveText(FORMAT_NAME[format]);
  await expect(runButton(page)).toBeVisible();
}

/** The job the page just made, as GET /api/jobs/:id answers. */
async function lastJob(page: Page): Promise<{ id: string; prompt: string; format: string | null; roles: string | null; highlights: string[] | null; script: string | null; audio: string | null; images: { filename: string }[] }> {
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] };
  return (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as never;
}

test('the format picker has four live formats, none marked as coming, and each opens its own page', async ({ page }) => {
  await signIn(page, 'fmta');
  await nav(page).getByRole('link', { name: 'Marketing Studio' }).click();
  await page.getByRole('button', { name: 'Đổi định dạng' }).click();
  const formats = page.getByRole('dialog', { name: 'Chọn định dạng' });
  await expect(formats.getByRole('button', { name: /^(UGC Thử đồ|Nâng cao|Mở hộp|Đánh giá sản phẩm)/ })).toHaveCount(4);
  await expect(formats.getByRole('button', { disabled: true })).toHaveCount(0);
  await expect(formats.getByText('Sắp có')).toHaveCount(0);
  await expect(formats.getByText(/sẽ có sau/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  for (const format of ['unboxing', 'review', 'advanced', 'ugc'] as const) {
    await pick(page, format);
    await page.getByRole('button', { name: 'Đổi định dạng' }).click();
    await expect(page.getByRole('dialog', { name: 'Chọn định dạng' }).getByRole('button', { name: FORMAT_NAME[format], exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  }
});

test('Mở hộp: only the product photo is required; the model and packaging are optional and the sent prompt follows the photos, in order', async ({ page }) => {
  await signIn(page, 'fmtb');
  await pick(page, 'unboxing');
  await expect(page.locator('.slot')).toHaveCount(3);
  await expect(audio(page)).toHaveAttribute('aria-checked', 'true');
  await expect(modelButton(page)).toContainText('Mock E2E');
  // Run waits for the product alone; with no model photo the page says the video is a point of view.
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh sản phẩm.');
  await expect(page.getByText('Không có ảnh người mẫu: video quay theo góc nhìn thứ nhất, chỉ thấy đôi tay mở hộp.')).toBeVisible();
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
  await expect(preview(page)).toContainText('POV unboxing video, vertical 9:16 frame');
  await expect(preview(page)).toContainText('reveal the product in [Image1];');
  await expect(preview(page)).not.toContainText('The box or packaging looks like');
  // The packaging photo is named as the next image; the model photo makes it a creator unboxing and moves every number up.
  await page.getByLabel('Ảnh bao bì').setInputFiles(file('box.png'));
  await expect(preview(page)).toContainText('The box or packaging looks like [Image2].');
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(page.getByText('Không có ảnh người mẫu')).toHaveCount(0);
  await expect(preview(page)).toContainText('UGC unboxing video, vertical 9:16 frame');
  await expect(preview(page)).toContainText('The creator in [Image1] opens a package and reveals the product in [Image2];');
  await expect(preview(page)).toContainText('The box or packaging looks like [Image3].');
  await expect(preview(page)).toContainText('Show the closed package, the opening, the product lifted out and turned toward the camera');
  await expect(preview(page)).toContainText('the rustle of paper, the tape and the box opening'); // sound is on
  await audio(page).click();
  await expect(preview(page)).toContainText('The video is completely silent');
  await audio(page).click();

  const shown = await preview(page).innerText();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });
  const job = await lastJob(page);
  expect(job).toMatchObject({ format: 'unboxing', roles: 'model,product,packaging', audio: 'on', highlights: null });
  expect(job.images.map((i) => i.filename)).toEqual(['model.png', 'product.png', 'box.png']);
  expect(job.prompt).toBe(shown); // the preview showed exactly what was sent
});

test('Mở hộp with the product alone sends one photo and says its role, and the job refills the form on Reuse', async ({ page }) => {
  await signIn(page, 'fmtc');
  await pick(page, 'unboxing');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  const job = await lastJob(page);
  expect(job).toMatchObject({ format: 'unboxing', roles: 'product' });
  expect(job.images.map((i) => i.filename)).toEqual(['product.png']);
  // Reuse on the page of another format moves to the page of the job's own format, and its photo lands in the product slot.
  await page.goto(`/marketing-studio/review?reuse=${job.id}`);
  await expect(page).toHaveURL(/\/marketing-studio\/unboxing/);
  await expect(page.locator('.app-head strong')).toHaveText('Mở hộp');
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(page.getByText('Không có ảnh người mẫu')).toBeVisible();
});

test('Đánh giá sản phẩm: Run asks for the model, the product and a highlight in turn, and highlights go from 1 to 3 lines', async ({ page }) => {
  await signIn(page, 'fmtd');
  await pick(page, 'review');
  await expect(page.locator('.slot')).toHaveCount(2);
  await expect(audio(page)).toHaveAttribute('aria-checked', 'true');
  await expect(script(page)).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh người mẫu.');
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh sản phẩm.');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Nhập ít nhất 1 điểm nổi bật.');

  // One empty line to start; at most 60 characters each; at most 3 lines, and a line can be removed once there are two.
  await expect(line(page, 1)).toHaveAttribute('maxlength', '60');
  await expect(page.getByRole('button', { name: /^Xoá điểm nổi bật/ })).toHaveCount(0);
  await line(page, 1).fill('   ');
  await expect(runButton(page)).toBeDisabled();
  await line(page, 1).fill('Vải mềm, không nhăn');
  await expect(runButton(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Thêm điểm nổi bật' }).click();
  await line(page, 2).fill('Giá hợp lý');
  await page.getByRole('button', { name: 'Thêm điểm nổi bật' }).click();
  await line(page, 3).fill('Giặt máy được');
  await expect(page.getByRole('button', { name: 'Thêm điểm nổi bật' })).toHaveCount(0);
  await expect(preview(page)).toContainText('The creator talks to the camera about: Vải mềm, không nhăn; Giá hợp lý; Giặt máy được.');
  await page.getByRole('button', { name: 'Xoá điểm nổi bật 2' }).click();
  await expect(line(page, 3)).toHaveCount(0);
  await expect(line(page, 2)).toHaveValue('Giặt máy được');
  await expect(preview(page)).toContainText('about: Vải mềm, không nhăn; Giặt máy được.');
  await expect(page.getByRole('button', { name: 'Thêm điểm nổi bật' })).toBeVisible();
});

test('Đánh giá sản phẩm: the sent prompt names the model and the product, talks about the highlights, says an exact script and goes silent with sound off', async ({ page }) => {
  await signIn(page, 'fmte');
  await pick(page, 'review');
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('model.png'));
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('product.png'));
  await line(page, 1).fill('Vải mềm');
  await expect(preview(page)).toContainText('UGC product review video, vertical 9:16 frame');
  await expect(preview(page)).toContainText('The creator in [Image1] reviews the product in [Image2], wearing or holding it;');
  await expect(preview(page)).toContainText('The creator talks to the camera about: Vải mềm. Show the product up close');
  await expect(preview(page)).toContainText('The creator speaks to the camera in a casual, honest tone about these points, recorded on the phone, with no background music.');
  await script(page).fill('Mình rất thích cái áo này.');
  await expect(preview(page)).toContainText('The creator says exactly: "Mình rất thích cái áo này.", lip-synced, and no other spoken words.');
  await expect(preview(page)).not.toContainText('in a casual, honest tone');
  await audio(page).click();
  await expect(preview(page)).toContainText('The video is completely silent');
  await expect(preview(page)).not.toContainText('says exactly');
  await audio(page).click();

  const shown = await preview(page).innerText();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });
  const job = await lastJob(page);
  expect(job).toMatchObject({ format: 'review', highlights: ['Vải mềm'], script: 'Mình rất thích cái áo này.', audio: 'on', roles: null });
  expect(job.images.map((i) => i.filename)).toEqual(['model.png', 'product.png']);
  expect(job.prompt).toBe(shown);
  // Reuse refills the lines and the script on the same page, and another format's page hands the job over to this one.
  await page.goto(`/marketing-studio/advanced?reuse=${job.id}`);
  await expect(page).toHaveURL(/\/marketing-studio\/review/);
  await expect(line(page, 1)).toHaveValue('Vải mềm');
  await expect(script(page)).toHaveValue('Mình rất thích cái áo này.');
});

test('each of the four formats lists its own Khung prompt templates, none of them another format’s', async ({ page }) => {
  await signIn(page, 'fmtf');
  const lists = { ugc: PROMPT_TEMPLATES.marketing, advanced: PROMPT_TEMPLATES.advanced, unboxing: PROMPT_TEMPLATES.unboxing, review: PROMPT_TEMPLATES.review } as const;
  for (const format of ['ugc', 'advanced', 'unboxing', 'review'] as const) {
    await pick(page, format);
    const dialog = await openPromptTemplates(page);
    const group = dialog.getByRole('group', { name: 'Khung prompt' });
    await expect(group.getByRole('button')).toHaveCount(3);
    for (const t of lists[format]) await expect(group.getByRole('button', { name: new RegExp(`^${t.name}`) })).toContainText(t.desc);
    for (const other of Object.values(lists).filter((l) => l !== lists[format])) for (const t of other) await expect(group.getByRole('button', { name: new RegExp(`^${t.name}`) })).toHaveCount(0);
    // A template fills the three sections, and the sent prompt carries them after the format's fixed instruction.
    const t = lists[format][0]!;
    await group.getByRole('button', { name: new RegExp(`^${t.name}`) }).click();
    await expect(dialog).toHaveCount(0);
    await expect(preview(page)).toContainText(t.hook);
    await expect(preview(page)).toContainText(t.ending);
  }
});
