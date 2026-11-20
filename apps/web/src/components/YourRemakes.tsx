'use client';
// The "your videos" list on the Smart Remake app page: the member's latest remakes of OTHER videos than the one open (the open analysis' RemakePanel lists its own),
// so a result is found again after a reload or after moving on. Each one links back to its analysis and product (?analysis=<id>&product=<id>). Followed every 4 s while one is open.
import type { Analysis } from '@cvs/core/analysis/breakdown';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import type { AnalysisRow } from './AnalyzeView';
import { confirmDialog } from './Confirm';
import { LoadError } from './LoadError';
import { type RemakeRow, RemakeResult } from './RemakePanel';

const SHOWN = 10;
const POLL_MS = 4000;
const isOpen = (r: RemakeRow) => r.status === 'queued' || r.status === 'running';

/** `exclude`: the analysis on view, whose remakes its own panel shows. `initial` seeds the list as loaded, for a render test. */
export function YourRemakes({ slug, exclude, initial }: { slug: string; exclude?: string; initial?: RemakeRow[] }) {
  const [remakes, setRemakes] = useState<RemakeRow[]>(initial ?? []);
  const [error, setError] = useState('');
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(initial ? 'loaded' : 'loading');
  const [tries, setTries] = useState(0); // bumped by the load error's retry
  const [analyses, setAnalyses] = useState<Record<string, Analysis | null>>({}); // an open remake's analysis, for the same time left as its own panel shows

  // Loads the list, then again while one is still open; a failed load leaves what is shown, or says so when nothing is.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<{ remakes: RemakeRow[] }>('/api/remakes').then(
        (r) => {
          if (!live) return;
          setRemakes(r.remakes);
          setState('loaded');
          if (r.remakes.some(isOpen)) timer = setTimeout(load, POLL_MS);
        },
        () => live && setState((s) => (s === 'loaded' ? s : 'failed')),
      );
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [tries]);

  // Each open remake's analysis, read once.
  useEffect(() => {
    for (const id of new Set(remakes.filter(isOpen).map((r) => r.analysisId))) {
      if (id in analyses) continue;
      setAnalyses((a) => ({ ...a, [id]: null }));
      api<AnalysisRow>(`/api/analyses/${encodeURIComponent(id)}`).then(
        (row) => setAnalyses((a) => ({ ...a, [id]: row.result })),
        () => {}, // the time left falls back to a rough one
      );
    }
  }, [remakes]);

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

  const all = remakes.filter((r) => r.analysisId !== exclude);
  const shown = all.slice(0, SHOWN);
  if (shown.length === 0 && state === 'loaded') return null;
  return (
    <section className="remake-panel" aria-labelledby="your-remakes">
      <h2 id="your-remakes">Video của bạn</h2>
      {shown.length === 0 &&
        (state === 'failed' ? (
          <LoadError text="Không tải được video của bạn." onRetry={() => (setState('loading'), setTries((n) => n + 1))} />
        ) : (
          <p className="muted" role="status">
            Đang tải…
          </p>
        ))}
      <ul className="remake-list">
        {shown.map((r) => (
          <RemakeResult key={r.id} row={r} analysis={analyses[r.analysisId]} onDelete={() => void remove(r)}>
            <Link className="link-button" href={`/apps/${slug}?analysis=${encodeURIComponent(r.analysisId)}${r.productAssetId ? `&product=${encodeURIComponent(r.productAssetId)}` : ''}`}>
              Mở lại video mẫu này
            </Link>
          </RemakeResult>
        ))}
      </ul>
      {all.length > SHOWN && <p className="muted">Chỉ hiện {SHOWN} video mới nhất.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
