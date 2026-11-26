'use client';
// The Library's boards (lib/library-boards.ts): a member's named, private sets of results. `useLibraryBoards` holds the list the Library filters by, `BoardsModal`
// adds results to boards (from the detail view or the selection bar) and `BoardTools` renames or deletes the open board.
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { api, ApiError, type Clip, errorText, sendJson } from '@/lib/api';
import { BOARD_LIMIT, BOARD_NAME_TAKEN, type LibraryBoard, MAX_BOARD_NAME, MAX_BOARDS } from '@/lib/library-boards';
import { confirmDialog } from './Confirm';
import { Modal } from './Modal';
import s from './LibraryBoards.module.css';

/** The boards of the caller in this workspace (null until loaded) and what changes them; each change reloads the list, so counts and names stay current. */
export function useLibraryBoards() {
  const [boards, setBoards] = useState<LibraryBoard[] | null>(null);
  const reload = useCallback(async () => {
    try {
      setBoards((await api<{ boards: LibraryBoard[] }>('/api/library/boards')).boards);
    } catch {} // the list stays as it was
  }, []);
  useEffect(() => void reload(), [reload]);
  return {
    boards,
    reload,
    create: async (name: string) => {
      const made = await api<LibraryBoard>('/api/library/boards', sendJson('POST', { name }));
      await reload();
      return made;
    },
    rename: async (id: string, name: string) => {
      await api(`/api/library/boards/${id}`, sendJson('PATCH', { name }));
      await reload();
    },
    remove: async (id: string) => {
      await api(`/api/library/boards/${id}`, { method: 'DELETE' });
      await reload();
    },
    setItems: async (id: string, jobIds: string[], inBoard: boolean) => {
      await api(`/api/library/boards/${id}/items`, sendJson('PUT', { jobIds, inBoard }));
      await reload();
    },
  };
}
export type LibraryBoards = ReturnType<typeof useLibraryBoards>;

/** The words for a refused save: the two codes of POST and PATCH, then the server's own reason. */
const saveError = (e: unknown) =>
  e instanceof ApiError && e.code === BOARD_NAME_TAKEN
    ? 'Đã có bảng tên này.'
    : e instanceof ApiError && e.code === BOARD_LIMIT
      ? `Bạn đã có ${MAX_BOARDS} bảng. Hãy xoá bớt trước khi tạo thêm.`
      : errorText(e, 'Không lưu được bảng. Hãy thử lại.');

/** The boards the picked results are on, as a checklist (ticked when every picked result is on the board, mixed when some are), and a field that makes a new board with them. */
export function BoardsModal({ open, onClose, ids, clips, boards, onChange }: { open: boolean; onClose: () => void; ids: string[]; clips: Clip[]; boards: LibraryBoards; onChange: (c: Clip) => void }) {
  const nameId = useId();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const picked = clips.filter((c) => ids.includes(c.id));
  const on = (boardId: string) => picked.filter((c) => c.boardIds?.includes(boardId)).length;

  /** Puts every picked result on the board or takes them all off, then lets the page update each one's `boardIds` (which may drop it from an open board). */
  async function put(boardId: string, inBoard: boolean) {
    await boards.setItems(boardId, ids, inBoard);
    for (const c of picked) onChange({ ...c, boardIds: inBoard ? [...new Set([...(c.boardIds ?? []), boardId])] : (c.boardIds ?? []).filter((b) => b !== boardId) });
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setProblem('');
    try {
      await work();
    } catch (e) {
      setProblem(saveError(e));
    } finally {
      setBusy(false);
    }
  }
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await put((await boards.create(name.trim())).id, true);
      setName('');
    });
  };
  return (
    <Modal open={open} onClose={onClose} label="Thêm vào bảng" className="choice-dialog">
      <h2>Thêm vào bảng</h2>
      {boards.boards !== null && boards.boards.length === 0 && <p className="muted">Chưa có bảng nào. Đặt tên để tạo bảng đầu tiên.</p>}
      {boards.boards !== null && boards.boards.length > 0 && (
        <div className={s.list} role="group" aria-label="Bảng của bạn">
          {boards.boards.map((b) => {
            const n = on(b.id);
            const all = picked.length > 0 && n === picked.length;
            return (
              <label key={b.id} className={`choice ${s.choice}`}>
                <input
                  type="checkbox"
                  checked={all}
                  ref={(box) => {
                    if (box) box.indeterminate = n > 0 && !all;
                  }}
                  disabled={busy || picked.length === 0}
                  onChange={() => void run(() => put(b.id, !all))}
                />
                {b.name} ({b.count})
              </label>
            );
          })}
        </div>
      )}
      <form className={s.create} onSubmit={create}>
        <label className="field-label" htmlFor={nameId}>
          Tên bảng mới
        </label>
        <div className={s.row}>
          <input id={nameId} type="text" maxLength={MAX_BOARD_NAME} placeholder="Ví dụ: Tết 2027 – áo thun" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary" disabled={busy || picked.length === 0 || !name.trim()}>
            Tạo bảng
          </button>
        </div>
      </form>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </Modal>
  );
}

/** The open board's row atop the results: its name and size, and the two ways to change the board itself (the results stay in the Library either way). */
export function BoardTools({ board, boards, onDeleted }: { board: LibraryBoard; boards: LibraryBoards; onDeleted: () => void }) {
  const nameId = useId();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(board.name);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await boards.rename(board.id, name.trim());
      setRenaming(false);
    } catch (err) {
      setProblem(saveError(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!(await confirmDialog({ title: `Xoá bảng "${board.name}"?`, body: 'Các mục vẫn ở Thư viện.', confirmLabel: 'Xoá bảng', danger: true }))) return;
    setProblem('');
    try {
      await boards.remove(board.id);
      onDeleted();
    } catch (err) {
      setProblem(errorText(err, 'Không xoá được bảng. Hãy thử lại.'));
    }
  }
  return (
    <div className={s.tools}>
      <span>
        Bảng: {board.name} · {board.count} mục
      </span>
      <button type="button" className={s.tool} onClick={() => (setName(board.name), setProblem(''), setRenaming(true))}>
        Đổi tên bảng
      </button>
      <button type="button" className={s.tool} onClick={() => void remove()}>
        Xoá bảng
      </button>
      {problem && !renaming && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <Modal open={renaming} onClose={() => setRenaming(false)} label="Đổi tên bảng" className="choice-dialog">
        <h2>Đổi tên bảng</h2>
        <form className={s.create} onSubmit={(e) => void save(e)}>
          <label className="field-label" htmlFor={nameId}>
            Tên bảng
          </label>
          <input id={nameId} type="text" maxLength={MAX_BOARD_NAME} value={name} onChange={(e) => setName(e.target.value)} />
          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
          <div className={s.row}>
            <button type="submit" className="primary" disabled={busy || !name.trim()}>
              Lưu
            </button>
            <button type="button" onClick={() => setRenaming(false)}>
              Huỷ
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
