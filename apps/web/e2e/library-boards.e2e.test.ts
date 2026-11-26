import { expect, type Locator, test } from '@playwright/test';
import { png, signIn } from './support.test';

// Library boards: a member makes a board from an item's detail, fills it from the selection bar, opens it as a filter, loses items by unticking, renames it and deletes it
// (the items stay), while another member who opens the copied link sees the board-not-found state. `libboard` owns everything here; `libboardb` only follows the link.
const BOARD = 'Tết 2027 – áo thun';
const RENAMED = 'Tết 2027';

test('Library boards: make, fill, open, rename and delete a board, with the keys of the detail left alone while its dialog is open', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'libboard');
  // Free-prompt clips on the mock video model: the prompt names each one in the detail. Made oldest first, so the list reads three, two, one.
  const clip = async (prompt: string) => {
    const up = (await (await page.request.post('/api/assets', { multipart: { file: { name: 'board.png', mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] };
    const res = await page.request.post('/api/jobs', { data: { assetIds: [up.assets[0]!.id], modelId: 'mock-e2e', prompt, enhance: false, ratio: '9:16', durationSec: 5 } });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const boardsNow = async () => ((await (await page.request.get('/api/library/boards')).json()) as { boards: { id: string; name: string; count: number }[] }).boards;
  const dropBoards = async () => {
    for (const b of await boardsNow()) expect((await page.request.delete(`/api/library/boards/${b.id}`)).status()).toBe(204);
  };
  await dropBoards(); // a board left by an earlier run on the same database would show the filter at first
  const one = await clip('board words one');
  const two = await clip('board words two');
  const three = await clip('board words three');
  const jobs = [one, two, three];
  const other = await (await browser.newContext()).newPage();
  try {
    await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => jobs.includes(j.id) && j.status === 'succeeded').length, { timeout: 60_000 }).toBe(3);

    const item = (id: string) => page.locator(`article[data-clip-id="${id}"]`);
    const detail = page.locator('dialog.lightbox');
    const boardsDialog = page.getByRole('dialog', { name: 'Thêm vào bảng' });
    const boardSelect = page.getByRole('combobox', { name: 'Bảng', exact: true });
    const boardRow = (n: number, name = BOARD) => page.getByText(`Bảng: ${name} · ${n} mục`, { exact: true });
    const mineOnly = () => page.getByLabel('Người tạo').selectOption({ label: 'E2E Library Board' });
    const words = (text: string) => detail.getByText(text, { exact: true });
    const openDetail = async (id: string) => {
      await item(id).getByRole('button', { name: 'Xem chi tiết' }).click();
      await expect(detail).toBeVisible();
    };
    const closeDialog = async (dialog: Locator) => {
      await dialog.getByRole('button', { name: 'Đóng' }).click();
      await expect(dialog).toBeHidden();
    };
    const setItems = async (board: string, ids: string[], inBoard: boolean) => expect((await page.request.put(`/api/library/boards/${board}/items`, { data: { jobIds: ids, inBoard } })).status()).toBe(200);
    const pickAll = async () => {
      await page.getByRole('button', { name: 'Chọn', exact: true }).click();
      for (const id of jobs) await item(id).getByRole('checkbox').check();
      await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 3');
    };
    const bulkButton = () => page.getByRole('group', { name: 'Bảng', exact: true }).getByRole('button', { name: 'Thêm vào bảng…' });
    const verdicts: string[] = [];
    page.on('request', (r) => r.method() === 'PUT' && r.url().includes('/verdict') && verdicts.push(r.url()));
    // 1 marks the open item and → steps to the next, unless the key was pressed in a dialog stacked over the detail. Each check can fail: a mark sends a verdict, and a step shows the older item.
    const keysLeaveTheDetailAlone = async (title: string) => {
      await page.keyboard.press('1');
      await page.keyboard.press('ArrowRight');
      await page.evaluate(() => new Promise(requestAnimationFrame)); // a step would have rendered by now
      expect(verdicts).toEqual([]);
      await expect(detail.locator('h2 .lib-mark')).toHaveCount(0);
      await expect(words(title)).toBeVisible();
    };

    // No board yet: the filter row has no Bảng field.
    await page.goto('/library');
    await mineOnly();
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(boardSelect).toHaveCount(0);

    // From the newest item's detail (it has an older neighbour): Bảng opens the dialog, focus starts on its × and 1 and → do nothing to the detail, there or on Tạo bảng.
    await openDetail(three);
    await expect(words('board words three')).toBeVisible();
    await detail.getByRole('button', { name: 'Bảng', exact: true }).click();
    await expect(boardsDialog.getByText('Chưa có bảng nào. Đặt tên để tạo bảng đầu tiên.')).toBeVisible();
    await expect(boardsDialog.getByRole('button', { name: 'Đóng' })).toBeFocused();
    await keysLeaveTheDetailAlone('board words three');
    const name = boardsDialog.getByLabel('Tên bảng mới');
    const create = boardsDialog.getByRole('button', { name: 'Tạo bảng' });
    await expect(create).toBeDisabled(); // a name first
    await name.fill(BOARD);
    await create.focus();
    await expect(create).toBeFocused();
    await keysLeaveTheDetailAlone('board words three');
    await create.click();
    await expect(boardsDialog.getByRole('checkbox', { name: `${BOARD} (1)` })).toBeChecked(); // made, with this item on it
    await name.fill(BOARD.toUpperCase()); // the same name in other letters is taken
    await create.click();
    await expect(boardsDialog.getByRole('alert')).toHaveText('Đã có bảng tên này.');
    await closeDialog(boardsDialog);
    await expect(detail.getByRole('button', { name: 'Bảng (1)', exact: true })).toBeFocused(); // the dialog gives focus back
    // Control: with the dialog shut, → does step to the older item.
    await page.keyboard.press('ArrowRight');
    await expect(words('board words two')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(words('board words three')).toBeVisible();
    await closeDialog(detail);
    const [board] = await boardsNow();
    expect(board).toMatchObject({ name: BOARD, count: 1 });

    // The filter row now has Bảng with the count. Picking it clears the other filters, keeps the address, shows the chip and the board row, and a reload keeps the view.
    await expect(boardSelect).toBeVisible();
    await boardSelect.selectOption({ label: `${BOARD} (1)` });
    await expect(page).toHaveURL(new RegExp(`board=${board!.id}`));
    await expect(page.locator('.library-active .library-chip')).toHaveText([`Bảng: ${BOARD}×— bỏ lọc`]);
    await expect(boardRow(1)).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(item(three)).toBeVisible();
    await page.reload();
    await expect(boardRow(1)).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.locator('.library-active .library-chip').click(); // the chip's × returns to the whole Library
    await expect(page.locator('.library-active')).toHaveCount(0);
    await expect(boardSelect).toHaveValue('');

    // The selection bar: two items, not yet on the board, go on it in one tick.
    await mineOnly();
    await page.getByRole('button', { name: 'Chọn', exact: true }).click();
    await item(two).getByRole('checkbox').check();
    await item(one).getByRole('checkbox').check();
    await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 2');
    await bulkButton().click();
    await expect(boardsDialog.getByRole('checkbox', { name: `${BOARD} (1)` })).not.toBeChecked();
    await boardsDialog.getByRole('checkbox', { name: `${BOARD} (1)` }).click(); // the box follows the server's answer, so no check()
    await expect(boardsDialog.getByRole('checkbox', { name: `${BOARD} (3)` })).toBeChecked();
    await closeDialog(boardsDialog);
    expect((await boardsNow())[0]).toMatchObject({ count: 3 });
    // With two of the three picked already on it the box is mixed, and a tick adds the third.
    await setItems(board!.id, [one], false);
    await page.reload();
    await mineOnly();
    await pickAll();
    await bulkButton().click();
    const mixed = boardsDialog.getByRole('checkbox', { name: `${BOARD} (2)` });
    await expect(mixed).not.toBeChecked();
    expect(await mixed.evaluate((e: HTMLInputElement) => e.indeterminate)).toBe(true);
    await mixed.click();
    await expect(boardsDialog.getByRole('checkbox', { name: `${BOARD} (3)` })).toBeChecked();
    await closeDialog(boardsDialog);

    // An untick in the detail of the open board takes the item out of the list: the dialog closes at once and the detail shows the next item with its own ticks.
    await page.goto(`/library?board=${board!.id}`);
    await expect(page.getByRole('article')).toHaveCount(3);
    await openDetail(three);
    await detail.getByRole('button', { name: 'Bảng (1)', exact: true }).click();
    await boardsDialog.getByRole('checkbox', { name: `${BOARD} (3)` }).click();
    await expect(boardsDialog).toBeHidden();
    await expect(words('board words two')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(2);
    await expect(boardRow(2)).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Bảng (1)', exact: true })).toBeFocused();
    await detail.getByRole('button', { name: 'Bảng (1)', exact: true }).click();
    await expect(boardsDialog.getByRole('checkbox', { name: `${BOARD} (2)` })).toBeChecked(); // two is on the board, as the dropped item was not any longer
    await closeDialog(boardsDialog);
    await closeDialog(detail);

    // With every item picked on the open board, one untick empties the list: the bulk dialog closes, the board shows its own empty state, and the dialog stays shut when the items come back.
    await setItems(board!.id, [three], true);
    await page.reload();
    await expect(page.getByRole('article')).toHaveCount(3);
    await pickAll();
    await bulkButton().click();
    await boardsDialog.getByRole('checkbox', { name: `${BOARD} (3)` }).click();
    await expect(boardsDialog).toBeHidden();
    await expect(page.getByText('Bảng này chưa có mục nào.')).toBeVisible();
    await expect(page.getByText('Mở một kết quả rồi bấm Bảng, hoặc chọn nhiều mục rồi bấm Thêm vào bảng.')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.locator('.library-empty').getByRole('button', { name: 'Xoá lọc' }).click();
    await mineOnly();
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 3'); // the picks stayed, so a stale open flag would show the dialog now
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await expect(boardsDialog).toBeHidden();
    await page.getByRole('group', { name: 'Tải nhiều mục' }).getByRole('button', { name: 'Bỏ chọn' }).click();

    // Rename: the row, the chip and the select take the new name without a reload.
    await setItems(board!.id, jobs, true);
    await page.goto(`/library?board=${board!.id}`);
    await expect(boardRow(3)).toBeVisible();
    await page.getByRole('button', { name: 'Đổi tên bảng' }).click();
    const rename = page.getByRole('dialog', { name: 'Đổi tên bảng' });
    await rename.getByLabel('Tên bảng').fill(RENAMED);
    await rename.getByRole('button', { name: 'Lưu' }).click();
    await expect(rename).toBeHidden();
    await expect(boardRow(3, RENAMED)).toBeVisible();
    await expect(page.locator('.library-active .library-chip')).toHaveText([`Bảng: ${RENAMED}×— bỏ lọc`]);
    await expect(boardSelect.locator('option:checked')).toHaveText(`${RENAMED} (3)`);
    await expect(page).toHaveURL(new RegExp(`board=${board!.id}`)); // the link still opens it

    // The shelf shows none of the board UI, for a board of the member's and for an id that is none of theirs.
    for (const id of [board!.id, 'no-such-board']) {
      await page.goto(`/library?kind=products&board=${id}`);
      await expect(page.locator('.product-shelf')).toBeVisible();
      for (const text of [`Bảng: ${RENAMED}`, 'Đổi tên bảng', 'Bảng này chưa có mục nào.', 'Không tìm thấy bảng này.']) await expect(page.getByText(text)).toHaveCount(0);
    }

    // Another member who opens the copied link: not found, with the way out, and never "no items yet".
    await signIn(other, 'libboardb');
    await other.goto(`/library?board=${board!.id}`);
    await expect(other.getByText('Không tìm thấy bảng này.')).toBeVisible();
    await expect(other.getByText('Bảng chỉ người tạo xem được, hoặc đã bị xoá.')).toBeVisible();
    await expect(other.locator('.library-active .library-chip')).toHaveText(['Bảng: không tìm thấy×— bỏ lọc']);
    await expect(other.getByText('Bảng này chưa có mục nào.')).toHaveCount(0);
    await other.locator('.library-empty').getByRole('button', { name: 'Xoá lọc' }).click();
    await expect(other.locator('.library-active')).toHaveCount(0);

    // A touch phone: every control of the boards is a full tap target.
    const phone = await (await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    try {
      const tall = async (l: Locator, what: string) => {
        const box = (await l.boundingBox())!;
        expect(box.height, `${what} height`).toBeGreaterThanOrEqual(44);
        expect(box.width, `${what} width`).toBeGreaterThanOrEqual(44);
      };
      await phone.goto(`/library?board=${board!.id}`);
      await expect(phone.getByRole('article')).toHaveCount(3);
      await tall(phone.getByRole('button', { name: 'Đổi tên bảng' }), 'Đổi tên bảng');
      await tall(phone.getByRole('button', { name: 'Xoá bảng' }), 'Xoá bảng');
      await phone.locator(`article[data-clip-id="${two}"]`).getByRole('button', { name: 'Xem chi tiết' }).click();
      const small = phone.locator('dialog.lightbox');
      await tall(small.getByRole('button', { name: 'Bảng (1)', exact: true }), 'Bảng');
      await small.getByRole('button', { name: 'Bảng (1)', exact: true }).tap();
      const sheet = phone.getByRole('dialog', { name: 'Thêm vào bảng' });
      await tall(sheet.getByRole('checkbox', { name: `${RENAMED} (3)` }).locator('xpath=..'), 'a board row');
      await tall(sheet.getByLabel('Tên bảng mới'), 'Tên bảng mới');
      await sheet.getByLabel('Tên bảng mới').fill('x');
      await tall(sheet.getByRole('button', { name: 'Tạo bảng' }), 'Tạo bảng');
      await sheet.getByRole('button', { name: 'Đóng' }).tap();
      await small.getByRole('button', { name: 'Đóng' }).tap();
      await phone.getByRole('button', { name: 'Chọn', exact: true }).tap();
      await phone.locator(`article[data-clip-id="${one}"]`).getByRole('checkbox').check();
      await tall(phone.getByRole('group', { name: 'Bảng', exact: true }).getByRole('button', { name: 'Thêm vào bảng…' }), 'Thêm vào bảng…');
    } finally {
      await phone.context().close();
    }

    // Delete: the question names the board and says the items stay; the filter clears and the items are still in the Library.
    await page.goto(`/library?board=${board!.id}`);
    await page.getByRole('button', { name: 'Xoá bảng' }).click();
    const ask = page.getByRole('dialog', { name: `Xoá bảng "${RENAMED}"?` });
    await expect(ask.getByText('Các mục vẫn ở Thư viện.')).toBeVisible();
    await ask.getByRole('button', { name: 'Xoá bảng' }).click();
    await expect(page.locator('.library-active')).toHaveCount(0);
    await expect(boardSelect).toHaveCount(0);
    expect(await boardsNow()).toEqual([]);
    await mineOnly();
    await expect(page.getByRole('article')).toHaveCount(3);
  } finally {
    await other.context().close();
    await dropBoards();
    // Leave nothing behind for the other specs that read the shared Library.
    for (const id of jobs) expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  }
});
