'use client';
// Shared reference videos for Smart Remake: the shelf of analyses an Admin shared (GET /api/analyses?shared=1), where picking one opens its finished
// analysis so a member only adds their product and picks scenes, and the Admin's control on an analysis result that shares or unshares it.
import { useEffect, useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import type { AnalysisRow } from './AnalyzeView';
import { Icon } from './Icon';
import { Modal } from './Modal';

/** One card of the shelf, as the shared list gives it. */
export interface SharedVideo {
  id: string;
  title: string;
  sharedAt: string;
  sourceAssetId: string | null;
  durationS: number | null;
  sceneCount: number;
}

const MAX_TITLE = 80;

/** The shelf: nothing while none is shared or the list does not load. `onPick` gets the whole analysis; `initial` seeds the list, for a render test. */
export function SharedVideos({ busy, currentId, onPick, initial = [] }: { busy: boolean; currentId?: string; onPick: (row: AnalysisRow) => void; initial?: SharedVideo[] }) {
  const [items, setItems] = useState<SharedVideo[]>(initial);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void api<{ analyses: SharedVideo[] }>('/api/analyses?shared=1').then(
      (r) => live && setItems(r.analyses),
      () => {}, // no shelf: the member uploads a video as before
    );
    return () => {
      live = false;
    };
  }, []);

  async function open(id: string) {
    setError('');
    setOpening(true);
    try {
      onPick(await api<AnalysisRow>(`/api/analyses/${encodeURIComponent(id)}`));
    } catch (e) {
      setError(errorText(e, 'Không mở được video mẫu này. Hãy thử lại.'));
    } finally {
      setOpening(false);
    }
  }

  if (items.length === 0) return null;
  return (
    <section className="field" aria-labelledby="shared-videos">
      <h2 id="shared-videos" className="field-label">
        Video mẫu
      </h2>
      <p className="help">Chọn một video mẫu, thêm ảnh sản phẩm của bạn, AI sẽ thay sản phẩm vào các cảnh đã chọn.</p>
      <ul className="analysis-list">
        {items.map((v) => (
          <li key={v.id} className="analysis-item">
            <button type="button" className="analysis-card" aria-current={v.id === currentId ? 'true' : undefined} disabled={busy || opening} onClick={() => void open(v.id)}>
              <span className="analysis-poster" aria-hidden="true">
                {v.sourceAssetId ? <video src={`/api/assets/${v.sourceAssetId}/content#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} /> : <Icon name="film" size={20} />}
              </span>
              <span className="analysis-card-body">
                <strong>{v.title}</strong>
                <span className="muted">
                  {v.durationS ? `${v.durationS.toFixed(1)} giây · ` : ''}
                  {v.sceneCount} cảnh
                </span>
              </span>
            </button>
          </li>
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

/** An Admin's share control on a finished analysis: share it under a title (prefilled from the video's file name), or take it off the shelf. `onSaved` gets the saved title, null once unshared. */
export function ShareControl({ row, onSaved }: { row: AnalysisRow; onSaved: (sharedTitle: string | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // the dialog's title while it is open
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputId = useId();

  async function start() {
    setError('');
    const name = row.sourceAssetId ? await api<{ filename: string }>(`/api/assets/${row.sourceAssetId}`).then((a) => a.filename.replace(/\.[^.]+$/, ''), () => '') : '';
    setDraft(name.slice(0, MAX_TITLE));
  }

  async function save(title: string | null) {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ sharedTitle: string | null }>(`/api/analyses/${encodeURIComponent(row.id)}/share`, title === null ? { method: 'DELETE' } : sendJson('PUT', { title }));
      setDraft(null);
      onSaved(r.sharedTitle);
    } catch (e) {
      setError(errorText(e, title === null ? 'Không gỡ được video mẫu. Hãy thử lại.' : 'Không chia sẻ được video mẫu. Hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  const failed = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );
  return (
    <div>
      <p className="analysis-script-actions">
        {row.sharedTitle ? (
          <>
            <span className="muted">
              Video mẫu cho mọi người: <strong>{row.sharedTitle}</strong>
            </span>
            <button type="button" className="link-button" disabled={busy} onClick={() => void save(null)}>
              Gỡ khỏi video mẫu
            </button>
          </>
        ) : (
          <button type="button" className="link-button" disabled={busy} onClick={() => void start()}>
            Chia sẻ làm video mẫu…
          </button>
        )}
      </p>
      {draft === null && failed}
      <Modal open={draft !== null} onClose={() => setDraft(null)} label="Chia sẻ làm video mẫu" className="choice-dialog">
        <h2>Chia sẻ làm video mẫu</h2>
        <label className="field-label" htmlFor={inputId}>
          Tên video mẫu
        </label>
        <input id={inputId} value={draft ?? ''} maxLength={MAX_TITLE} onChange={(e) => setDraft(e.target.value)} />
        <p className="help">Mọi thành viên sẽ thấy video này trong mục Video mẫu của Smart Remake và dùng nó với ảnh sản phẩm của họ.</p>
        {draft !== null && failed}
        <button type="button" className="primary" disabled={busy || !draft?.trim()} onClick={() => void save(draft!.trim())}>
          Chia sẻ
        </button>
      </Modal>
    </div>
  );
}
