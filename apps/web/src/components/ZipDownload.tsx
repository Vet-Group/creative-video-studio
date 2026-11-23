'use client';
// Many results at once: the select toggle shows a checkbox per item with an output, and the bar downloads the picked ones as one .zip (POST for a signed link, then the link).
// With `hover` (the Library) every item has its checkbox, shown on hover or focus by CSS; picking one starts the selection, and Esc or the clear button ends it.
// `flip` picks or drops an item from elsewhere than its checkbox (the Library's picture, while a selection is on); `pickMany` and `dropMany` take several (History's batch, a Library day).
// `actions` adds the page's own controls for the picked ids to the bar (the Library's marks and store).
// Shift with a click (on a checkbox, or on a Library picture while selecting) picks or drops every item between it and the one clicked before, in page order.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { api, ApiError, sendJson } from '@/lib/api';
import { Icon } from './Icon';

const MAX = 50; // what /api/library/zip takes

/** The ids from `anchor` to `id` in `order` (both ends included, either direction), or just `id` when either is not in it. */
export function span(order: string[], anchor: string | null, id: string): string[] {
  const a = anchor === null ? -1 : order.indexOf(anchor);
  const b = order.indexOf(id);
  return a < 0 || b < 0 ? [id] : order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export function useZipDownload({ hover = false, actions }: { hover?: boolean; actions?: (ids: string[]) => ReactNode } = {}): {
  active: boolean;
  ids: string[];
  toggle: ReactNode;
  bar: ReactNode;
  check: (id: string, label: string) => ReactNode;
  flip: (id: string) => void;
  pickMany: (many: string[]) => void;
  dropMany: (many: string[]) => void;
} {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const active = on || ids.length > 0;
  const clear = () => (setOn(false), setIds([]), setProblem(''));
  const anchor = useRef<string | null>(null); // the item the last single pick or drop was on
  const shift = useRef(false); // whether that click held Shift; read in the capture phase, before the checkbox or picture handles it

  useEffect(() => {
    const read = (e: MouseEvent) => {
      shift.current = e.shiftKey;
      if (e.shiftKey && active) window.getSelection()?.removeAllRanges(); // a Shift click also selects the text between, which is not what was meant
    };
    document.addEventListener('click', read, true);
    return () => document.removeEventListener('click', read, true);
  }, [active]);

  useEffect(() => {
    if (!hover || !active) return;
    // An open dialog (the detail view) takes Esc for itself.
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && clear();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [hover, active]);

  function pick(id: string, yes: boolean) {
    setProblem('');
    // The page order is the checkboxes' order in the document, so the Library and History need not pass their lists.
    const order = shift.current ? [...document.querySelectorAll<HTMLInputElement>('input[data-zip-id]')].map((el) => el.dataset.zipId!) : [];
    const many = span(order, anchor.current, id);
    anchor.current = id;
    if (yes && new Set([...ids, ...many]).size > MAX) setProblem(`Tối đa ${MAX} mục mỗi lần tải.`);
    if (yes && ids.length >= MAX) return;
    setIds((cur) => (yes ? [...new Set([...cur, ...many])].slice(0, MAX) : cur.filter((x) => !many.includes(x))));
  }

  async function download() {
    setProblem('');
    setBusy(true);
    try {
      const { downloadUrl } = await api<{ downloadUrl: string }>('/api/library/zip', sendJson('POST', { ids }));
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = ''; // a late refusal saves a small file instead of leaving the page and its form
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setProblem(status === 403 ? 'Có mục đã bị xoá hoặc không tải được. Hãy bỏ chọn mục đó.' : status === 413 ? 'Các mục chọn quá lớn cho một tệp .zip, hãy chọn ít hơn.' : 'Không tải xuống được.');
    } finally {
      setBusy(false);
    }
  }

  return {
    active,
    ids,
    toggle: (
      <button type="button" className="zip-toggle" aria-pressed={active} onClick={() => (active ? clear() : setOn(true))}>
        Chọn
      </button>
    ),
    bar: active && (
      <div className={hover ? 'zip-bar zip-float' : 'zip-bar'} role="group" aria-label="Tải nhiều mục">
        <span aria-live="polite">Đã chọn {ids.length}</span>
        <button type="button" className={hover ? 'primary' : 'link-button'} disabled={ids.length === 0 || busy} onClick={() => void download()}>
          {hover && <Icon name="download" />}
          Tải xuống .zip
        </button>
        {ids.length > 0 && actions?.(ids)}
        {hover && (
          <button type="button" className="zip-clear" onClick={clear}>
            Bỏ chọn
          </button>
        )}
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
      </div>
    ),
    check: (id, label) =>
      (on || hover) && (
        <label className="zip-check">
          <input type="checkbox" data-zip-id={id} checked={ids.includes(id)} onChange={(e) => pick(id, e.target.checked)} aria-label={`Chọn ${label}`} />
        </label>
      ),
    flip: (id) => pick(id, !ids.includes(id)),
    // Several at once (History's "Chọn cả lô", a Library day): the checkboxes show, and the ones already picked stay.
    pickMany: (many) => (setProblem(new Set([...ids, ...many]).size > MAX ? `Tối đa ${MAX} mục mỗi lần tải.` : ''), setOn(true), setIds((cur) => [...new Set([...cur, ...many])].slice(0, MAX))),
    dropMany: (many) => (setProblem(''), setIds((cur) => cur.filter((x) => !many.includes(x)))),
  };
}
