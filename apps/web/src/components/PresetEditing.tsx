'use client';
// Preset management in Create's preset picker and Image Generation's style picker: a template editor (an Admin, or a user an Admin allowed) edits
// or adds a preset and decides the members' proposals; any other member proposes a change or a new preset, and one editor's approval applies it.
import { useEffect, useId, useState } from 'react';
import { api, ApiError, errorText, sendJson } from '@/lib/api';
import { reloadSamples, useSamples } from '@/lib/use-samples';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useSuggest } from './Suggestions';

/** A preset as GET /api/presets gives it: id and label to a member; prompt, enabled and sortOrder too to an editor. */
export interface PresetRow {
  id: string;
  label: string;
  prompt?: string;
  enabled?: boolean;
  sortOrder?: number;
}

/** What the form works on: a preset, or null for a new one; `propose` for a member, whose change waits for an editor. */
export type PresetDraft = { preset: PresetRow | null; propose: boolean };

export interface Proposal {
  id: string;
  presetId: string | null;
  label: string | null;
  prompt: string | null;
  enabled: boolean | null;
  sortOrder: number | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  proposedBy: string;
  current: { label: string; prompt?: string; enabled: boolean; sortOrder: number } | null;
}

/** The page a preset belongs to (presets.feature): Create's motion presets, or Image Generation's styles, which have an example picture and no clip. */
export type PresetFeature = 'video' | 'image';

/**
 * Edit or add a preset (an editor), or propose either (a member). `onSaved` gets the notice to show once it is done; `onWritten` runs after
 * a preset was saved but its clip or poster was not, so the form stays open on it.
 */
export function PresetForm({ draft, feature = 'video', onClose, onSaved, onWritten }: { draft: PresetDraft | null; feature?: PresetFeature; onClose: () => void; onSaved: (notice: string) => void; onWritten: () => void }) {
  const id = useId();
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [order, setOrder] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The preset as last saved: the draft's, then what a save returned, so a second Save after a failed upload changes it rather than adding another.
  const [preset, setPreset] = useState<PresetRow | null>(null);
  const propose = draft?.propose === true;
  const style = feature === 'image';
  // The prompt-from-video button: a vision LLM reads the preset's saved clip and its answer fills the prompt field; nothing is saved before Save.
  const have = useSamples();
  const fromVideo = useSuggest();
  const [askedFor, setAskedFor] = useState<string | null>(null); // the preset asked about, so a late answer never fills another preset's form
  const clipSaved = preset !== null && have.has(`preset-${preset.id}.mp4`);
  const answer = fromVideo.options[0];
  useEffect(() => {
    if (answer && askedFor !== null && askedFor === preset?.id) setPrompt(answer);
  }, [answer, askedFor, preset?.id]);
  useEffect(() => {
    setAskedFor(null);
    if (!draft) return;
    setPreset(draft.preset);
    setLabel(draft.preset?.label ?? '');
    // A member never sees a preset's prompt (it stays on the server), so a proposed change starts empty and an empty one keeps it.
    setPrompt(draft.propose ? '' : (draft.preset?.prompt ?? ''));
    setOrder(draft.preset?.sortOrder === undefined ? '' : String(draft.preset.sortOrder));
    setEnabled(draft.preset?.enabled ?? true);
    setNote('');
    setVideo(null);
    setPoster(null);
    setError('');
  }, [draft]);

  const editing = draft?.preset != null; // the title and hints follow the draft, not a preset the form has just added
  const title = propose ? (editing ? 'Đề xuất sửa mẫu' : 'Đề xuất mẫu mới') : editing ? 'Sửa mẫu' : 'Thêm mẫu';
  const orderOk = order.trim() === '' ? !(preset && !propose) : Number.isInteger(Number(order));
  const changed = preset ? label.trim() !== preset.label || prompt.trim() !== '' : true;
  const next = { label: label.trim(), prompt: prompt.trim(), enabled, ...(order.trim() !== '' && { sortOrder: Number(order) }) };
  // Only what the editor changed, so an edit another editor made meanwhile to the other fields stays.
  const diff = preset ? Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== preset[k as keyof PresetRow])) : next;
  const dirty = Object.keys(diff).length > 0 || video !== null || poster !== null;
  const ready = label.trim() !== '' && orderOk && (propose ? (preset ? changed : prompt.trim() !== '') : prompt.trim() !== '' && dirty);

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (propose) {
        const change = preset
          ? { presetId: preset.id, ...(label.trim() !== preset.label && { label: label.trim() }), ...(prompt.trim() && { prompt: prompt.trim() }) }
          : { label: label.trim(), prompt: prompt.trim(), feature };
        await api('/api/preset-proposals', sendJson('POST', { ...change, ...(note.trim() && { note: note.trim() }) }));
        return onSaved('Đã gửi đề xuất, chờ người có quyền duyệt.');
      }
      const saved = Object.keys(diff).length === 0 ? preset! : await api<PresetRow>(preset ? `/api/presets/${preset.id}` : '/api/presets', sendJson(preset ? 'PATCH' : 'POST', preset ? diff : { ...diff, feature }));
      setPreset(saved);
      setOrder(String(saved.sortOrder));
      try {
        for (const [file, ext, clear] of [[video, 'mp4', setVideo], [poster, 'jpg', setPoster]] as const) {
          if (!file) continue;
          await api(`/api/admin/samples/preset-${saved.id}.${ext}`, { method: 'PUT', body: file });
          clear(null);
        }
      } catch {
        reloadSamples();
        onWritten();
        return setError(style ? 'Đã lưu mẫu nhưng chưa tải lên được ảnh ví dụ. Bấm Lưu để thử lại.' : 'Đã lưu mẫu nhưng chưa tải lên được video mẫu hoặc ảnh bìa. Bấm Lưu để thử lại.');
      }
      if (video || poster) reloadSamples();
      onSaved(editing ? 'Đã lưu mẫu.' : 'Đã thêm mẫu.');
    } catch (e) {
      setError(errorText(e, propose ? 'Không gửi được đề xuất, hãy thử lại.' : 'Không lưu được mẫu, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={draft !== null} onClose={onClose} label={title} className="choice-dialog preset-form">
      <h2>{title}</h2>
      {propose && <p className="help">Người có quyền biên tập mẫu sẽ duyệt hoặc từ chối đề xuất của bạn.</p>}
      <label className="field-label" htmlFor={`${id}-label`}>
        Tên mẫu
      </label>
      <input id={`${id}-label`} value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} />
      <div className="field-head">
        <label className="field-label" htmlFor={`${id}-prompt`}>
          {`Mô tả ${style ? 'phong cách' : 'chuyển động'}${propose && editing ? ' mới' : ''} (tiếng Anh)`}
        </label>
        {!propose && editing && !style && (
          <button
            type="button"
            className="suggest-button"
            aria-describedby={`${id}-from-video`}
            disabled={fromVideo.busy || !clipSaved || video !== null}
            onClick={() => {
              setAskedFor(preset!.id);
              void fromVideo.run({ field: 'video', preset: preset!.id, text: '' });
            }}
          >
            <Icon name="wand" size={12} />
            {fromVideo.busy ? 'Đang phân tích video…' : 'Gợi ý prompt từ video'}
          </button>
        )}
      </div>
      <textarea id={`${id}-prompt`} rows={4} value={prompt} placeholder={propose && editing ? 'Để trống nếu giữ nguyên mô tả hiện tại' : undefined} onChange={(e) => setPrompt(e.target.value)} />
      {!propose && editing && !style && (
        <p className="help" id={`${id}-from-video`}>
          {!clipSaved
            ? 'Mẫu này chưa có video mẫu để gợi ý mô tả.'
            : video !== null
              ? 'Bấm Lưu để tải video mới lên trước khi gợi ý từ video.'
              : 'AI xem video mẫu đã lưu và điền mô tả, có thể mất vài chục giây. Mô tả chỉ được lưu khi bạn bấm Lưu.'}
        </p>
      )}
      {fromVideo.error && askedFor !== null && (
        <p className="error" role="alert">
          {fromVideo.error}
        </p>
      )}
      {propose ? (
        <>
          <label className="field-label" htmlFor={`${id}-note`}>
            Ghi chú (không bắt buộc)
          </label>
          <textarea id={`${id}-note`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      ) : (
        <>
          <label className="field-label" htmlFor={`${id}-order`}>
            Thứ tự
          </label>
          <input id={`${id}-order`} inputMode="numeric" value={order} placeholder={editing ? undefined : 'Để trống: xếp cuối'} onChange={(e) => setOrder(e.target.value)} />
          <label className="template-share">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Đang bật
          </label>
          {!style && (
            <>
              <label className="field-label" htmlFor={`${id}-video`}>
                Thay video mẫu (MP4)
              </label>
              <input id={`${id}-video`} type="file" accept="video/mp4" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
            </>
          )}
          <label className="field-label" htmlFor={`${id}-poster`}>
            {style ? 'Thay ảnh ví dụ (JPG)' : 'Thay ảnh bìa (JPG)'}
          </label>
          <input id={`${id}-poster`} type="file" accept="image/jpeg" onChange={(e) => setPoster(e.target.files?.[0] ?? null)} />
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="primary" disabled={busy || !ready} onClick={() => void save()}>
        {propose ? 'Gửi đề xuất' : 'Lưu'}
      </button>
    </Modal>
  );
}

/** The pending proposals for an editor, each with the preset's values now beside the proposed ones, approved or rejected one at a time. */
export function PendingProposals({ open, proposals, feature = 'video', onClose, onDecided }: { open: boolean; proposals: Proposal[] | null; feature?: PresetFeature; onClose: () => void; onDecided: (notice: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) setError('');
  }, [open]);
  async function decide(p: Proposal, approve: boolean) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/preset-proposals/${p.id}/decision`, sendJson('POST', { approve }));
      onDecided(approve ? 'Đã duyệt đề xuất.' : 'Đã từ chối đề xuất.');
    } catch (e) {
      // A 409 says why (decided by someone else, or the preset was edited since the proposal) and the list is read again.
      const conflict = e instanceof ApiError && e.status === 409;
      setError(conflict ? e.message : errorText(e, 'Không lưu được quyết định, hãy thử lại.'));
      if (conflict) onDecided(null);
    } finally {
      setBusy(false);
    }
  }
  const rows = (p: Proposal) =>
    [
      ['Tên mẫu', p.current?.label, p.label],
      [feature === 'image' ? 'Mô tả phong cách' : 'Mô tả chuyển động', p.current?.prompt, p.prompt],
      ['Thứ tự', p.current?.sortOrder, p.sortOrder],
      ['Trạng thái', p.current && (p.current.enabled ? 'Đang bật' : 'Đang tắt'), p.enabled === null ? null : p.enabled ? 'Đang bật' : 'Đang tắt'],
    ].filter(([, , next]) => next !== null) as [string, string | number | undefined, string | number][];
  return (
    <Modal open={open} onClose={onClose} label="Đề xuất chờ duyệt" className="choice-dialog preset-proposals">
      <h2>Đề xuất chờ duyệt</h2>
      {proposals === null ? (
        <p role="status">Đang tải...</p>
      ) : proposals.length === 0 ? (
        <p>Không có đề xuất nào chờ duyệt.</p>
      ) : (
        <ul className="proposal-list">
          {proposals.map((p) => (
            <li key={p.id} aria-label={`Đề xuất của ${p.proposedBy}`}>
              <p>
                <strong>{p.presetId ? `Sửa mẫu "${p.current?.label}"` : 'Mẫu mới'}</strong> · {p.proposedBy}
              </p>
              <dl>
                {rows(p).map(([name, now, next]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                      {p.presetId && <del>{now}</del>}
                      <ins>{next}</ins>
                    </dd>
                  </div>
                ))}
              </dl>
              {p.note && <p className="help">Ghi chú: {p.note}</p>}
              <div className="actions">
                <button type="button" className="primary" disabled={busy} onClick={() => void decide(p, true)}>
                  Duyệt
                </button>
                <button type="button" disabled={busy} onClick={() => void decide(p, false)}>
                  Từ chối
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** The pending proposals of one picker an editor decides, oldest first, from GET /api/preset-proposals (which also lists the caller's own decided ones), and how many wait in all. */
export async function loadPending(feature: PresetFeature = 'video'): Promise<{ list: Proposal[]; count: number }> {
  const r = await api<{ proposals: Proposal[]; pendingCount: number }>(`/api/preset-proposals?feature=${feature}`);
  return { list: r.proposals.filter((p) => p.status === 'pending'), count: r.pendingCount };
}
