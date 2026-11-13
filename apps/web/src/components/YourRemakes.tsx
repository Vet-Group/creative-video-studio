'use client';
// The "your videos" list on the Smart Remake app page: the member's latest remakes of OTHER videos than the one open (the open analysis' RemakePanel lists its own),
// so a result is found again after a reload or after moving on. Each one links back to its analysis and product (?analysis=<id>&product=<id>). Followed every 4 s while one is open.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { confirmDialog } from './Confirm';
import { type RemakeRow, RemakeResult } from './RemakePanel';

const SHOWN = 10;
const POLL_MS = 4000;
const isOpen = (r: RemakeRow) => r.status === 'queued' || r.status === 'running';

/** `exclude`: the analysis on view, whose remakes its own panel shows. `initial` seeds the list, for a render test. */
export function YourRemakes({ slug, exclude, initial = [] }: { slug: string; exclude?: string; initial?: RemakeRow[] }) {
  const [remakes, setRemakes] = useState<RemakeRow[]>(initial);
  const [error, setError] = useState('');

  // Loads the list, then again while one is still open; a failed load only leaves what is shown.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<{ remakes: RemakeRow[] }>('/api/remakes').then(
        (r) => {
          if (!live) return;
          setRemakes(r.remakes);
          if (r.remakes.some(isOpen)) timer = setTimeout(load, POLL_MS);
        },
        () => {},
      );
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  async function remove(r: RemakeRow) {
    if (!(await confirmDialog({ title: 'Xoá video này?', body: 'Video và các clip của lượt làm lại này sẽ mất. Ảnh sản phẩm của bạn vẫn còn.', confirmLabel: 'Xoá', danger: true }))) return;
    setError('');
    try {
      await api(`/api/remakes/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      setRemakes((list) => list.filter((m) => m.id !== r.id));
    } catch (e) {
      setError(errorText(e, 'Không xoá được video này. Hãy thử lại.'));
    }
  }

  const shown = remakes.filter((r) => r.analysisId !== exclude).slice(0, SHOWN);
  if (shown.length === 0) return null;
  return (
    <section className="remake-panel" aria-labelledby="your-remakes">
      <h2 id="your-remakes">Video của bạn</h2>
      <ul className="remake-list">
        {shown.map((r) => (
          <RemakeResult key={r.id} row={r} onDelete={() => void remove(r)}>
            <Link className="link-button" href={`/apps/${slug}?analysis=${encodeURIComponent(r.analysisId)}&product=${encodeURIComponent(r.productAssetId)}`}>
              Mở lại video mẫu này
            </Link>
          </RemakeResult>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
