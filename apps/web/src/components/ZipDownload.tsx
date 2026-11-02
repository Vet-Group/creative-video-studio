'use client';
// Many results at once: the select toggle shows a checkbox per item with an output, and the bar downloads the picked ones as one .zip (POST for a signed link, then the link).
// With `hover` (the Library) every item has its checkbox, shown on hover or focus by CSS; picking one starts the selection, and Esc or the clear button ends it.
import { type ReactNode, useEffect, useState } from 'react';
import { api, ApiError, sendJson } from '@/lib/api';
import { Icon } from './Icon';

const MAX = 50; // what /api/library/zip takes

export function useZipDownload({ hover = false } = {}): { active: boolean; toggle: ReactNode; bar: ReactNode; check: (id: string, label: string) => ReactNode } {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const active = on || ids.length > 0;
  const clear = () => (setOn(false), setIds([]), setProblem(''));

  useEffect(() => {
    if (!hover || !active) return;
    // An open dialog (the detail view) takes Esc for itself.
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && clear();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [hover, active]);

  function pick(id: string, yes: boolean) {
    setProblem('');
    if (yes && ids.length >= MAX) return setProblem(`Tối đa ${MAX} mục mỗi lần tải.`);
    setIds((cur) => (yes ? [...cur, id] : cur.filter((x) => x !== id)));
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
          <input type="checkbox" checked={ids.includes(id)} onChange={(e) => pick(id, e.target.checked)} aria-label={`Chọn ${label}`} />
        </label>
      ),
  };
}
