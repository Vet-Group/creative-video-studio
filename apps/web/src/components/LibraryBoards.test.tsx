import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Clip } from '@/lib/api';
import { MAX_BOARD_NAME } from '@/lib/library-boards';
import { BoardsModal, BoardTools, type LibraryBoards } from './LibraryBoards';

const none = async () => undefined;
const hook = (boards: LibraryBoards['boards']): LibraryBoards => ({ boards, reload: none, create: async () => ({ id: 'new', name: 'x', count: 0 }), rename: none, remove: none, setItems: none });
const clip = (id: string, boardIds: string[]): Clip =>
  ({ id, creator: { id: 'u1', name: 'An' }, createdAt: '2026-11-14T00:00:00Z', modelId: 'm', modelLabel: 'Model', ratio: '9:16', durationSec: 5, feature: 'video', mediaType: 'video', resolution: null, isMock: false, videoAssetId: `${id}-v`, posterAssetId: null, storeId: null, storeName: null, costUsd: null, costFinal: true, verdict: null, favorite: false, boardIds, example: false, productType: null, prompt: null, canEdit: true, mine: true, downloadName: 'out' }) as Clip;
const modal = (boards: LibraryBoards['boards'], ids: string[], clips: Clip[], open = true) =>
  renderToStaticMarkup(<BoardsModal open={open} onClose={none} ids={ids} clips={clips} boards={hook(boards)} onChange={none} />);

const BOARDS = [
  { id: 'b1', name: 'Tết 2027', count: 3 },
  { id: 'b2', name: 'Áo thun', count: 0 },
];

test('the boards dialog lists a checkbox per board with its count, ticked when every picked item is on it, and the create field', () => {
  const html = modal(BOARDS, ['c1'], [clip('c1', ['b1'])]);
  expect(html).toContain('aria-label="Thêm vào bảng"');
  expect(html).toMatch(/<label class="choice [^"]*"><input type="checkbox" checked=""[^>]*\/>Tết 2027 \(3\)<\/label>/);
  expect(html).toMatch(/<label class="choice [^"]*"><input type="checkbox"(?![^>]*checked)[^>]*\/>Áo thun \(0\)<\/label>/);
  expect(html).toContain(`maxLength="${MAX_BOARD_NAME}"`);
  expect(html).toContain('placeholder="Ví dụ: Tết 2027 – áo thun"');
  expect(html).toContain('Tên bảng mới');
  expect(html).toContain('>Tạo bảng</button>');
});

test('a board is ticked only when every picked item is on it, and nothing is ticked for an empty selection', () => {
  const clips = [clip('c1', ['b1']), clip('c2', [])];
  const ticked = (html: string) => (html.match(/checked=""/g) ?? []).length;
  expect(ticked(modal(BOARDS, ['c1', 'c2'], clips))).toBe(0); // mixed: c1 only
  expect(ticked(modal(BOARDS, ['c1'], clips))).toBe(1);
  expect(ticked(modal(BOARDS, [], clips))).toBe(0);
  expect(modal(BOARDS, [], clips)).toMatch(/<button type="submit" class="primary" disabled="">Tạo bảng/); // nothing to add to a new board either
});

test('with no board yet the dialog says so, and while the boards load or when closed it shows no list', () => {
  expect(modal([], ['c1'], [clip('c1', [])])).toContain('Chưa có bảng nào. Đặt tên để tạo bảng đầu tiên.');
  expect(modal(null, ['c1'], [clip('c1', [])])).not.toContain('Chưa có bảng nào');
  expect(modal(BOARDS, ['c1'], [clip('c1', [])], false)).not.toContain('Tết 2027');
});

test('the open board’s row reads its name and size, with the rename and delete buttons', () => {
  const html = renderToStaticMarkup(<BoardTools board={BOARDS[0]!} boards={hook(BOARDS)} onDeleted={none} />);
  expect(html).toContain('Bảng: Tết 2027 · 3 mục');
  expect(html).toContain('>Đổi tên bảng</button>');
  expect(html).toContain('>Xoá bảng</button>');
});
