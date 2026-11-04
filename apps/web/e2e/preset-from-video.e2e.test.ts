import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// The prompt-from-video button in the preset edit form: the e2e worker reads the stills of the preset's saved clip and its stand-in (CVS_FAKE_SUGGEST)
// writes the prompt, so nothing reaches an LLM. The spec gives a preset no other spec reads a clip, and takes the clip and the prompt back at the end.
const CLIP = 'preset-walk-left.mp4';

test("a template editor fills a preset's prompt from its saved clip, and the prompt is kept only once saved", async ({ page }) => {
  await signIn(page, 'tpled');
  const put = await page.request.put(`/api/admin/samples/${CLIP}`, { data: await readFile(new URL('../public/fixtures/examples/example-1.mp4', import.meta.url)), headers: { 'content-type': 'video/mp4' } });
  expect(put.ok()).toBe(true);
  let original: string | undefined;
  try {
    await page.goto('/create');
    await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
    await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
    const grid = page.getByRole('list', { name: 'Danh sách mẫu' });
    await grid.getByRole('button', { name: 'Sửa mẫu Đi sang trái', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Sửa mẫu' });
    const prompt = form.getByLabel('Mô tả chuyển động (tiếng Anh)');
    await expect(prompt).not.toHaveValue('');
    original = await prompt.inputValue();

    await form.getByRole('button', { name: 'Gợi ý prompt từ video' }).click();
    await expect(form.getByRole('button', { name: 'Đang phân tích video…' })).toBeDisabled();
    await expect(prompt).toHaveValue(/^Mock motion read from 8 stills: .* Keep the person, their face, the outfit, .* Smooth, stable camera\.$/);
    const suggested = await prompt.inputValue();
    await expect(form.getByRole('button', { name: 'Gợi ý prompt từ video' })).toBeEnabled();

    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/presets/walk-left') && r.request().method() === 'PATCH' && r.ok()), form.getByRole('button', { name: 'Lưu', exact: true }).click()]);
    await expect(form).toBeHidden();
    await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã lưu mẫu.')).toBeVisible();
    // Read back from the server (the picker's own list reloads after the save, on its own time).
    const { presets } = (await (await page.request.get('/api/presets')).json()) as { presets: { id: string; prompt?: string }[] };
    expect(presets.find((p) => p.id === 'walk-left')?.prompt).toBe(suggested);
  } finally {
    if (original) expect((await page.request.patch('/api/presets/walk-left', { data: { prompt: original } })).ok()).toBe(true);
    expect((await page.request.delete(`/api/admin/samples/${CLIP}`)).ok()).toBe(true);
  }
});

test('the button is off for a preset with no saved clip', async ({ page }) => {
  await signIn(page, 'tpled');
  await page.goto('/create');
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  await page.getByRole('list', { name: 'Danh sách mẫu' }).getByRole('button', { name: 'Sửa mẫu Đi sang phải', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Sửa mẫu' });
  await expect(form.getByRole('button', { name: 'Gợi ý prompt từ video' })).toBeDisabled();
  await expect(form.getByText('Mẫu này chưa có video mẫu để gợi ý mô tả.')).toBeVisible();
});
