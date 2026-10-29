'use client';
// Many results at once: the select toggle shows a checkbox per item with an output, and the bar downloads the picked ones as one .zip (POST for a signed link, then the link).
import { type ReactNode, useState } from 'react';
import { api, ApiError, sendJson } from '@/lib/api';

const MAX = 50; // what /api/library/zip takes

export function useZipDownload(): { toggle: ReactNode; bar: ReactNode; check: (id: string, label: string) => ReactNode } {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

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
    toggle: (
      <button type="button" className="zip-toggle" aria-pressed={on} onClick={() => (setOn(!on), setIds([]), setProblem(''))}>
        Chọn
      </button>
    ),
    bar: on && (
      <div className="zip-bar" role="group" aria-label="Tải nhiều mục">
        <span>Đã chọn {ids.length}</span>
        <button type="button" className="link-button" disabled={ids.length === 0 || busy} onClick={() => void download()}>
          Tải xuống .zip
        </button>
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
      </div>
    ),
    check: (id, label) =>
      on && (
        <label className="zip-check">
          <input type="checkbox" checked={ids.includes(id)} onChange={(e) => pick(id, e.target.checked)} aria-label={`Chọn ${label}`} />
        </label>
      ),
  };
}
