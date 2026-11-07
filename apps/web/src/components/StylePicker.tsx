'use client';
// Image Generation's style presets (presets.feature `image`), managed as Create's motion presets are: a chip in the prompt bar shows the chosen style
// and opens the picker (as Create's) of cards with each style's example picture (samples/preset-<id>.jpg, uploaded by an editor; a placeholder until
// then). Template editors edit and add styles there and decide proposals; other members propose (PresetEditing.tsx). A member never reads a
// style's prompt: Run sends its id and the server adds the prompt to the member's own.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSamples, versionedSample } from '@/lib/use-samples';
import { Icon } from './Icon';
import { useJobs } from './jobs';
import { Modal } from './Modal';
import { loadPending, PendingProposals, type PresetDraft, PresetForm, type PresetRow, type Proposal } from './PresetEditing';

/** `value` is the chosen style's id, '' for none; a style switched off (or unknown, as from an old reuse link) falls back to none. */
export function StylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { notify } = useJobs();
  const [styles, setStyles] = useState<PresetRow[] | null>(null); // the enabled styles, which a Run may use
  const [editable, setEditable] = useState<PresetRow[] | null>(null); // a template editor's view: switched-off styles too
  const [canEdit, setCanEdit] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [pending, setPending] = useState<{ list: Proposal[]; count: number } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const have = useSamples();

  const load = () =>
    api<{ presets: PresetRow[]; canEdit: boolean }>('/api/presets?feature=image').then(
      (r) => {
        setStyles(r.presets.filter((p) => p.enabled !== false));
        setEditable(r.canEdit ? r.presets : null);
        setCanEdit(r.canEdit);
      },
      () => setStyles([]),
    );
  useEffect(() => void load(), []);
  useEffect(() => {
    if (styles && value && !styles.some((p) => p.id === value)) onChange('');
  }, [styles, value]);
  // An editor sees how many proposals wait each time the picker opens.
  useEffect(() => {
    if (!picking || !canEdit) return;
    let stale = false;
    loadPending('image').then(
      (p) => !stale && setPending(p),
      () => !stale && setPending({ list: [], count: 0 }),
    );
    return () => {
      stale = true;
    };
  }, [picking, canEdit]);

  const picture = (id: string) => (have.has(`preset-${id}.jpg`) ? versionedSample(`/api/samples/preset-${id}.jpg`) : null);
  const current = styles?.find((p) => p.id === value);
  const shown = current && picture(current.id);
  const pick = (id: string) => {
    onChange(id);
    setPicking(false);
  };

  return (
    <>
      <button type="button" className="select-trigger style-pill" data-on={value !== ''} aria-haspopup="dialog" onClick={() => setPicking(true)}>
        {shown ? <img src={shown} alt="" width={20} height={20} /> : <Icon name="image" />}
        <span data-value={value}>
          {current ? <span className="sr-only">Phong cách: </span> : null}
          {current?.label ?? 'Phong cách'}
        </span>
      </button>

      <Modal open={picking} onClose={() => setPicking(false)} label="Chọn phong cách">
        <h2>Chọn phong cách</h2>
        <p className="modal-sub">Mỗi phong cách được thêm vào mô tả của bạn khi tạo ảnh. Chọn một phong cách hoặc không dùng phong cách nào.</p>
        <ul className="preset-grid" aria-label="Danh sách phong cách">
          <li className="preset-card">
            <div className="banner-empty" />
            <button type="button" data-value="" aria-pressed={value === ''} onClick={() => pick('')}>
              Không dùng phong cách
            </button>
          </li>
          {(editable ?? styles)?.map((p) => {
            const src = picture(p.id);
            const off = p.enabled === false; // shown to an editor only, who can switch it back on
            return (
              <li key={p.id} className={off ? 'preset-card off' : 'preset-card'}>
                {src ? <img src={src} alt="" /> : <div className="banner-empty" />}
                {off ? (
                  <span className="preset-name">
                    {p.label}
                    <span className="tag">Đang tắt</span>
                  </span>
                ) : (
                  <button type="button" data-value={p.id} aria-pressed={p.id === value} onClick={() => pick(p.id)}>
                    {p.label}
                  </button>
                )}
                <button type="button" className="preset-edit" aria-label={canEdit ? `Sửa phong cách ${p.label}` : `Đề xuất sửa phong cách ${p.label}`} onClick={() => setDraft({ preset: p, propose: !canEdit })}>
                  {canEdit ? 'Sửa' : 'Đề xuất sửa'}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="preset-actions">
          <button type="button" className="link-button" onClick={() => setDraft({ preset: null, propose: !canEdit })}>
            {canEdit ? 'Thêm phong cách' : 'Đề xuất phong cách mới'}
          </button>
          {canEdit && (
            <button type="button" className="link-button" onClick={() => setReviewing(true)}>
              Chờ duyệt ({pending?.count ?? 0})
            </button>
          )}
        </div>
      </Modal>
      <PresetForm
        draft={draft}
        feature="image"
        onClose={() => setDraft(null)}
        onSaved={(text) => {
          setDraft(null);
          notify(text);
          void load();
        }}
        onWritten={() => void load()}
      />
      <PendingProposals
        open={reviewing}
        proposals={pending?.list ?? null}
        feature="image"
        onClose={() => setReviewing(false)}
        onDecided={(text) => {
          if (text) notify(text);
          void load();
          void loadPending('image').then(setPending, () => setPending({ list: [], count: 0 }));
        }}
      />
    </>
  );
}
